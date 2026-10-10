import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { addDays, businessDate } from "@/lib/time";
import { dateString } from "@/lib/validation";
import { sumCents } from "../finance/rules";
import { operatingMinutes, type Hours } from "./projections";

export type AnalyticsRecord = {
  employeeId: string | null;
  state: string;
  eligible: boolean | null;
  source: { businessDate: string; sourceDate: string; outcome: string };
};
type Setting = { effectiveDate: string; sourceTimezoneConfirmed: boolean; hours: unknown };
type Coverage = { date: string; attested: boolean };
export function previousRange(start: string, end: string) {
  const length = Temporal.PlainDate.from(start).until(end).days + 1;
  const range = { start: addDays(start, -length), end: addDays(start, -1) };
  return dateString.safeParse(range.start).success ? range : null;
}
export function sourceHour(value: string) {
  const match = / (0[1-9]|1[0-2]):([0-5]\d) (AM|PM)$/.exec(value);
  return match ? (Number(match[1]) % 12) + (match[3] === "PM" ? 12 : 0) : null;
}
export function testBreakdown(records: AnalyticsRecord[]) {
  const groups = new Map<string, { outcome: string; confirmed: number; pending: number }>();
  for (const record of records) {
    const row = groups.get(record.source.outcome) ?? {
      outcome: record.source.outcome,
      confirmed: 0,
      pending: 0,
    };
    if (record.state === "CONFIRMED") row.confirmed++;
    else row.pending++;
    groups.set(row.outcome, row);
  }
  return [...groups.values()].sort((a, b) => a.outcome.localeCompare(b.outcome));
}
export function trendPeriod(input: {
  start: string;
  end: string;
  records: AnalyticsRecord[];
  coverage: Coverage[];
  settings: Setting[];
  closures: string[];
  now: Date;
}) {
  const today = businessDate(input.now);
  const settings = [...input.settings].sort((a, b) =>
    b.effectiveDate.localeCompare(a.effectiveDate),
  );
  const days = [];
  for (let date = input.start; date <= input.end; date = addDays(date, 1)) {
    const records = input.records.filter((r) => r.source.businessDate === date);
    const setting = settings.find((s) => s.effectiveDate <= date);
    const minutes = setting ? operatingMinutes(date, setting.hours as Hours, input.closures) : null;
    const confirmed = records.filter((r) => r.state === "CONFIRMED").length;
    const pending = records.length - confirmed;
    const attested = input.coverage.some((d) => d.date === date && d.attested);
    const status =
      date >= today
        ? "Day in progress"
        : !setting
          ? "Hours not configured"
          : !setting.sourceTimezoneConfirmed
            ? "Timezone unverified"
            : minutes === 0
              ? records.length
                ? "Records on closed date"
                : "Closed"
              : !records.length
                ? "No report — unknown"
                : pending
                  ? "Pending identities"
                  : !attested
                    ? "Coverage incomplete"
                    : "Covered";
    days.push({
      date,
      confirmed,
      pending,
      minutes,
      status,
      attested,
      complete: status === "Covered" || status === "Closed",
      // An absent report is never a measured zero. Closed dates have no count bar.
      displayedCount: records.length ? confirmed : null,
      testsPerHour: status === "Covered" && minutes ? (confirmed * 60) / minutes : null,
    });
  }
  const complete = days.every((d) => d.complete);
  const minutes = days.reduce((n, d) => n + (d.minutes ?? 0), 0);
  const confirmed = input.records.filter((r) => r.state === "CONFIRMED").length;
  const withoutTime = input.records.filter((r) => sourceHour(r.source.sourceDate) === null);
  const hourlyComplete = complete && withoutTime.length === 0 && minutes > 0;
  const hours = Array.from({ length: 24 }, (_, hour) => {
    const records = input.records.filter((r) => sourceHour(r.source.sourceDate) === hour);
    const count = records.filter((r) => r.state === "CONFIRMED").length;
    return {
      hour,
      confirmed: count,
      pending: records.length - count,
      displayedCount: records.length || hourlyComplete ? count : null,
    };
  });
  return {
    start: input.start,
    end: input.end,
    days,
    hours,
    complete,
    minutes,
    confirmed,
    coveredDays: days.filter((d) => d.status === "Covered").length,
    openDays: days.filter((d) => d.minutes !== null && d.minutes > 0).length,
    withoutTime: {
      confirmed: withoutTime.filter((r) => r.state === "CONFIRMED").length,
      pending: withoutTime.filter((r) => r.state !== "CONFIRMED").length,
    },
    testsPerHour: complete && minutes > 0 ? (confirmed * 60) / minutes : null,
  };
}
export function compareTrends(
  current: ReturnType<typeof trendPeriod>,
  previous: ReturnType<typeof trendPeriod> | null,
) {
  const ready = current.testsPerHour !== null && previous?.testsPerHour != null;
  return {
    ready,
    countChange: ready ? current.confirmed - previous!.confirmed : null,
    rateChange: ready ? current.testsPerHour! - previous!.testsPerHour! : null,
    percentRateChange:
      ready && previous!.testsPerHour! > 0
        ? (current.testsPerHour! / previous!.testsPerHour! - 1) * 100
        : null,
    reason: ready
      ? "Equal calendar-length periods; tests per configured open hour adjusts for different open days and DST. This is station activity, not employee productivity."
      : "Comparison withheld: both periods need ended days, confirmed source timezone, configured hours and complete reviewed report coverage on every open date. Missing reports are not zero. Closed dates with records require review.",
  };
}

