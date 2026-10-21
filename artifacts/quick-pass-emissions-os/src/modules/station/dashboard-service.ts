import { z } from "zod";
import { dateString } from "@/lib/validation";
import { addDays, businessDate } from "@/lib/time";
import { audit, requireRule, BusinessError } from "../phase2";
import { stationTransaction } from "./service";
import { portalRangeDays, PortalSession } from "./portal-client";
import { buildDashboard, calendarDays, dashboardTrendRange } from "./dashboard-calculations";
import { pendingDashboardSourceDates } from "./dashboard-refresh";
import type { DashboardData, DashboardQuery, PayPlan } from "./dashboard-types";
import { supportsTrendBackfill } from "./dashboard-types";
import { HISTORY_START_ACTION, historyStartSchema } from "./history-boundary";
import { analyzeRepeatVehicleHistory } from "./repeat-vehicle-analysis";
import {
  classifyDashboardRetests,
  hasReportEvidence,
  retestHistoryDates,
} from "./dashboard-retests";
import { PACE_SETTINGS_ACTION, paceSettingsSchema } from "./pace-settings";

import { withStationTestExport, requireActiveTestExport } from "./test-export-gate";
import { testExportBatches, TEST_EXPORT_MAX_REQUESTS } from "./test-export-batches";
import { returningInTransaction } from "./history/report";
import { captureRefreshHistory } from "./history/service";
import { retentionInTransaction } from "./vehicle-retention-service";
import { sourceVisits } from "./source-visits";
import { includeReportedInspections } from "./report-counts";

const SNAPSHOT = "STATION_PERFORMANCE_DAY_CACHED";
const PLAN = "STATION_PERFORMANCE_PAY_PLAN";
const TTL = 5 * 60_000;
const count = z.number().int().min(0).max(10000);
const counts = { total: count, passed: count, failed: count, aborted: count, other: count };
const inspector = z.object({ inspector: z.string().trim().min(1).max(160), ...counts });
export const dashboardDaySchema = z
  .object({
    date: dateString,
    ...counts,
    retrievedAt: z.string().datetime(),
    inspectors: z.array(inspector).max(1000),
    verifiedEmpty: z.boolean(),
    incompleteRows: z
      .object({ total: count.min(1), vehicle: count, inspector: count, outcome: count })
      .refine(
        (rows) =>
          [rows.vehicle, rows.inspector, rows.outcome].every((n) => n <= rows.total) &&
          rows.vehicle + rows.inspector + rows.outcome >= rows.total,
      )
      .optional(),
    testTimes: z
      .array(
        z.object({
          inspector: z.string().trim().min(1).max(160),
          minute: z.number().int().min(0).max(1439).nullable(),
          vinHash: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
          recordKey: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
          outcome: z.enum(["passed", "failed", "aborted", "other"]).optional(),
        }),
      )
      .max(10000)
      .optional(),
  })
  .refine(
    (d) =>
      d.total === d.passed + d.failed + d.aborted + d.other &&
      d.total === d.inspectors.reduce((n, i) => n + i.total, 0) &&
      new Set(d.inspectors.map((i) => i.inspector)).size === d.inspectors.length &&
      d.inspectors.every((i) => i.total === i.passed + i.failed + i.aborted + i.other) &&
      ["passed", "failed", "aborted", "other"].every(
        (field) =>
          d[field as keyof typeof counts] ===
          d.inspectors.reduce((n, i) => n + i[field as keyof typeof counts], 0),
      ) &&
      d.total + (d.incompleteRows?.total ?? 0) <= 10000 &&
      (d.total + (d.incompleteRows?.total ?? 0) > 0 ? !d.verifiedEmpty : d.verifiedEmpty) &&
      (!d.testTimes ||
        (d.testTimes.length === d.total &&
          d.inspectors.every(
            (i) => d.testTimes!.filter((t) => t.inspector === i.inspector).length === i.total,
          ))) &&
      (!d.testTimes ||
        d.testTimes.every(
          (t) => (!t.vinHash && !t.recordKey && !t.outcome) || (!!t.recordKey && !!t.outcome),
        )) &&
      (!d.testTimes?.some((t) => t.recordKey) ||
        (new Set(d.testTimes.map((t) => t.recordKey)).size === d.testTimes.length &&
          d.inspectors.every((i) =>
            ["passed", "failed", "aborted", "other"].every(
              (field) =>
                d.testTimes!.filter((t) => t.inspector === i.inspector && t.outcome === field)
                  .length === i[field as keyof typeof counts],
            ),
          ))),
  );
