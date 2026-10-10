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
) {
  boundedInteger(count, 100000);
  boundedInteger(threshold, 100000);
  boundedInteger(rateCents);
  return eligible ? exactCents(BigInt(Math.max(0, count - threshold)) * BigInt(rateCents)) : 0;
}
export function sumCents(values: number[]) {
  return exactCents(values.reduce((sum, v) => sum + BigInt(boundedInteger(v)), 0n));
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
