import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { dateString } from "@/lib/validation";
import { requireRule, type Tx } from "../../phase2";
import { historyTransaction, checkStations } from "./transaction";
import { historyRange, monthWindows } from "./rules";
import { sourceVisits } from "../source-visits";
import { createRetentionModel } from "../vehicle-retention";

export type IdentityRow = { vinHash: string | null; plateHash: string | null; invalidVin: boolean };
export function plateBindings(rows: { plateHash: string; vinHash: string }[]) {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const values = map.get(row.plateHash) || new Set<string>();
    values.add(row.vinHash);
    map.set(row.plateHash, values);
  }
  return map;
}
export function vehicleIdentity(row: IdentityRow, bindings: Map<string, Set<string>>) {
  if (row.vinHash) return `V:${row.vinHash}`;
  if (row.invalidVin || !row.plateHash) return null;
  const vins = bindings.get(row.plateHash);
  if (!vins?.size) return `P:${row.plateHash}`;
  if (vins.size === 1 && !vins.has("INVALID")) return `V:${[...vins][0]}`;
  return null;
}
export type ReturningVehicleReport = {
  start: string;
  end: string;
  returning: number;
  firstObserved: number;
  unmatchedRecords: number;
  identifiableVehicles: number;
  qualifyingRecords: number;
  identifiedRecords: number;
  unknownStatusRecords: number;
  excludedRecords: number;
  rate: number | null;
  identificationCoverage: number | null;
  plateMatchedRecords: number;
  historyStart: string | null;
  historyEnd: string | null;
  coverage: {
    windows: number;
    completed: number;
    partial: number;
    pending: number;
    unverified: number;
    unresolvedRecords: number;
    rejectedRecords: number;
    label: string;
    missingMonths: number;
    identityReview: number;
    gaps: { stationHash: string; start: string; end: string }[];
  };
};
const reportInput = z.object({
  start: dateString,
  end: dateString,
  stations: z.array(z.string().min(1).max(100)).min(1).max(20),
  employee: z.string().max(100).optional(),
});
/** Use the same reported-identifier and free-retest policy as the trend panels. */
export async function returningInTransaction(
  tx: Tx,
  hashes: string[],
  query: { start: string; end: string; employee?: string; inspector?: string | null },
): Promise<ReturningVehicleReport> {
  requireRule(hashes.length > 0, "Choose an authorized station.");
  const records = await sourceVisits(tx, hashes);
  const model = createRetentionModel(
    records.map((row) => ({
      ...row,
      // Current-period employee attribution remains distinct from the shared
      // station-wide history used to classify free retests.
      inspector: query.inspector !== undefined ? row.inspector : (row.employeeId ?? ""),
      sourceUrl: null,
    })),
    {
      ...query,
      totalDates: 0,
      loadedDates: 0,
      missingPeriods: [],
      incompletePeriods: [],
      unprocessedPeriods: [],
      recordsNeedingReview: 0,
      unrepresentedRecords: 0,
    },
    {
      id: query.employee,
      inspector: query.inspector !== undefined ? query.inspector : (query.employee ?? null),
      label: "Selected station scope",
    },
    query,
  );
  const selected = model.report.selectedPeriod;
  const focused = model.visits.filter(model.focused);
  const qualifyingRecords = model.report.qualifyingInspections;
  const identifiedRecords = focused.filter(
    (row) => !!row.vinHash && model.qualifyingVisitIds.has(row.id),
  ).length;
  const unmatchedRecords = qualifyingRecords - identifiedRecords;
  const unknownStatusRecords = focused.filter((row) => row.completion === "UNKNOWN").length;
  const excludedRecords = focused.length - qualifyingRecords - unknownStatusRecords;
  const [range, windows] = await Promise.all([
    tx.stationInspectionEvidence.aggregate({
      where: { stationHash: { in: hashes }, sourceKind: "VIR" },
      _min: { businessDate: true },
      _max: { businessDate: true },
    }),
    tx.inspectionHistoryWindow.findMany({
      where: {
        stationHash: { in: hashes },
        superseded: false,
        startDate: { lte: query.end },
        job: { mode: { in: ["PORTAL", "REFRESH"] } },
      },
      select: {
        stationHash: true,
        startDate: true,
        endDate: true,
        status: true,
        sourceTotal: true,
        unresolved: true,
        rejected: true,
        identityReview: true,
      },
    }),
  ]);
  const coverageStart = Temporal.PlainDate.from(query.end).subtract({ months: 24 }).toString();
  const gaps: { stationHash: string; start: string; end: string }[] = [];
  for (const stationHash of hashes)
    for (const month of monthWindows(coverageStart, query.end)) {
      let cursor = month.start;
      for (const w of windows
        .filter(
          (w) =>
            w.stationHash === stationHash && w.status === "COMPLETED" && w.sourceTotal !== null,
        )
        .sort((a, b) => a.startDate.localeCompare(b.startDate))) {
        if (w.endDate < cursor || w.startDate > cursor) continue;
        cursor = Temporal.PlainDate.from(w.endDate).add({ days: 1 }).toString();
        if (cursor > month.end) break;
      }
      if (cursor <= month.end) gaps.push({ stationHash, start: month.start, end: month.end });
    }
  const pending = windows.filter((w) => activeWindow(w.status)).length,
    partial = windows.filter((w) => ["PARTIAL", "FAILED", "UNAVAILABLE"].includes(w.status)).length;
  const coverage = {
    gaps,
    missingMonths: gaps.length,
    identityReview: windows.reduce((n, w) => n + w.identityReview, 0),
    windows: windows.length,
    completed: windows.filter((w) => w.status === "COMPLETED").length,
    partial,
    pending,
    unverified: windows.filter((w) => w.sourceTotal === null).length,
    unresolvedRecords: windows.reduce((n, w) => n + w.unresolved, 0),
    rejectedRecords: windows.reduce((n, w) => n + w.rejected, 0),
    label:
      pending || partial || gaps.length
        ? "VIR history has partial coverage—retrieval, extraction or station/month gaps remain"
        : !windows.length
          ? "No reconciled VIR scope; available records only"
          : "Requested 24-month lookback windows reconciled; provider retention outside this scope is unverified",
  };
  return {
    start: query.start,
    end: query.end,
    returning: selected.returning,
    firstObserved: selected.firstObserved,
    unmatchedRecords,
    identifiableVehicles: selected.vehicles,
    qualifyingRecords,
    identifiedRecords,
    unknownStatusRecords,
    excludedRecords,
    rate: selected.rate,
    identificationCoverage: qualifyingRecords ? identifiedRecords / qualifyingRecords : null,
    plateMatchedRecords: 0,
    historyStart: range._min.businessDate,
    historyEnd: range._max.businessDate,
    coverage,
  };
}
const activeWindow = (status: string) => status === "PENDING" || status === "RUNNING";
export function readReturningVehicles(actorId: string, input: unknown) {
  const query = reportInput.parse(input);
  historyRange(query.start, query.end);
  return historyTransaction(actorId, async (tx) => {
    await checkStations(tx, query.stations);
    return returningInTransaction(tx, query.stations, query);
  });
}
