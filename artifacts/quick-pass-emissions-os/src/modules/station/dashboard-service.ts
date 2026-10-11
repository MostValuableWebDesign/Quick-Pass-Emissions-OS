import { z } from "zod";
import { dateString } from "@/lib/validation";
import { addDays, businessDate } from "@/lib/time";
import { audit, requireRule, BusinessError } from "../phase2";
import { range } from "./report";
import { stationConfig, stationTransaction } from "./service";
import { portalRangeDays } from "./portal-client";
import { buildDashboard, dashboardDates, calendarDays } from "./dashboard-calculations";
import type { DashboardQuery, PayPlan } from "./dashboard-types";

const SNAPSHOT = "STATION_PERFORMANCE_DAY_CACHED";
const PLAN = "STATION_PERFORMANCE_PAY_PLAN";
const TTL = 5 * 60_000;
const count = z.number().int().min(0).max(10000);
const counts = { total: count, passed: count, failed: count, aborted: count, other: count };
const inspector = z.object({ inspector: z.string().trim().min(1).max(160), ...counts });
export const dashboardDaySchema = z.object({
  date: dateString, ...counts, retrievedAt: z.string().datetime(),
  inspectors: z.array(inspector).max(1000), verifiedEmpty: z.boolean(),
  testTimes: z.array(z.object({
    inspector: z.string().trim().min(1).max(160),
    minute: z.number().int().min(0).max(1439).nullable(),
  })).max(10000).optional(),
}).refine((d) =>
  d.total === d.passed + d.failed + d.aborted + d.other &&
  d.total === d.inspectors.reduce((n, i) => n + i.total, 0) &&
  new Set(d.inspectors.map((i) => i.inspector)).size === d.inspectors.length &&
  d.inspectors.every((i) => i.total === i.passed + i.failed + i.aborted + i.other) &&
  ["passed", "failed", "aborted", "other"].every((field) =>
    d[field as keyof typeof counts] === d.inspectors.reduce((n, i) => n + i[field as keyof typeof counts], 0)) &&
  (d.total > 0 ? !d.verifiedEmpty : d.verifiedEmpty) &&
  (!d.testTimes || (d.testTimes.length === d.total &&
    d.inspectors.every((i) => d.testTimes!.filter((t) => t.inspector === i.inspector).length === i.total))),
);
const weekdays = z.array(z.number().int().min(1).max(7)).max(7)
  .refine((days) => new Set(days).size === days.length);
