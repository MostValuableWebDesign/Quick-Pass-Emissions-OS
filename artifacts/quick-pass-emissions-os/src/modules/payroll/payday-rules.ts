import { Temporal } from "@js-temporal/polyfill";
import { businessDate, addDays, dueInstant } from "@/lib/time";
export function paydayCalendar(now = new Date()) {
  const date = businessDate(now);
  const weekday = Temporal.PlainDate.from(date).dayOfWeek;
  const daysAway = weekday === 6 ? 2 : weekday === 7 ? 1 : weekday === 1 ? 0 : null;
  return {
    date,
    nextRefreshAt: dueInstant(addDays(date, 1), "00:00").toISOString(),
    alert:
      daysAway === null
        ? null
        : {
            date,
            payDate: addDays(date, daysAway),
            daysAway,
            tone: daysAway === 2 ? "yellow" : daysAway === 1 ? "orange" : "red",
          },
  };
}
export type PaydaySnapshot = ReturnType<typeof paydayCalendar>;
