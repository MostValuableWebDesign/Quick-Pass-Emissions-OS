import { Prisma } from "@prisma/client";
import type { Tx } from "../phase2";
import { requireRule } from "../phase2";
import { businessDate } from "@/lib/time";
import { calendarDays } from "./dashboard-calculations";
import type { DashboardQuery, PortalDay } from "./dashboard-types";
import { reportMinute } from "./inspection-cadence";
import { stationTransaction } from "./service";
import {
  createRetentionModel,
  datePeriods,
  retentionDetails,
  type RetentionVisit,
  type RetentionScope,
  type RetentionModel,
  type RetentionDetailRequest,
  type RetentionCoverage,
} from "./vehicle-retention";

type EvidenceRow = Omit<RetentionVisit, "minute" | "sourceUrl"> & {
  sourceDate: string;
  provenance: string;
};
type Cached = {
  hash: string;
  version: string;
  expires: number;
  visits: RetentionVisit[];
  windows: {
    startDate: string;
    endDate: string;
    status: string;
    unresolved: number;
    rejected: number;
    identityReview: number;
    sourceTotal: number | null;
  }[];
  models: Map<string, RetentionModel>;
};
// Bounded, server-only cache. Authorization and an append-only audit generation
// are checked on every access. No raw payloads/identifiers are cached or returned.
const cache = new Map<string, Cached>();
const TTL = 5 * 60_000;
async function generation(tx: Tx) {
  const value = await tx.auditLog.aggregate({ _count: true, _max: { createdAt: true } });
  return `${value._count}:${value._max.createdAt?.toISOString() ?? ""}`;
}
const modelKey = (q: Pick<DashboardQuery, "start" | "end" | "employee">) =>
  JSON.stringify([q.start, q.end, q.employee || ""]);