const cents = z.number().int().min(0).max(10_000_000);
const profileSchema = z.object({
  id: z.string().min(1).max(100), name: z.string().trim().min(1).max(160),
  inspector: z.string().trim().min(1).max(160).nullable(),
  hourlyCents: cents.nullable(), mondayCents: cents.nullable(),
  standardMinutes: z.number().int().min(0).max(1440),
  shiftsPerWeek: z.number().int().min(1).max(7),
  availableWeekdays: weekdays, scheduledWeekdays: weekdays,
  commissionEligible: z.boolean(), approximate: z.boolean(),
}).refine((p) =>
  p.scheduledWeekdays.length <= p.shiftsPerWeek &&
  p.scheduledWeekdays.every((d) => p.availableWeekdays.includes(d)) &&
  !(p.hourlyCents !== null && p.mondayCents !== null),
);
export const dashboardPayPlanSchema = z.object({
  revision: z.number().int().min(0),
  profiles: z.array(profileSchema).max(100),
  adjustments: z.array(z.object({
    profileId: z.string().min(1).max(100), date: dateString,
    minutes: z.number().int().min(0).max(1440).nullable(),
    baseCents: cents.nullable(), grassCut: z.boolean(),
  })).max(5000),
}).refine((p) =>
  new Set(p.profiles.map((r) => r.id)).size === p.profiles.length &&
  new Set(p.profiles.filter((r) => r.inspector !== null).map((r) => r.inspector)).size ===
    p.profiles.filter((r) => r.inspector !== null).length &&
  p.adjustments.every((a) => p.profiles.some((r) => r.id === a.profileId)) &&
  new Set(p.adjustments.map((a) => `${a.profileId}:${a.date}`)).size === p.adjustments.length,
);
const querySchema = z.object({
  start: dateString, end: dateString, trendDays: z.union([z.literal(7), z.literal(30)]),
  employee: z.string().min(1).max(1000).optional(),
});
function validateQuery(input: unknown): DashboardQuery {
  const query = querySchema.parse(input);
  range(query.start, query.end);
  requireRule(query.end <= businessDate(), "Choose today or an earlier date.");
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
export function resolveDashboardQuery(params: Record<string, string | string[] | undefined>): DashboardQuery {
  const today = businessDate();
  const field = (name: string) => typeof params[name] === "string" ? params[name] as string : undefined;
  let start = field("start") || field("date") || today;
  let end = field("end") || start;
  if (field("preset") === "week") { start = addDays(today, -6); end = today; }
  if (field("preset") === "month") { start = addDays(today, -29); end = today; }
  return validateQuery({
    start, end, trendDays: field("trendDays") === "30" ? 30 : 7,
    ...(field("employee") ? { employee: field("employee") } : {}),
  });
}

/** Cache-only read: rendering/navigation never logs into the external portal. */
export async function readDashboard(actorId: string, input: unknown, now = new Date()) {
  const query = validateQuery(input);
  const today = businessDate(now);
  const needed = dashboardDates(query, today);
  return stationTransaction(actorId, async (tx, hash) => {
    const logs = await tx.auditLog.findMany({
      where: { entityId: hash, action: SNAPSHOT,
        AND: [{ details: { path: ["date"], gte: needed[0] } },
          { details: { path: ["date"], lte: needed.at(-1)! } }] },
      orderBy: { createdAt: "desc" },
    });
    const snapshots = new Map<string, z.infer<typeof dashboardDaySchema>>();
    for (const log of logs) {
      const day = dashboardDaySchema.safeParse(log.details);
      if (day.success && needed.includes(day.data.date) && !snapshots.has(day.data.date))
        snapshots.set(day.data.date, day.data);
    }
    const savedPlan = await tx.auditLog.findFirst({
      where: { entityId: hash, action: PLAN }, orderBy: { createdAt: "desc" },
    });
    const parsed = dashboardPayPlanSchema.safeParse(savedPlan?.details);
    const payPlan = parsed.success ? parsed.data : { revision: 0, profiles: [], adjustments: [] };
    const data = buildDashboard(query, today, [...snapshots.values()], payPlan);
    requireRule(!query.employee || data.employeeOptions.some((e) => e.id === query.employee),
      "This employee filter is no longer available. Select all employees.");
    data.staleDates = [...snapshots.values()].filter((d) =>
      d.date === today ? Date.parse(d.retrievedAt) <= now.getTime() - TTL :
        businessDate(new Date(d.retrievedAt)) <= d.date,
    ).map((d) => d.date);
    return data;
  });
}

function contiguousChunks(dates: string[]) {
  const chunks: { start: string; end: string }[] = [];
  for (const date of [...new Set(dates)].sort()) {
    const last = chunks.at(-1);
    if (last && date === addDays(last.end, 1) && date <= addDays(last.start, 13)) last.end = date;
    else chunks.push({ start: date, end: date });
  }
  // Current-day freshness should not wait behind a large history backfill.
  return chunks.sort((a, b) => b.end.localeCompare(a.end));
}

export async function loadDashboard(actorId: string, input: unknown, refresh = false) {
  const query = validateQuery(input);
  const initial = await readDashboard(actorId, query);
  // Continue a bounded partial backfill before re-fetching already cached days.
  const needed = refresh && initial.missingDates.length === 0 ? dashboardDates(query, initial.today) :
    [...initial.missingDates, ...initial.staleDates, ...initial.timingMissingDates];
  if (!needed.length) return initial;
  const config = stationConfig();
  const allowed = await stationTransaction(actorId, async (tx, hash) => {
    const recent = await tx.auditLog.findFirst({
      where: { entityId: hash, action: { in: ["STATION_PERFORMANCE_LOOKUP_STARTED", "STATION_PORTAL_LOOKUP_STARTED"] } },
      orderBy: { createdAt: "desc" },
    });
    if (recent && recent.createdAt.getTime() > Date.now() - 15_000) return false;
    const failure = await tx.auditLog.findFirst({
      where: { entityId: hash, action: "STATION_PERFORMANCE_LOOKUP_FAILED",
        details: { path: ["query"], equals: `${query.start}:${query.end}:${query.trendDays}` } },
      orderBy: { createdAt: "desc" },
    });
    if (!refresh && failure && failure.createdAt.getTime() > Date.now() - TTL) return false;
    await audit(tx, actorId, "STATION_PERFORMANCE_LOOKUP_STARTED", hash,
      { start: query.start, end: query.end, days: needed.length });
    return true;
  });
  if (!allowed) return { ...initial, error: "Portal requests are cooling down. Saved data is still available." };
  const credentials = {
    station: config.station, username: process.env.GA_DASHBOARD_USERNAME ?? "",
    password: process.env.GA_DASHBOARD_PASSWORD ?? "",
  };
  let requests = 0;
  const deadline = Date.now() + 90_000;
  let sourceError: string | undefined;
  const store = async (days: unknown[]) => {
    const valid = days.map((d) => dashboardDaySchema.parse(d));
    await stationTransaction(actorId, async (tx, hash) => {
      requireRule(hash === config.hash, "Station configuration changed. Refresh to try again.");
      for (const day of valid) await audit(tx, actorId, SNAPSHOT, hash, day);
    });
    return valid;
  };
  try {
    for (const chunk of contiguousChunks(needed)) {
      if (requests >= 20 || Date.now() >= deadline) {
        sourceError = "History is partially loaded. Refresh to continue.";
        break;
      }
      requests++;
      const days = await portalRangeDays(chunk.start, chunk.end, credentials);
      await store(days);
      const absent = calendarDays(chunk.start, chunk.end).filter((date) => !days.some((d) => d.date === date));
      for (const date of absent) {
        if (requests >= 20 || Date.now() >= deadline) {
          sourceError = "History is partially loaded. Refresh to continue.";
          break;
        }
        requests++;
        await store(await portalRangeDays(date, date, credentials));
      }
    }
  } catch (error) {
    sourceError = error instanceof BusinessError ? error.message : "Unable to retrieve station data. Saved values are unchanged.";
  }
  if (sourceError) await stationTransaction(actorId, async (tx, hash) => {
    await audit(tx, actorId, "STATION_PERFORMANCE_LOOKUP_FAILED", hash,
      { query: `${query.start}:${query.end}:${query.trendDays}`, message: sourceError! });
  });
  const result = await readDashboard(actorId, query);
  return { ...result, ...(sourceError ? { error: sourceError } : {}) };
}

export async function saveDashboardPayPlan(actorId: string, input: unknown, query: unknown) {
  const plan = dashboardPayPlanSchema.parse(input);
  const validated = validateQuery(query);
  await stationTransaction(actorId, async (tx, hash) => {
    const latest = await tx.auditLog.findFirst({
      where: { entityId: hash, action: PLAN }, orderBy: { createdAt: "desc" },
    });
    const saved = dashboardPayPlanSchema.safeParse(latest?.details);
    requireRule(plan.revision === (saved.success ? saved.data.revision : 0),
      "Pay settings changed in another session. Refresh before saving.");
    const next: PayPlan = { ...plan, revision: plan.revision + 1 };
    await audit(tx, actorId, PLAN, hash, next);
  });
  const all = await readDashboard(actorId, { ...validated, employee: undefined });
  return validated.employee && all.employeeOptions.some((e) => e.id === validated.employee) ?
    readDashboard(actorId, validated) : all;
}
