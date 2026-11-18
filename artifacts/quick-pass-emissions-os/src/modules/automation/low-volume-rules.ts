import { Temporal } from "@js-temporal/polyfill";
import { businessDate, dueInstant } from "@/lib/time";
import type { DashboardData } from "../station/dashboard-types";

export function lowVolumeWindow(
  now: Date,
  setting: { configured: boolean; operatingDays: number[] } | null,
  closed: boolean,
) {
  const date = businessDate(now);
  const due = dueInstant(date, "14:00");
  return {
    date,
    eligible:
      !!setting?.configured &&
      setting.operatingDays.includes(Temporal.PlainDate.from(date).dayOfWeek) &&
      !closed &&
      now >= due &&
      now.getTime() < due.getTime() + 15 * 60_000,
  };
}

export function lowVolumeCount(data: DashboardData, now: Date) {
  const date = businessDate(now);
  const retrieved = data.current ? Date.parse(data.current.retrievedAt) : NaN;
  if (
    data.query.start !== date ||
    data.query.end !== date ||
    data.query.employee ||
    data.current?.date !== date ||
    !Number.isFinite(retrieved) ||
    retrieved < dueInstant(date, "14:00").getTime() ||
    retrieved > now.getTime() ||
    now.getTime() - retrieved > 5 * 60_000 ||
    data.missingDates.includes(date) ||
    data.staleDates.includes(date) ||
    data.retestMissingDates.length ||
    data.knownIncompleteDates?.length ||
    data.reportIssues?.length ||
    data.summary.cars === null ||
    data.summary.coveredDays !== 1
  )
    return null;
  // Performance's revenue excludes aborts and free retests.
  const paid = data.summary.revenueCents;
  if (paid === null || paid < 0 || paid % 2000 !== 0) return null;
  return paid / 2000;
}

export function lowVolumeMessage(count: number, checkedAt: Date) {
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(checkedAt);
  return `${count} paid tests through 2:00 PM Eastern (checked ${time}). Consider sending Clinton home to reduce employee costs.`;
}
