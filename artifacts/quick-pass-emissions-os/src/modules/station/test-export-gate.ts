import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { audit, requireRule, type Tx } from "../phase2";
import { stationConfig, stationTransaction } from "./service";

export const TEST_EXPORT_COOLDOWN_MS = 60_000;
export const TEST_EXPORT_FAILURE_COOLDOWN_MS = 5 * 60_000;
export const TEST_EXPORT_RUN_MS = 45_000;
// Longer than the hard network deadline; an abandoned process cannot reserve a station forever.
export const TEST_EXPORT_LEASE_MS = 120_000;
export type TestExportRun = {
  station: string;
  hash: string;
  token: string;
  signal: AbortSignal;
};

async function databaseTime(tx: Tx) {
  const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  return row.now;
}

export async function requireActiveTestExport(tx: Tx, hash: string, run: TestExportRun) {
  requireRule(hash === run.hash, "Station configuration changed. Refresh to try again.");
  const now = await databaseTime(tx);
  const state = await tx.stationTestExportState.findUnique({ where: { stationHash: hash } });
  requireRule(
    !run.signal.aborted &&
      state?.activeToken === run.token &&
      state.activeUntil &&
      state.activeUntil > now,
    "Station test export timed out or its reservation ended. Saved data is still available.",
  );
}

/** A short claim transaction, bounded network work, then token-checked cleanup. No network under DB locks. */
export async function withStationTestExport<T>(
  actorId: string,
  kind: "PERFORMANCE" | "DAILY_COUNT" | "HISTORY",
  work: (run: TestExportRun) => Promise<T>,
): Promise<T> {
  const config = stationConfig();
  const token = randomUUID();
  await stationTransaction(actorId, async (tx, hash) => {
    requireRule(hash === config.hash, "Station configuration changed. Refresh to try again.");
    const now = await databaseTime(tx);
    const state = await tx.stationTestExportState.findUnique({ where: { stationHash: hash } });
    requireRule(
      !state?.activeUntil || state.activeUntil <= now,
      "A station test export is already running. Saved data is still available.",
    );
    const wait = state ? state.cooldownUntil.getTime() - now.getTime() : 0;
    requireRule(
      wait <= 0,
      `Station test exports are cooling down. Try again in ${Math.ceil(wait / 1000)} seconds. Saved data is still available.`,
    );
    const active = {
      activeToken: token,
      activeUntil: new Date(now.getTime() + TEST_EXPORT_LEASE_MS),
    };
    await tx.stationTestExportState.upsert({
      where: { stationHash: hash },
      create: { stationHash: hash, cooldownUntil: new Date(0), ...active },
      update: active,
    });
    await audit(tx, actorId, "STATION_TEST_EXPORT_STARTED", hash, { kind });
  });
  const run = { ...config, token, signal: AbortSignal.timeout(TEST_EXPORT_RUN_MS) };
  let failed = true;
  try {
    const result = await work(run);
    failed = false;
    return result;
  } finally {
    // Cleanup still runs after deactivation/config changes, but cannot release another run's token.
    await db.$transaction(async (tx) => {
      const now = await databaseTime(tx);
      const result = await tx.stationTestExportState.updateMany({
        where: { stationHash: run.hash, activeToken: token },
        data: {
          activeToken: null,
          activeUntil: null,
          cooldownUntil: new Date(
            now.getTime() + (failed ? TEST_EXPORT_FAILURE_COOLDOWN_MS : TEST_EXPORT_COOLDOWN_MS),
          ),
        },
      });
      if (result.count)
        await audit(tx, actorId, "STATION_TEST_EXPORT_FINISHED", run.hash, { kind, failed });
    });
  }
}
