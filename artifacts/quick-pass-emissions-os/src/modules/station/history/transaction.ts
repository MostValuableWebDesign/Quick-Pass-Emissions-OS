import { db } from "@/lib/db";
import { audit, requireRule, type Tx } from "../../phase2";
import { stationConfig } from "../service";
export { audit };
export function configuredStation() {
  try {
    return stationConfig();
  } catch {
    return null;
  }
}
export async function authorizedStations(tx: Tx) {
  const registered = await tx.analyticsStation.findMany({
    select: { name: true, stationHash: true },
  });
  const configured = configuredStation();
  if (configured && !registered.some((s) => s.stationHash === configured.hash))
    registered.unshift({ name: configured.station, stationHash: configured.hash });
  return registered
    .map((s) => ({ ...s, portal: s.stationHash === configured?.hash }))
    .sort((a, b) => Number(b.portal) - Number(a.portal) || a.name.localeCompare(b.name));
}
export async function checkStations(tx: Tx, hashes: string[]) {
  const available = await authorizedStations(tx);
  requireRule(
    hashes.length > 0 &&
      new Set(hashes).size === hashes.length &&
      hashes.every((h) => available.some((s) => s.stationHash === h)),
    "Choose only registered, authorized stations.",
  );
  return available;
}
// Same lock order as existing personnel/station mutations. No provider work under these locks.
export function historyTransaction<T>(actorId: string, work: (tx: Tx) => Promise<T>) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183507)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183510)`;
      const actor = await tx.user.findUnique({ where: { id: actorId } });
      requireRule(
        actor?.active && actor.role === "OWNER",
        "Active owner access is required for inspection history.",
      );
      return work(tx);
    },
    { maxWait: 10000, timeout: 30000 },
  );
}
export async function databaseNow(tx: Tx) {
  return (await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0].now;
}
