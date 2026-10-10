import { Temporal } from "@js-temporal/polyfill";
export const TIMEZONE = "America/New_York";
export function businessDate(now = new Date()) {
  return Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO(TIMEZONE)
    .toPlainDate()
    .toString();
}
export function dueInstant(date: string, time: string) {
  // Explicit policy: spring gap moves forward; fall overlap uses the earlier instant.
  return new Date(
    Temporal.PlainDate.from(date)
      .toPlainDateTime(Temporal.PlainTime.from(time))
      .toZonedDateTime(TIMEZONE, { disambiguation: "compatible" }).epochMilliseconds,
  );
}
export function addDays(date: string, days: number) {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}
export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
