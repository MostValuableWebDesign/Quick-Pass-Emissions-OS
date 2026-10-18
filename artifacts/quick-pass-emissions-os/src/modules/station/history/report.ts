import { Temporal } from "@js-temporal/polyfill";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { dateString } from "@/lib/validation";
import { requireRule, type Tx } from "../../phase2";
import { historyTransaction, checkStations } from "./transaction";
import { historyRange, qualifies, monthWindows } from "./rules";

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
type Group = IdentityRow & { payment: string; retest: string; completion: string; count: number };
async function lookupBindings(tx: Tx, scopes: Prisma.Sql, plates: string[], vins: string[]) {
  return tx.$queryRaw<{ plateHash: string; vinHash: string }[]>`
    SELECT DISTINCT e."plateHash", coalesce(e."vinHash", 'INVALID') AS "vinHash"
    FROM "StationInspectionEvidence" e JOIN "StationRecord" r ON r.id = e."recordId"
    WHERE e."stationHash" IN (${scopes}) AND e."sourceKind" = 'VIR' AND e."plateHash" IS NOT NULL
      AND (e."vinHash" IS NOT NULL OR e."invalidVin") AND r."currentRevisionId" = e."revisionId" AND r.state <> 'SUPERSEDED'
      AND (e."plateHash" = ANY(${plates}::text[]) OR e."vinHash" = ANY(${vins}::text[]))`;
}

/** Groups just the requested period, then performs indexed lookbacks for its candidate identifiers. */
export async function returningInTransaction(
  tx: Tx,
  hashes: string[],
  query: { start: string; end: string; employee?: string },
): Promise<ReturningVehicleReport> {
  requireRule(hashes.length > 0, "Choose an authorized station.");
  const scopes = Prisma.join(hashes);
  const currentOnly = Prisma.sql`e."sourceKind" = 'VIR' AND r."state" <> 'SUPERSEDED' AND r."currentRevisionId" = e."revisionId"`;
  const groups = await tx.$queryRaw<Group[]>`
    SELECT e."vinHash", e."plateHash", e."invalidVin", e."payment", e."retest", e."completion", count(*)::int AS count
    FROM "StationInspectionEvidence" e JOIN "StationRecord" r ON r.id = e."recordId"
    WHERE e."stationHash" IN (${scopes}) AND e."businessDate" >= ${query.start} AND e."businessDate" <= ${query.end}
      AND ${currentOnly} ${query.employee ? Prisma.sql`AND r."employeeId" = ${query.employee}` : Prisma.empty}
    GROUP BY e."vinHash", e."plateHash", e."invalidVin", e."payment", e."retest", e."completion"`;
  const vins = [...new Set(groups.flatMap((g) => (g.vinHash ? [g.vinHash] : [])))];
  const plates = [...new Set(groups.flatMap((g) => (g.plateHash ? [g.plateHash] : [])))];
  const associations =
    vins.length || plates.length ? await lookupBindings(tx, scopes, plates, vins) : [];
  // Include conflicting VINs on all candidate aliases, even if those VINs are outside the period.
  const candidateVins = [
    ...new Set([
      ...vins,
      ...associations.filter((p) => p.vinHash !== "INVALID").map((p) => p.vinHash),
    ]),
  ];
  const aliases = candidateVins.length ? await lookupBindings(tx, scopes, [], candidateVins) : [];
  const candidatePlates = [
    ...new Set([
      ...plates,
      ...associations.map((p) => p.plateHash),
      ...aliases.map((p) => p.plateHash),
    ]),
  ];
  const allBindings = candidatePlates.length
    ? await lookupBindings(tx, scopes, candidatePlates, [])
    : [];
  const bindings = plateBindings(allBindings);
  const current = new Set<string>();
  let qualifyingRecords = 0,
    identifiedRecords = 0,
    unmatchedRecords = 0,
    unknownStatusRecords = 0,
    excludedRecords = 0,
    plateMatchedRecords = 0;
  for (const group of groups) {
    if (!qualifies(group)) {
      if (
        group.completion !== "VOIDED" &&
        group.completion !== "CANCELLED" &&
        group.completion !== "INCOMPLETE" &&
        group.payment !== "UNPAID" &&
        group.payment !== "REFUNDED" &&
        !["FREE_RETEST", "PAID_RETEST"].includes(group.retest) &&
        [group.payment, group.retest, group.completion].includes("UNKNOWN")
      )
        unknownStatusRecords += group.count;
      else excludedRecords += group.count;
      continue;
    }
    qualifyingRecords += group.count;
    const identity = vehicleIdentity(group, bindings);
    if (!identity) unmatchedRecords += group.count;
    else {
      current.add(identity);
      identifiedRecords += group.count;
      if (!group.vinHash) plateMatchedRecords += group.count;
    }
  }
  // Indexes constrain prior reads to candidate VINs/plates, rather than loading all history.
  const prior = current.size
    ? await tx.$queryRaw<IdentityRow[]>`
    SELECT DISTINCT e."vinHash", e."plateHash", e."invalidVin"
    FROM "StationInspectionEvidence" e JOIN "StationRecord" r ON r.id = e."recordId"
    WHERE e."stationHash" IN (${scopes}) AND e."businessDate" < ${query.start}
      AND ${currentOnly} AND e."payment" = 'PAID' AND e."completion" = 'COMPLETED' AND e."retest" = 'INITIAL'
      AND (e."vinHash" = ANY(${candidateVins}::text[]) OR e."plateHash" = ANY(${candidatePlates}::text[]))`
    : [];
  const previous = new Set(
    prior.map((row) => vehicleIdentity(row, bindings)).filter((k): k is string => !!k),
  );
  const returning = [...current].filter((k) => previous.has(k)).length;
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
    returning,
    firstObserved: current.size - returning,
    unmatchedRecords,
    identifiableVehicles: current.size,
    qualifyingRecords,
    identifiedRecords,
    unknownStatusRecords,
    excludedRecords,
    rate: current.size ? returning / current.size : null,
    identificationCoverage: qualifyingRecords ? identifiedRecords / qualifyingRecords : null,
    plateMatchedRecords,
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