type DailyPay = {
  employeeId: string;
  date: string;
  count: number;
  approved: boolean;
  commissionCents: number | null;
};
type PeriodPay = {
  employeeId: string;
  periodId: string;
  start: string;
  end: string;
  status: string;
  baseCents: number | null;
  grossCents: number | null;
  missing: string[];
  snapshot:
    | { baseCents: number; commissionCents: number; totalCents: number; snapshot: unknown }
    | undefined;
};
const frozenDaily = z.object({
  period: z.object({ startDate: dateString, endDate: dateString }),
  input: z.object({ emissionsComplete: z.literal(true) }),
  daily: z.array(
    z.object({
      date: dateString,
      count: z.number().int().min(0).max(100000),
      cents: z.number().int().min(0).max(2000000000),
    }),
  ),
});
export function employeePerformance(input: {
  start: string;
  end: string;
  records: AnalyticsRecord[];
  pay: {
    daily: DailyPay[];
    periods: PeriodPay[];
    employees: { id: string; user: { name: string } }[];
  };
}) {
  return input.pay.employees.map((employee) => {
    const records = input.records.filter((r) => r.employeeId === employee.id);
    const periods = input.pay.periods.filter((p) => p.employeeId === employee.id);
    const days = new Map(
      input.pay.daily
        .filter((d) => d.employeeId === employee.id && d.date >= input.start && d.date <= input.end)
        .map((d) => [d.date, { ...d, snapshot: false }]),
    );
    let invalidSnapshot = false;
    let snapshotZero = false;
    for (const period of periods.filter((p) => p.snapshot)) {
      // Current inputs/policies must never replace an approved historical calculation.
      for (const date of days.keys())
        if (date >= period.start && date <= period.end) days.delete(date);
      const parsed = frozenDaily.safeParse(period.snapshot!.snapshot);
      if (
        !parsed.success ||
        parsed.data.period.startDate !== period.start ||
        parsed.data.period.endDate !== period.end ||
        new Set(parsed.data.daily.map((d) => d.date)).size !== parsed.data.daily.length ||
        parsed.data.daily.some((d) => d.date < period.start || d.date > period.end) ||
        sumCents(parsed.data.daily.map((d) => d.cents)) !== period.snapshot!.commissionCents
      ) {
        invalidSnapshot = true;
        continue;
      }
      if (period.snapshot!.commissionCents === 0) snapshotZero = true;
      for (const day of parsed.data.daily)
        if (day.date >= input.start && day.date <= input.end)
          days.set(day.date, {
            employeeId: employee.id,
            date: day.date,
            count: day.count,
            approved: true,
            commissionCents: day.cents,
            snapshot: true,
          });
    }
    const daily = [...days.values()];
    const unapprovedDays = daily.filter((d) => !d.approved).length;
    const missingPolicyDays = daily.filter((d) => d.commissionCents === null).length;
    const partial = periods.filter((p) => p.start < input.start || p.end > input.end).length;
    const approved = periods.filter((p) => p.snapshot).length;
    const missing = [...new Set(periods.filter((p) => !p.snapshot).flatMap((p) => p.missing))];
    const status = !periods.length
      ? "No payroll period"
      : partial
        ? "Partial period — pay not allocated"
        : missing.length
          ? "Incomplete inputs"
          : approved === periods.length
            ? "Approved payroll snapshots"
            : approved
              ? "Mixed approvals — totals withheld"
              : "Provisional — awaiting payroll approval";
    const canTotal =
      periods.length > 0 &&
      !partial &&
      !missing.length &&
      (approved === 0 || approved === periods.length);
    const base = periods.map((p) => p.snapshot?.baseCents ?? p.baseCents);
    const gross = periods.map((p) => p.snapshot?.totalCents ?? p.grossCents);
    return {
      employeeId: employee.id,
      name: employee.user.name,
      confirmed: records.filter((r) => r.state === "CONFIRMED").length,
      pending: records.filter((r) => r.state !== "CONFIRMED").length,
      eligible: records.filter((r) => r.state === "CONFIRMED" && r.eligible === true).length,
      unresolvedEligibility: records.filter((r) => r.state === "CONFIRMED" && r.eligible === null)
        .length,
      recordedPayDays: daily.length,
      unapprovedDays,
      missingPolicyDays,
      approvedCounts:
        !invalidSnapshot && (daily.length > 0 || snapshotZero)
          ? daily.filter((d) => d.approved).reduce((n, d) => n + d.count, 0)
          : null,
      commissionCents:
        !invalidSnapshot &&
        !unapprovedDays &&
        !missingPolicyDays &&
        (daily.length > 0 || snapshotZero)
          ? sumCents(daily.map((d) => d.commissionCents!))
          : null,
      commissionBasis: invalidSnapshot
        ? "Approved daily snapshot unavailable; no live substitution"
        : daily.some((d) => d.snapshot) || snapshotZero
          ? "Approved snapshots plus any approved days outside them"
          : "Recorded approved daily inputs only; missing dates are not inferred",
      baseCents: canTotal && base.every((n) => n !== null) ? sumCents(base as number[]) : null,
      grossCents: canTotal && gross.every((n) => n !== null) ? sumCents(gross as number[]) : null,
      status,
      partialPeriods: partial,
      periodCount: periods.length,
      approvedPeriods: approved,
      missing,
    };
  });
}
