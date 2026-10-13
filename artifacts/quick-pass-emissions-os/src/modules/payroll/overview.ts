import { Temporal } from "@js-temporal/polyfill";
import { businessDate } from "@/lib/time";
import { dashboardInput, payrollDashboard } from "./dashboard";
import { readDashboard } from "../station/dashboard-service";
import { COMMISSION_RATE_CENTS, COMMISSION_THRESHOLD } from "../station/dashboard-calculations";
import type { DashboardData, DashboardEmployee } from "../station/dashboard-types";

export const payOverviewInput = dashboardInput
  .transform((input) => {
    const start = input.start ?? input.date;
    const end = input.end ?? start;
    return { ...input, date: end, start, end };
  })
  .refine((input) => input.end >= input.start, "End date must be on or after start date.")
  .refine((input) => input.end <= businessDate(), "Choose today or an earlier date.")
  .refine(
    (input) => Temporal.PlainDate.from(input.start).until(input.end).days <= 366,
    "Choose a range of at most 367 days.",
  );

type Days = NonNullable<DashboardEmployee["commissionDays"]>;
export function recordedCommission(days: Days) {
  const known = days.filter((day) => day.cents !== null);
  const worked = known.filter((day) => day.working);
  const missingDays = days.length - known.length;
  // Closed/rest days alone do not prove that the missing workdays earned zero.
  const total = worked.length || missingDays === 0
    ? known.reduce((sum, day) => sum + day.cents!, 0)
    : null;
  return {
    total,
    average: worked.length && total !== null ? Math.round(total / worked.length) : total,
    recordedDays: worked.length,
    missingDays,
  };
}

const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Short roster names can match a full contact name, but never choose an ambiguous match. */
export function performanceEmployee(name: string, rows: DashboardEmployee[]) {
  const key = nameKey(name);
  const exact = rows.filter((row) => nameKey(row.name) === key);
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  const first = key.split(" ")[0];
  const matches = rows.filter((row) => nameKey(row.name).split(" ")[0] === first);
  return matches.length === 1 ? matches[0] : undefined;
}

export function applyPerformancePay(
  data: Awaited<ReturnType<typeof payrollDashboard>>,
  source: DashboardData | null,
  weekSource: DashboardData | null = source,
) {
  const start = data.filter.start ?? data.filter.date;
  const end = data.filter.end ?? start;
  const range = start !== end;
  const matches = data.employees.map((employee) =>
    employee.active && source ? performanceEmployee(employee.name, source.employees) : undefined,
  );
  const weekMatches = data.employees.map((employee) =>
    employee.active && weekSource
      ? performanceEmployee(employee.name, weekSource.employees)
      : undefined,
  );
  return {
    ...data,
    selection: { start, end, range },
    syncedAt: source?.syncedAt ?? null,
    employees: data.employees.map((employee, index) => {
      const candidate = matches[index];
      const row = candidate && matches.filter((match) => match?.id === candidate.id).length === 1
        ? candidate
        : undefined;
      const profile = source?.payPlan.profiles.find(
        (profile) =>
          row &&
          (profile.id === row.id ||
            (row.inspector !== null && profile.inspector === row.inspector)),
      );
      const days = row?.commissionDays;
      const selected = days?.filter((day) => day.date >= start && day.date <= end);
      const weekCandidate = weekMatches[index];
      const weekRow =
        weekCandidate &&
        weekMatches.filter((match) => match?.id === weekCandidate.id).length === 1
          ? weekCandidate
          : undefined;
      const weekly = weekRow?.commissionDays?.filter(
        (day) => day.date >= data.week.start && day.date <= data.week.end,
      );
      const selectedSummary = selected ? recordedCommission(selected) : null;
      const weekSummary = weekly ? recordedCommission(weekly) : null;
      const average = range ? selectedSummary : weekSummary;
      const legacy = range ? employee.rangeCommission : employee.commission;
      let base = employee.base;
      if (profile && base.daily === null && base.weekly === null) {
        const daily = profile.mondayCents ??
          (profile.hourlyCents === null ? null : Math.round(profile.hourlyCents * profile.standardMinutes / 60));
        base = { daily, weekly: profile.mondayCents ?? (daily === null ? null : daily * profile.shiftsPerWeek) };
      }
      return {
        ...employee,
        base,
        commission: {
          daily: selectedSummary
            ? (range ? selectedSummary.total : selected?.[0]?.cents ?? null)
            : range ? legacy.weekly : legacy.daily,
          weekly: weekSummary ? weekSummary.total : employee.commission.weekly,
          average: average ? average.average : legacy.average,
          recordedDays: average ? average.recordedDays : legacy.approvedDays,
          missingDays: average ? average.missingDays : legacy.pendingDays + legacy.missingPolicies,
        },
        rate: profile
          ? {
              eligible: profile.commissionEligible,
              rateCents: COMMISSION_RATE_CENTS,
              threshold: COMMISSION_THRESHOLD,
              attribution: "SHOP_WIDE_APPROVED_DAILY",
            }
          : employee.policy,
      };
    }),
  };
}

export async function employeePayOverview(actorId: string, input: unknown, performanceAccess: boolean) {
  const filter = payOverviewInput.parse(input);
  const data = await payrollDashboard(actorId, filter);
  const today = businessDate();
  const weekEnd = data.week.end > today ? today : data.week.end;
  if (!performanceAccess) return applyPerformancePay(data, null);
  const unionStart = filter.start < data.week.start ? filter.start : data.week.start;
  const unionEnd = filter.end > weekEnd ? filter.end : weekEnd;
  if (Temporal.PlainDate.from(unionStart).until(unionEnd).days <= 366) {
    const source = await readDashboard(actorId, { start: unionStart, end: unionEnd, trendDays: 7 });
    return applyPerformancePay(data, source);
  }
  const [source, weekSource] = await Promise.all([
    readDashboard(actorId, { start: filter.start, end: filter.end, trendDays: 7 }),
    readDashboard(actorId, { start: data.week.start, end: weekEnd, trendDays: 7 }),
  ]);
  return applyPerformancePay(data, source, weekSource);
}
