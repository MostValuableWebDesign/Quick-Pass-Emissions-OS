import { db } from "../src/lib/db";
import { businessDate } from "../src/lib/time";
import { audit, BusinessError, requireRule } from "../src/modules/phase2";
import {
  PortalSession,
  portalSearch,
  portalHistoryExport,
} from "../src/modules/station/portal-client";
import { stationHistoryAvailability } from "../src/modules/station/history-availability";
import { columns, inspectionDate } from "../src/modules/station/history/rules";
import { HISTORY_START_ACTION, emptyHistoryCovers } from "../src/modules/station/history-boundary";
import { range } from "../src/modules/station/report";
import { stationTransaction } from "../src/modules/station/service";
import {
  withStationTestExport,
  requireActiveTestExport,
} from "../src/modules/station/test-export-gate";

/** Owner-requested metadata lookup only. No original rows, cookies or credentials are logged. */
async function main() {
  const args = process.argv.slice(2);
  const waitForGate = args.includes("--wait");
  if (waitForGate) args.splice(args.indexOf("--wait"), 1);
  const verifyStart = args[0] === "--verify-start";
  if (verifyStart) args.shift();
  const windows = args.map((arg) => {
    const [start, end] = arg.split(":");
    range(start, end);
    requireRule(start >= "2000-01-01" && end <= businessDate(), "Invalid history-check dates.");
    return { start, end };
  });
  requireRule(windows.length > 0 && windows.length <= 3, "Supply one to three bounded windows.");
  requireRule(
    !verifyStart || windows.length === 1,
    "Verify one earliest-activity window at a time.",
  );
  const owners = await db.user.findMany({
    where: { role: "OWNER", active: true },
    select: { id: true },
  });
  requireRule(owners.length === 1, "A unique active owner is required for this requested check.");
  const actorId = owners[0].id;
  if (waitForGate) {
    const delay = await stationTransaction(actorId, async (tx, hash) => {
      const state = await tx.stationTestExportState.findUnique({ where: { stationHash: hash } });
      return Math.max(
        0,
        (state?.cooldownUntil.getTime() ?? 0) - Date.now(),
        (state?.activeUntil?.getTime() ?? 0) - Date.now(),
      );
    });
    if (delay > 0) {
      console.log(JSON.stringify({ waitingSeconds: Math.ceil(delay / 1000) }));
      await new Promise((resolve) => setTimeout(resolve, delay + 500));
    }
  }
  await withStationTestExport(actorId, "HISTORY", async (run) => {
    const config = {
      station: run.station,
      username: process.env.GA_DASHBOARD_USERNAME ?? "",
      password: process.env.GA_DASHBOARD_PASSWORD ?? "",
    };
    requireRule(config.username && config.password, "Station report credentials are unavailable.");
    for (const window of windows) {
      await stationTransaction(actorId, (tx, hash) => requireActiveTestExport(tx, hash, run));
      const session = new PortalSession(fetch, false, false, run.signal);
      try {
        if (verifyStart) {
          const report = await portalHistoryExport(window.start, window.end, config, session);
          const dates = report.rows.map((row) => inspectionDate(columns(row.fields).date));
          requireRule(
            dates.length > 0 && dates.every((date) => date >= window.start && date <= window.end),
            "Verified source rows are required within the requested window.",
          );
          const earliestDate = [...dates].sort()[0];
          await stationTransaction(actorId, async (tx, hash) => {
            await requireActiveTestExport(tx, hash, run);
            const checks = await tx.auditLog.findMany({
              where: {
                entityId: hash,
                action: "STATION_HISTORY_BOUNDARY_CHECK",
                createdAt: { gte: new Date(Date.now() - 60 * 60_000) },
              },
              select: { details: true },
            });
            requireRule(
              emptyHistoryCovers(
                checks.map((check) => check.details),
                window.start,
              ),
              "Earlier supported dates have not all been checked for station traffic.",
            );
            await audit(tx, actorId, HISTORY_START_ACTION, hash, {
              earliestDate,
              scannedFrom: "2000-01-01",
              verified: true,
              sourceWindow: window,
              sourceItems: report.sourceTotal,
              method: "PRIOR_EMPTY_SEARCHES_AND_ALL_PAGE_EXPORT",
              origin: "OWNER_REQUESTED_AGENT_CHECK",
            });
          });
          console.log(
            JSON.stringify({ earliestDate, verified: true, sourceItems: report.sourceTotal }),
          );
          continue;
        }
        const { page } = await portalSearch(window.start, config, session, window.end);
        const availability = stationHistoryAvailability(
          page.html,
          run.station,
          window.start,
          window.end,
        );
        const result = { ...window, ...availability, metadataOnly: true };
        await stationTransaction(actorId, async (tx, hash) => {
          await requireActiveTestExport(tx, hash, run);
          await audit(tx, actorId, "STATION_HISTORY_BOUNDARY_CHECK", hash, {
            ...result,
            origin: "OWNER_REQUESTED_AGENT_CHECK",
          });
        });
        console.log(JSON.stringify(result));
        if (availability.traffic) break;
      } finally {
        session.dispose();
      }
    }
  });
}

main()
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        status: "failed",
        reason: error instanceof BusinessError ? error.message : "History check failed safely.",
      }),
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
