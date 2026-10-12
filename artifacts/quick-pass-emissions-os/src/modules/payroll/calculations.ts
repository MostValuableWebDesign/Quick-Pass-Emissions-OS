// Currency stays in integer cents. BigInt intermediates avoid floating-point rounding.
export const MAX_CENTS = 2_000_000_000;
export function boundedInteger(value: number, max = MAX_CENTS) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max)
    throw new Error("Invalid calculation range.");
  return value;
}
export function exactCents(value: bigint) {
  if (value < 0n || value > BigInt(MAX_CENTS))
    throw new Error("Calculation exceeds supported cents range.");
  return Number(value);
}
export function hourlyCents(rateCents: number, minutes: number) {
  boundedInteger(rateCents);
  boundedInteger(minutes, 60 * 24 * 366);
  // Round half up once per employee per period, at the nearest cent.
  return exactCents((BigInt(rateCents) * BigInt(minutes) + 30n) / 60n);
}
export function commissionCents(
  count: number,
  threshold: number,
  rateCents: number,
  eligible: boolean,
  volume?: { volumeThreshold?: number | null; volumeIncreaseCents?: number | null },
) {
  boundedInteger(count, 100000);
  boundedInteger(threshold, 100000);
  boundedInteger(rateCents);
  let extra = 0n;
  if (volume?.volumeThreshold != null && volume.volumeIncreaseCents != null) {
    boundedInteger(volume.volumeThreshold, 100000);
    boundedInteger(volume.volumeIncreaseCents);
    if (volume.volumeThreshold < threshold)
      throw new Error("Volume threshold must follow the base threshold.");
    extra =
      BigInt(Math.max(0, count - volume.volumeThreshold)) * BigInt(volume.volumeIncreaseCents);
  }
  return eligible
    ? exactCents(BigInt(Math.max(0, count - threshold)) * BigInt(rateCents) + extra)
    : 0;
}
/** Shop commission uses complete approved daily counts, never a paginated roster. */
export function commissionBasisCount(
  attribution: string,
  personalCount: number,
  date: string,
  shopCounts: { date: string; count: number; approvedAt: Date | null }[],
) {
  if (attribution === "PERSONAL_APPROVED_DAILY") return personalCount;
  if (attribution !== "SHOP_WIDE_APPROVED_DAILY")
    throw new Error("Unsupported commission attribution.");
  const daily = shopCounts.filter((c) => c.date === date);
  if (!daily.length || daily.some((c) => !c.approvedAt)) return null;
  const total = daily.reduce((sum, c) => sum + boundedInteger(c.count, 100000), 0);
  return boundedInteger(total, 100000);
}
export function sumCents(values: number[]) {
  return exactCents(values.reduce((sum, v) => sum + BigInt(boundedInteger(v)), 0n));
}
/** Shared actual-period engine for payroll drafts and provisional explanations.
 * Approval/completeness checks belong to callers; missing inputs stay null.
 */
export function periodAmounts(
  arrangement: { kind: "FIXED" | "HOURLY" | "DAILY" | "WEEKLY"; amountCents: number } | null,
  minutes: number | null,
  dailyCommissions: (number | null)[],
  units: { paidDays?: number | null; periodDays?: number } = {},
) {
  let scheduledBase: number | null = null;
  if (arrangement?.kind === "DAILY" && minutes === 0 && units.paidDays != null) {
    boundedInteger(units.paidDays, 366);
    scheduledBase = exactCents(BigInt(arrangement.amountCents) * BigInt(units.paidDays));
  }
  if (arrangement?.kind === "WEEKLY" && minutes === 0 && units.periodDays != null) {
    boundedInteger(units.periodDays, 366);
    if (units.periodDays > 0 && units.periodDays % 7 === 0)
      scheduledBase = exactCents(BigInt(arrangement.amountCents) * BigInt(units.periodDays / 7));
  }
  const baseCents =
    arrangement && minutes !== null
      ? arrangement.kind === "FIXED"
        ? minutes === 0
          ? boundedInteger(arrangement.amountCents)
          : null
        : arrangement.kind === "HOURLY"
          ? hourlyCents(arrangement.amountCents, minutes)
          : scheduledBase
      : null;
  const commission = dailyCommissions.every((n): n is number => n !== null)
    ? sumCents(dailyCommissions)
    : null;
  return {
    baseCents,
    commissionCents: commission,
    totalCents:
      baseCents !== null && commission !== null ? sumCents([baseCents, commission]) : null,
  };
}
export function formatMoney(cents: number) {
  boundedInteger(cents);
  return `$${Math.floor(cents / 100).toLocaleString("en-US")}.${String(cents % 100).padStart(2, "0")}`;
}
export function csvCell(value: string | number) {
  const text = String(value);
  // Quoting does not prevent spreadsheet formula evaluation.
  return `"${(/^[\s]*[=+\-@\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
}

/** Display equivalents only: schedules are never substituted for approved payroll inputs. */
export function baseRateSummary(
  a: {
    kind: "FIXED" | "HOURLY" | "DAILY" | "WEEKLY";
    amountCents: number;
    scheduledDaysPerWeek?: number | null;
    scheduledMinutesPerDay?: number | null;
  } | null,
) {
  if (!a) return { daily: null, weekly: null };
  const days = a.scheduledDaysPerWeek;
  if (days != null) boundedInteger(days, 7);
  const daily =
    a.kind === "DAILY"
      ? a.amountCents
      : a.kind === "WEEKLY" && days
        ? exactCents((BigInt(a.amountCents) + BigInt(Math.floor(days / 2))) / BigInt(days))
        : a.kind === "HOURLY" && a.scheduledMinutesPerDay
          ? hourlyCents(a.amountCents, a.scheduledMinutesPerDay)
          : null;
  const weekly =
    a.kind === "WEEKLY"
      ? a.amountCents
      : a.kind === "HOURLY" && a.scheduledMinutesPerDay && days
        ? hourlyCents(a.amountCents, a.scheduledMinutesPerDay * days)
        : daily !== null && days
          ? exactCents(BigInt(daily) * BigInt(days))
          : null;
  return { daily, weekly };
}
export function adjustedCents(
  amount: number,
  basisPoints: number,
  direction: "INCREASE" | "DECREASE",
) {
  boundedInteger(amount);
  boundedInteger(basisPoints, 1000000);
  if (basisPoints < 1 || (direction === "DECREASE" && basisPoints > 10000))
    throw new Error("Invalid adjustment percentage.");
  const multiplier = 10000 + (direction === "INCREASE" ? basisPoints : -basisPoints);
  return exactCents((BigInt(amount) * BigInt(multiplier) + 5000n) / 10000n);
}
