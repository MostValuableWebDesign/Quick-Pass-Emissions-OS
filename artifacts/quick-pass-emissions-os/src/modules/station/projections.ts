import { Temporal } from "@js-temporal/polyfill";
import { dueInstant, addDays } from "@/lib/time";
export type Hours = { weekday: number; open: string; close: string }[];
export function weekBounds(date: string, weekStart: number) {
  const weekday = Temporal.PlainDate.from(date).dayOfWeek;
  const start = addDays(date, -((weekday - weekStart + 7) % 7));
  return { start, end: addDays(start, 6) };
}
export function operatingMinutes(date: string, hours: Hours, closures: string[]) {
  if (closures.includes(date)) return 0;
  const h = hours.find((v) => v.weekday === Temporal.PlainDate.from(date).dayOfWeek);
  return h ? (dueInstant(date, h.close).getTime() - dueInstant(date, h.open).getTime()) / 60000 : 0;
}
export function elapsedMinutes(date: string, hours: Hours, closures: string[], now: Date) {
  const total = operatingMinutes(date, hours, closures);
  const h = hours.find((v) => v.weekday === Temporal.PlainDate.from(date).dayOfWeek);
  if (!h || total === 0) return { elapsed: 0, remaining: 0, total };
  const elapsed = Math.max(
    0,
    Math.min(total, (now.getTime() - dueInstant(date, h.open).getTime()) / 60000),
  );
  return { elapsed, remaining: total - elapsed, total };
}
export function estimateTests(input: {
  historicalTests: number;
  historicalMinutes: number;
  usableDays: number;
  minimumDays: number;
  performed: number;
  remainingMinutes: number;
  currentCoverage: boolean;
  pending: number;
}) {
  if (
    !input.currentCoverage ||
    input.pending ||
    input.usableDays < input.minimumDays ||
    input.historicalMinutes <= 0 ||
    input.historicalTests <= 0
  )
    return { status: "Insufficient data" as const, projected: null, additional: null };
  // Performed work is retained once; historical rate applies only to confirmed remaining time.
  const additional = Math.round(
    (input.historicalTests * input.remainingMinutes) / input.historicalMinutes,
  );
  return { status: "Estimate" as const, projected: input.performed + additional, additional };
}