const weekdays = z
  .array(z.number().int().min(1).max(7))
  .max(7)
  .refine((days) => new Set(days).size === days.length);
const cents = z.number().int().min(0).max(10_000_000);
const profileSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(160),
    inspector: z.string().trim().min(1).max(160).nullable(),
    hourlyCents: cents.nullable(),
    mondayCents: cents.nullable(),
    standardMinutes: z.number().int().min(0).max(1440),
    shiftsPerWeek: z.number().int().min(1).max(7),
    availableWeekdays: weekdays,
    scheduledWeekdays: weekdays,
    commissionEligible: z.boolean(),
    approximate: z.boolean(),
  })
  .refine(
    (p) =>
      p.scheduledWeekdays.length <= p.shiftsPerWeek &&
      p.scheduledWeekdays.every((d) => p.availableWeekdays.includes(d)) &&
      !(p.hourlyCents !== null && p.mondayCents !== null),
  );
export const dashboardPayPlanSchema = z
  .object({
    revision: z.number().int().min(0),
    profiles: z.array(profileSchema).max(100),
    adjustments: z
      .array(
        z.object({
          profileId: z.string().min(1).max(100),
          date: dateString,
          minutes: z.number().int().min(0).max(1440).nullable(),
          baseCents: cents.nullable(),
          grassCut: z.boolean(),
        }),
      )
      .max(5000),
  })
  .refine(
    (p) =>
      new Set(p.profiles.map((r) => r.id)).size === p.profiles.length &&
      new Set(p.profiles.filter((r) => r.inspector !== null).map((r) => r.inspector)).size ===
        p.profiles.filter((r) => r.inspector !== null).length &&
      p.adjustments.every((a) => p.profiles.some((r) => r.id === a.profileId)) &&
      new Set(p.adjustments.map((a) => `${a.profileId}:${a.date}`)).size === p.adjustments.length,
  );
