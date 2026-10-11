import { Temporal } from "@js-temporal/polyfill";
import { addDays } from "@/lib/time";
import { inspectionCadence } from "./inspection-cadence";
import type {
  Counts,
  DashboardData,
  DashboardEmployee,
  DashboardQuery,
  PayPlan,
  PayProfile,
  PortalDay,
} from "./dashboard-types";

export const TEST_PRICE_CENTS = 2000;
export const COMMISSION_THRESHOLD = 50;
export const COMMISSION_RATE_CENTS = 100;
export const emptyCounts = (): Counts => ({ total: 0, passed: 0, failed: 0, aborted: 0, other: 0 });
export function calendarDays(start: string, end: string) {
  const days: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) days.push(date);
  return days;
}
export function dashboardDates(query: DashboardQuery, today: string) {
  const trendStart =
    query.start === query.end ? addDays(query.end, 1 - query.trendDays) : query.start;
  return [...new Set([...calendarDays(trendStart, query.end), today])].sort();
}
export function inspectorKey(inspector: string) {
  return `inspector:${encodeURIComponent(inspector)}`;
}
const commission = (total: number) =>
  Math.max(total - COMMISSION_THRESHOLD, 0) * COMMISSION_RATE_CENTS;
const nullableSum = (amounts: (number | null)[]) =>
  amounts.some((n) => n === null) ? null : amounts.reduce<number>((sum, n) => sum + (n ?? 0), 0);

function dayPay(profile: PayProfile, date: string, day: PortalDay | undefined, plan: PayPlan) {
  const weekday = Temporal.PlainDate.from(date).dayOfWeek;
  const adjustment = plan.adjustments.find((a) => a.profileId === profile.id && a.date === date);
  const personal = day?.inspectors.find((g) => g.inspector === profile.inspector);
  const hasWork = !!(personal?.rawTotal ?? personal?.total);
  const scheduled = profile.scheduledWeekdays.includes(weekday);
  const isMondayPay = profile.mondayCents !== null;
  // A source-confirmed working day can use the standard shift as an estimate,
  // even before its rota is confirmed. Actual recorded hours always win.
  const estimatedHours = adjustment?.minutes == null && hasWork && !scheduled;
  let minutes = adjustment?.minutes ?? (scheduled || hasWork ? profile.standardMinutes : null);
  const actualBase = adjustment?.baseCents;
  let base: number | null;
  if (actualBase !== null && actualBase !== undefined) base = actualBase;
  else if (isMondayPay) base = weekday === 1 ? profile.mondayCents : 0;
  else if (minutes !== null && profile.hourlyCents !== null)
    base = Math.round((profile.hourlyCents * minutes) / 60);
  else if (
    (!profile.availableWeekdays.includes(weekday) && !hasWork) ||
    (profile.scheduledWeekdays.length === profile.shiftsPerWeek && !scheduled && !hasWork)
  ) {
    base = 0;
    minutes = 0;
  } else base = null;
  const working =
    adjustment?.minutes === 0
      ? (actualBase ?? 0) > 0
      : hasWork ||
        scheduled ||
        (minutes !== null && minutes > 0) ||
        (actualBase !== null && actualBase !== undefined && actualBase > 0);
  const workKnown =
    working ||
    minutes === 0 ||
    (isMondayPay && !profile.commissionEligible) ||
    !profile.availableWeekdays.includes(weekday) ||
    profile.scheduledWeekdays.length === profile.shiftsPerWeek;
  const payCommission = !profile.commissionEligible
    ? 0
    : working
      ? day && day.retestComplete !== false
        ? commission(day.total)
        : null
      : workKnown
        ? 0
        : null;
  if (adjustment?.grassCut) base = base === null ? null : base + 5000;
  return {
    base,
    commission: payCommission,
    estimatedHours,
    working: working || !!adjustment?.grassCut,
    workKnown: workKnown || !!adjustment?.grassCut,
  };
}