export async function retentionInTransaction(
  tx: Tx,
  hash: string,
  input: {
    start: string;
    end: string;
    days: PortalDay[];
    query: DashboardQuery;
    scope: RetentionScope;
  },
) {
  const version = await generation(tx),
    end = input.end < businessDate() ? input.end : businessDate();
  const key = `${hash}:${input.start}:${end}`;
  let saved = cache.get(key);
  if (!saved || saved.version !== version || saved.expires < Date.now()) {
    const scopes = Prisma.sql`${hash}`;
    // Existing station/date and VIN/date indexes constrain this canonical read.
    // Do not load/decrypt original report payloads for aggregation.
    const [evidence, windows] = await Promise.all([
      tx.$queryRaw<EvidenceRow[]>`
        SELECT r.id, v.fingerprint AS key, e.source, e."sourceId", e."businessDate" AS date,
          v.inspector, v.outcome, e."vinHash", e."plateHash", e."invalidVin", e."identityStatus",
          v."vehicleSuffix" AS suffix, e.payment, e.retest, e.completion, e."sourceKind",
          v."sourceDate", e.provenance
        FROM "StationInspectionEvidence" e
        JOIN "StationRecord" r ON r.id = e."recordId" AND r."currentRevisionId" = e."revisionId" AND r.state <> 'SUPERSEDED'
        JOIN "StationRevision" v ON v.id = e."revisionId"
        WHERE e."stationHash" = ${scopes} AND e."sourceKind" = 'VIR'
          AND e."businessDate" >= ${input.start} AND e."businessDate" <= ${end}
        ORDER BY e."businessDate", r.id`,
      tx.inspectionHistoryWindow.findMany({
        where: {
          stationHash: hash,
          superseded: false,
          startDate: { lte: end },
          endDate: { gte: input.start },
          job: { mode: { in: ["PORTAL", "REFRESH"] } },
        },
        select: {
          id: true,
          jobId: true,
          reportDigest: true,
          startDate: true,
          endDate: true,
          status: true,
          unresolved: true,
          rejected: true,
          identityReview: true,
          sourceTotal: true,
        },
      }),
    ]);
    const sourceWindows = new Map(windows.map((w) => [w.id, w]));
    const visits = new Map<string, RetentionVisit>();
    for (const day of input.days)
      for (const row of day.testTimes ?? []) {
        if (!row.recordKey || day.date < input.start || day.date > end) continue;
        visits.set(row.recordKey, {
          id: `cache-row:${visits.size + 1}`,
          key: row.recordKey,
          source: "GA_DASHBOARD",
          sourceId: null,
          date: day.date,
          minute: row.minute,
          inspector: row.inspector,
          outcome: row.outcome ?? "UNKNOWN",
          // A cache hash alone does not prove a valid normalized VIN. Canonical
          // evidence below supplies validated identity and authoritative statuses.
          vinHash: null,
          plateHash: null,
          invalidVin: false,
          identityStatus: "UNREVIEWED",
          suffix: "",
          payment: "UNKNOWN",
          retest: "UNKNOWN",
          completion: ["passed", "failed"].includes(row.outcome ?? "") ? "COMPLETED" : "INCOMPLETE",
          sourceKind: "PERFORMANCE",
          sourceUrl: null,
        });
      }
    for (const row of evidence) {
      const windowId = /^history-window:(.+)$/.exec(row.provenance)?.[1];
      const window = windowId ? sourceWindows.get(windowId) : undefined;
      visits.set(row.key, {
        ...row,
        minute: reportMinute(row.sourceDate),
        sourceUrl: window?.reportDigest
          ? `/api/inspection-history/source?jobId=${encodeURIComponent(window.jobId)}&windowId=${encodeURIComponent(window.id)}`
          : null,
      });
    }
    saved = {
      hash,
      version,
      expires: Date.now() + TTL,
      visits: [...visits.values()],
      windows,
      models: new Map(),
    };
    cache.delete(key);
    cache.set(key, saved);
    while (cache.size > 1) cache.delete(cache.keys().next().value!);
  }
  const mKey = modelKey(input.query);
  const existing = saved.models.get(mKey);
  if (existing) return existing.report;
  const days = input.days.filter((d) => d.date >= input.start && d.date <= end);
  const dates = new Set(days.map((d) => d.date));
  for (const visit of saved.visits) if (visit.sourceKind === "VIR") dates.add(visit.date);
  const expected = calendarDays(input.start, end);
  const focus = (v: RetentionVisit) =>
    !input.scope.id || (input.scope.inspector !== null && v.inspector === input.scope.inspector);
  const represented = new Map<string, number>();
  for (const v of saved.visits.filter(focus))
    represented.set(v.date, (represented.get(v.date) ?? 0) + 1);
  const unrepresentedRecords = days.reduce((sum, d) => {
    const total = input.scope.id
      ? (d.inspectors.find((i) => i.inspector === input.scope.inspector)?.total ?? 0)
      : d.total + (d.incompleteRows?.total ?? 0);
    return sum + Math.max(0, total - (represented.get(d.date) ?? 0));
  }, 0);
  const unprocessed = saved.windows.filter(
    (w) =>
      w.status !== "COMPLETED" ||
      w.sourceTotal === null ||
      w.unresolved ||
      w.rejected ||
      w.identityReview,
  );
  const coverage: RetentionCoverage = {
    start: input.start,
    end,
    totalDates: expected.length,
    loadedDates: dates.size,
    missingPeriods: datePeriods(expected.filter((d) => !dates.has(d))),
    incompletePeriods: datePeriods(
      days.filter((d) => !!d.incompleteRows?.total).map((d) => d.date),
    ),
    unprocessedPeriods: unprocessed.map((w) => ({
      start: w.startDate,
      end: w.endDate,
      status: w.status,
      review: w.unresolved + w.rejected + w.identityReview,
    })),
    recordsNeedingReview: unprocessed.reduce(
      (sum, w) => sum + w.unresolved + w.rejected + w.identityReview,
      0,
    ),
    unrepresentedRecords,
  };
  const model = createRetentionModel(saved.visits, coverage, input.scope, {
    start: input.query.start,
    end: input.query.end,
  });
  saved.models.set(mKey, model);
  while (saved.models.size > 3) saved.models.delete(saved.models.keys().next().value!);
  return model.report;
}

export function readRetentionDetails(
  actorId: string,
  query: DashboardQuery,
  request: RetentionDetailRequest,
) {
  return stationTransaction(actorId, async (tx, hash) => {
    requireRule(query.trendDays === "all", "Open the All Time vehicle history first.");
    const version = await generation(tx),
      key = modelKey(query);
    const model = [...cache.values()]
      .find(
        (c) =>
          c.hash === hash && c.version === version && c.expires >= Date.now() && c.models.has(key),
      )
      ?.models.get(key);
    if (!model) return null;
    if (request.vehicleId)
      requireRule(
        model.visits.some((v) => v.id === request.vehicleId),
        "Choose a vehicle in this station's loaded history.",
      );
    if (request.metric === "cohort")
      requireRule(model.cohorts.has(request.year ?? -1), "Choose an available calendar year.");
    return retentionDetails(model, request);
  });
}