export const dashboardQuerySchema = z.object({
  start: dateString,
  end: dateString,
  trendDays: z.union([
    z.literal(7),
    z.literal(30),
    z.literal(365),
    z.literal("past-year"),
    z.literal(730),
    z.literal(1095),
    z.literal(1460),
    z.literal(1825),
    z.literal(2190),
    z.literal("all"),
    z.literal("custom"),
  ]),
  employee: z.string().min(1).max(1000).optional(),
});
function validateQuery(input: unknown): DashboardQuery {
  const query = dashboardQuerySchema.parse(input);
  requireRule(
    query.start >= "2000-01-01" && query.end >= query.start && query.end <= businessDate(),
    "Select a valid date range ending today or earlier.",
  );
  if (query.employee?.startsWith("inspector:")) {
    try {
      const name = decodeURIComponent(query.employee.slice("inspector:".length));
      requireRule(name.length > 0 && name.length <= 160, "Select a valid employee.");
    } catch {
      throw new BusinessError("Select a valid employee.");
    }
  }
  return query;
}
export function resolveDashboardQuery(
  params: Record<string, string | string[] | undefined>,
): DashboardQuery {
  const today = businessDate();
  const field = (name: string) =>
    typeof params[name] === "string" ? (params[name] as string) : undefined;
  let start = field("start") || field("date") || today;
  let end = field("end") || start;
  if (field("preset") === "week") {
    start = addDays(today, -6);
    end = today;
  }
  if (field("preset") === "month") {
    start = addDays(today, -29);
    end = today;
  }
  const trendDays = field("trendDays");
  const period = field("period");
  const trendValues: Record<string, DashboardQuery["trendDays"]> = {
    "7": 7,
    "30": 30,
    "365": 365,
    "past-year": "past-year",
    "730": 730,
    "1095": 1095,
    "1460": 1460,
    "1825": 1825,
    "2190": 2190,
    all: "all",
    since2023: 1825,
    custom: "custom",
  };
  let selectedPeriod = trendValues[period ?? ""] ?? trendValues[trendDays ?? ""] ?? "custom";
  if (period && period !== "custom" && period !== "all") {
    end = today;
    if (period === "past-year") {
      start = addDays(today, -364);
    } else {
      const days = Number(period);
      start =
        days === 365
          ? `${today.slice(0, 4)}-01-01`
          : days >= 730
            ? `${Number(today.slice(0, 4)) - days / 365 + 1}-01-01`
            : addDays(today, 1 - days);
    }
  } else if (period === "all") {
    end = today;
  }
  if (period) selectedPeriod = trendValues[period] ?? "custom";
  else if (selectedPeriod !== "all" && typeof selectedPeriod === "number") {
    const days = selectedPeriod;
    const expectedStart =
      days === 365
        ? `${today.slice(0, 4)}-01-01`
        : days >= 730
          ? `${Number(today.slice(0, 4)) - days / 365 + 1}-01-01`
          : addDays(today, 1 - days);
    if (start !== expectedStart || end !== today) selectedPeriod = "custom";
  }
  return validateQuery({
    start,
    end,
    trendDays: selectedPeriod,
    ...(field("employee") ? { employee: field("employee") } : {}),
  });
}