/** Report projections only. No approved wage, payroll input or finance ledger is written. */
export function buildDashboard(
  query: DashboardQuery,
  today: string,
  snapshots: PortalDay[],
  payPlan: PayPlan,
): DashboardData {
  const byDate = new Map(snapshots.map((d) => [d.date, d]));
  const selectedDates = calendarDays(query.start, query.end);
  const selectedSnapshots = snapshots.filter((d) => selectedDates.includes(d.date));
  const selectedComplete = selectedDates.every((date) =>
    byDate.has(date) && byDate.get(date)!.retestComplete !== false);
  const needed = dashboardDates(query, today);
  const allInspectors = [
    ...new Set(snapshots.flatMap((d) => d.inspectors.map((i) => i.inspector))),
  ].sort();
  if (query.employee?.startsWith("inspector:")) {
    const requested = decodeURIComponent(query.employee.slice("inspector:".length));
    if (!allInspectors.includes(requested)) allInspectors.push(requested);
  }
  const rows: DashboardEmployee[] = payPlan.profiles.map((profile) => {
    const daily = selectedDates.map((date) => {
      const day = byDate.get(date);
      const count = day?.inspectors.find((g) => g.inspector === profile.inspector);
      return { ...dayPay(profile, date, day, payPlan), count };
    });
    const baseCents = nullableSum(daily.map((d) => d.base));
    const commissionCents = nullableSum(daily.map((d) => d.commission));
    const testsKnown =
      selectedComplete &&
      (profile.inspector !== null ||
        profile.mondayCents !== null ||
        selectedDates.every((d) => byDate.get(d)?.total === 0));
    return {
      id: profile.inspector ? inspectorKey(profile.inspector) : profile.id,
      name: profile.name,
      inspector: profile.inspector,
      cars: testsKnown ? daily.reduce((n, d) => n + (d.count?.total ?? 0), 0) : null,
      workingDays: daily.every((d) => d.workKnown) ? daily.filter((d) => d.working).length : null,
      revenueCents: testsKnown
        ? daily.reduce(
            (n, d) => n + ((d.count?.passed ?? 0) + (d.count?.failed ?? 0)) * TEST_PRICE_CENTS,
            0,
          )
        : null,
      baseCents,
      commissionCents,
      payCents: nullableSum([baseCents, commissionCents]),
      approximate: profile.approximate || daily.some((d) => d.estimatedHours),
      inspectionCadence: inspectionCadence(selectedSnapshots, profile.inspector),
    };
  });
  for (const inspector of allInspectors) {
    if (payPlan.profiles.some((p) => p.inspector === inspector)) continue;
    const days = selectedDates.flatMap((date) => {
      const day = byDate.get(date);
      const count = day?.inspectors.find((g) => g.inspector === inspector);
      return day && count ? [{ day, count }] : [];
    });
    rows.push({
      id: inspectorKey(inspector),
      name: inspector,
      inspector,
      cars: selectedComplete ? days.reduce((n, d) => n + d.count.total, 0) : null,
      workingDays: selectedDates.every((date) => byDate.has(date)) ? days.length : null,
      revenueCents: selectedComplete ? days.reduce((n, d) => n + (d.count.passed + d.count.failed) * TEST_PRICE_CENTS, 0) : null,
      baseCents: null, commissionCents: selectedComplete ?
        days.reduce((n, d) => n + commission(d.day.total), 0) : null,
      payCents: null, approximate: true,
      inspectionCadence: inspectionCadence(selectedSnapshots, inspector),
    });
  }
  const employeeOptions = rows.map(({ id, name }) => ({ id, name }));
  const selected = query.employee ? rows.filter((e) => e.id === query.employee) : rows;
  const selectedInspector = query.employee ? selected[0]?.inspector : undefined;
  const countFor = (day: PortalDay): Counts | null => {
    if (day.retestComplete === false) return null;
    if (!query.employee) return day;
    if (!selectedInspector)
      return day.total === 0 || selected[0]?.cars !== null ? emptyCounts() : null;
    return day.inspectors.find((i) => i.inspector === selectedInspector) ?? emptyCounts();
  };
  const seriesDates = calendarDays(
    query.start === query.end ? addDays(query.end, 1 - query.trendDays) : query.start,
    query.end,
  );
  const series = seriesDates.map((date) => {
    const day = byDate.get(date);
    const counts = day ? countFor(day) : null;
    const amounts = selected.map((e) => {
      const profile = payPlan.profiles.find(
        (p) => p.id === e.id || (e.inspector !== null && p.inspector === e.inspector),
      );
      if (profile) return dayPay(profile, date, day, payPlan).commission;
      return day && day.retestComplete !== false ?
        day.inspectors.some((i) => i.inspector === e.inspector) ? commission(day.total) : 0 : null;
    });
    return {
      date, cars: counts?.total ?? null, stationCars: day && day.retestComplete !== false ? day.total : null,
      revenueCents: counts ? (counts.passed + counts.failed) * TEST_PRICE_CENTS : null,
      commissionCents: day ? nullableSum(amounts) : null,
    };
  });
  const coveredDays = selectedDates.filter((d) => byDate.has(d) && byDate.get(d)!.retestComplete !== false).length;
  const complete = coveredDays === selectedDates.length;
  const totals = selectedDates.reduce((total, date) => {
    const day = byDate.get(date);
    if (day) {
      const counts = countFor(day);
      if (counts)
        for (const field of ["total", "passed", "failed", "aborted", "other"] as const)
          total[field] += counts[field];
    }
    return total;
  }, emptyCounts());
  const baseCents = nullableSum(selected.map((e) => e.baseCents));
  const commissionCents = nullableSum(selected.map((e) => e.commissionCents));
  const current = byDate.get(today);
  return {
    query, today, current: current && current.retestComplete !== false ? {
      date: today, retrievedAt: current.retrievedAt, total: current.total,
      passed: current.passed, failed: current.failed, aborted: current.aborted, other: current.other,
    } : null,
    summary: {
      inspectionCadence: inspectionCadence(
        selectedSnapshots,
        query.employee ? (selectedInspector ?? null) : undefined,
      ),
      cars: complete && (!query.employee || selected[0]?.cars !== null) ? totals.total : null,
      freeRetests: selectedDates.reduce((sum, date) => {
        const day = byDate.get(date);
        return sum + (day ? countFor(day)?.freeRetests ?? 0 : 0);
      }, 0),
      revenueCents: complete && (!query.employee || selected[0]?.revenueCents !== null) ?
        (totals.passed + totals.failed) * TEST_PRICE_CENTS : null,
      baseCents, commissionCents, payCents: nullableSum([baseCents, commissionCents]),
      passed: totals.passed, failed: totals.failed, aborted: totals.aborted, other: totals.other,
      coveredDays, expectedDays: selectedDates.length,
    },
    series, employees: selected, employeeOptions, inspectors: allInspectors, payPlan,
    missingDates: needed.filter((d) => !byDate.has(d)), staleDates: [],
    timingMissingDates: selectedSnapshots.filter((d) => d.total > 0 && !d.testTimes).map((d) => d.date),
    retestMissingDates: [],
    syncedAt: snapshots.length ? snapshots.map((d) => d.retrievedAt).sort().at(-1)! : null,
  };
}
