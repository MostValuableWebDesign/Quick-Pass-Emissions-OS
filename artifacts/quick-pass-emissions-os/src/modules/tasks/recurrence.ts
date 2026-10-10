import { Temporal } from "@js-temporal/polyfill";
import type { Frequency } from "@prisma/client";
export type Rule = {
  frequency: Frequency;
  startDate: string;
  endDate: string | null;
  weekdays: number[];
};
export function occursOn(rule: Rule, date: string, operatingDays: number[], closures: Set<string>) {
  if (date < rule.startDate || (rule.endDate && date > rule.endDate) || closures.has(date))
    return false;
  const d = Temporal.PlainDate.from(date),
    start = Temporal.PlainDate.from(rule.startDate);
  if (!operatingDays.includes(d.dayOfWeek)) return false;
  switch (rule.frequency) {
    case "ONCE":
      return date === rule.startDate;
    case "DAILY":
      return true;
    case "WEEKLY":
      return rule.weekdays.includes(d.dayOfWeek);
    // Preserve anchor day; short months clamp to their last day.
    case "MONTHLY":
      return d.day === Math.min(start.day, d.daysInMonth);
    case "QUARTERLY":
      return (
        ((d.year - start.year) * 12 + d.month - start.month) % 3 === 0 &&
        d.day === Math.min(start.day, d.daysInMonth)
      );
    case "ANNUAL":
      return d.month === start.month && d.day === Math.min(start.day, d.daysInMonth);
  }
}