/** Cache-only read: rendering/navigation never logs into the external portal. */
export async function readDashboard(actorId: string, input: unknown, now = new Date()) {
  let query = validateQuery(input);
  const today = businessDate(now);
  return stationTransaction(actorId, async (tx, hash) => {
    let allTimeStart: string | undefined;
    if (query.trendDays === "all") {
      const boundary = await tx.auditLog.findFirst({
        where: { entityId: hash, action: HISTORY_START_ACTION },
        orderBy: { createdAt: "desc" },
      });
      const verified = historyStartSchema.safeParse(boundary?.details);
      requireRule(
        verified.success,
        "The station's oldest available report has not been verified yet. Choose a shorter trend until the history check is complete.",
      );
      allTimeStart = verified.data.earliestDate;
      query = { ...query, start: allTimeStart, end: today };
    }
    const needed = retestHistoryDates(query, allTimeStart);
    const logs = await tx.auditLog.findMany({
      where: {
        entityId: hash,
        action: SNAPSHOT,
        AND: [
          { details: { path: ["date"], gte: needed[0] } },
          { details: { path: ["date"], lte: needed.at(-1)! } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    const snapshots = new Map<string, z.infer<typeof dashboardDaySchema>>();
    for (const log of logs) {
      const day = dashboardDaySchema.safeParse(log.details);
      if (day.success && needed.includes(day.data.date) && !snapshots.has(day.data.date))
        snapshots.set(day.data.date, day.data);
    }
    const savedPlan = await tx.auditLog.findFirst({
      where: { entityId: hash, action: PLAN },
      orderBy: { createdAt: "desc" },
    });
    const parsed = dashboardPayPlanSchema.safeParse(savedPlan?.details);
    const payPlan = parsed.success ? parsed.data : { revision: 0, profiles: [], adjustments: [] };
    const rawDays = includeReportedInspections(
      [...snapshots.values()],
      await sourceVisits(tx, [hash]),
    );
    const savedPace = await tx.auditLog.findFirst({
      where: { entityId: hash, action: PACE_SETTINGS_ACTION },
      orderBy: { createdAt: "desc" },
    });
    const parsedPace = paceSettingsSchema.safeParse(savedPace?.details);
    const paceSettings = parsedPace.success
      ? parsedPace.data
      : { revision: 0, longGapMinutes: null };
    const classifiedDays = classifyDashboardRetests(rawDays);
    const data = buildDashboard(query, today, classifiedDays, payPlan, paceSettings, allTimeStart);
    data.retestMissingDates = needed.filter((date) => {
      const day = snapshots.get(date);
      return !day || !hasReportEvidence(day);
    });
    requireRule(
      !query.employee || data.employeeOptions.some((e) => e.id === query.employee),
      "This employee filter is no longer available. Select all employees.",
    );
    data.staleDates = [...snapshots.values()]
      .filter((d) =>
        d.date === today
          ? Date.parse(d.retrievedAt) <= now.getTime() - TTL
          : businessDate(new Date(d.retrievedAt)) <= d.date,
      )
      .map((d) => d.date);
    const profile = payPlan.profiles.find((p) => p.id === query.employee);
    const selectedInspector =
      profile?.inspector ?? data.employees.find((e) => e.id === query.employee)?.inspector ?? null;
    data.returningVehicles = await returningInTransaction(
      tx,
      [hash],
      query.employee ? { ...query, inspector: selectedInspector } : query,
    );
    if (supportsTrendBackfill(query)) {
      const gate = await tx.stationTestExportState.findUnique({ where: { stationHash: hash } });
      const gateNow = Date.now();
      data.backfill = {
        totalDates: needed.length,
        pendingDates: pendingDashboardSourceDates(data).length,
        incompleteDates: new Set(data.knownIncompleteDates ?? []).size,
        retryAfterMs: Math.max(
          0,
          (gate?.cooldownUntil.getTime() ?? 0) - gateNow,
          (gate?.activeUntil?.getTime() ?? 0) - gateNow,
        ),
      };
    }
    {
      const trendRange = dashboardTrendRange(query, allTimeStart);
      data.repeatVehicleAnalysis = analyzeRepeatVehicleHistory(
        classifiedDays,
        trendRange.start,
        trendRange.end,
      );
      data.repeatVehicleAnalysis.retention = await retentionInTransaction(tx, hash, {
        start: trendRange.start,
        end: trendRange.end,
        days: rawDays,
        query,
        scope: {
          id: query.employee || undefined,
          label: profile?.name ?? "All inspectors",
          inspector: selectedInspector,
        },
      });
    }
    return data;
  });
}

/** Station-scoped owner preference, independent of pay and personal panel layout. */
export async function saveDashboardPaceSettings(actorId: string, input: unknown, query: unknown) {
  const settings = paceSettingsSchema.parse(input);
  const validated = validateQuery(query);
  await stationTransaction(actorId, async (tx, hash) => {
    const latest = await tx.auditLog.findFirst({
      where: { entityId: hash, action: PACE_SETTINGS_ACTION },
      orderBy: { createdAt: "desc" },
    });
    const saved = paceSettingsSchema.safeParse(latest?.details);
    requireRule(
      settings.revision === (saved.success ? saved.data.revision : 0),
      "Pace settings changed in another session. Refresh before saving.",
    );
    await audit(tx, actorId, PACE_SETTINGS_ACTION, hash, {
      ...settings,
      revision: settings.revision + 1,
    });
  });
  return readDashboard(actorId, validated);
}

export async function loadDashboard(
  actorId: string,
  input: unknown,
  refresh = false,
): Promise<DashboardData> {
  const query = validateQuery(input);
  const resumableTrend = supportsTrendBackfill(query);
  const initial = await readDashboard(actorId, query);
  // Continue missing history before re-fetching cached days. Foreground backfill uses refresh=false.
  const needed = pendingDashboardSourceDates(initial, refresh);
  if (!needed.length) return { ...initial, sourceStatus: "cached" };
  let sourceStarted = false;
  let sourceSaved = false;
  let sourceBlocked = false;
  let sourceError: string | undefined;
  let batchLimited = false;
  try {
    await withStationTestExport(actorId, "PERFORMANCE", async (run) => {
      sourceStarted = true;
      const credentials = {
        station: run.station,
        username: process.env.GA_DASHBOARD_USERNAME ?? "",
        password: process.env.GA_DASHBOARD_PASSWORD ?? "",
      };
      let requests = 0;
      const fetchAndStore = async (start: string, end: string) => {
        await stationTransaction(actorId, (tx, hash) => requireActiveTestExport(tx, hash, run));
        requests++;
        const days = await portalRangeDays(
          start,
          end,
          credentials,
          new PortalSession(fetch, false, false, run.signal),
          (report) => captureRefreshHistory(actorId, run, start, end, report),
        );
        const valid = days.map((day) => dashboardDaySchema.parse(day));
        await stationTransaction(actorId, async (tx, hash) => {
          await requireActiveTestExport(tx, hash, run);
          for (const day of valid) await audit(tx, actorId, SNAPSHOT, hash, day);
        });
        if (valid.length) sourceSaved = true;
        return valid;
      };
      const partial = () => {
        batchLimited = true;
      };
      for (const chunk of testExportBatches(needed, initial.today, query)) {
        if (requests >= TEST_EXPORT_MAX_REQUESTS || run.signal.aborted) {
          partial();
          break;
        }
        const days = await fetchAndStore(chunk.start, chunk.end);
        const absent = calendarDays(chunk.start, chunk.end).filter(
          (date) => !days.some((day) => day.date === date),
        );
        // An absent range date still needs an explicit single-day response; it is never assumed zero.
        for (const date of absent) {
          if (requests >= TEST_EXPORT_MAX_REQUESTS || run.signal.aborted) {
            partial();
            break;
          }
          await fetchAndStore(date, date);
        }
      }
    });
  } catch (error) {
    sourceBlocked = !sourceStarted && error instanceof BusinessError;
    sourceError =
      error instanceof BusinessError
        ? error.message
        : "Unable to retrieve station data. Saved values are unchanged.";
  }
  const result = await readDashboard(actorId, query);
  return {
    ...result,
    ...(result.backfill
      ? { backfill: { ...result.backfill, interrupted: !!sourceError && sourceStarted } }
      : {}),
    ...(sourceError
      ? { error: sourceError }
      : batchLimited && !resumableTrend
        ? { error: "History is partially loaded. Continue after the station cooldown." }
        : {}),
    sourceStatus: sourceError
      ? sourceSaved
        ? "partial"
        : sourceBlocked
          ? "blocked"
          : "failed"
      : batchLimited || result.reportIssues?.length
        ? "partial"
        : "source",
  };
}

export async function saveDashboardPayPlan(actorId: string, input: unknown, query: unknown) {
  const plan = dashboardPayPlanSchema.parse(input);
  const validated = validateQuery(query);
  await stationTransaction(actorId, async (tx, hash) => {
    const latest = await tx.auditLog.findFirst({
      where: { entityId: hash, action: PLAN },
      orderBy: { createdAt: "desc" },
    });
    const saved = dashboardPayPlanSchema.safeParse(latest?.details);
    requireRule(
      plan.revision === (saved.success ? saved.data.revision : 0),
      "Pay settings changed in another session. Refresh before saving.",
    );
    const next: PayPlan = { ...plan, revision: plan.revision + 1 };
    await audit(tx, actorId, PLAN, hash, next);
  });
  const all = await readDashboard(actorId, { ...validated, employee: undefined });
  return validated.employee && all.employeeOptions.some((e) => e.id === validated.employee)
    ? readDashboard(actorId, validated)
    : all;
}
