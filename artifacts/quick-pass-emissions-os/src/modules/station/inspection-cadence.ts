import type { InspectionCadence, PortalDay } from "./dashboard-types";

/** Report-local clock time, not an inferred UTC instant or measured duration. */
export function reportMinute(sourceDate: string): number | null {
  const match = / (\d{2}):(\d{2}) (AM|PM)$/.exec(sourceDate);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return ((hour % 12) + (match[3] === "PM" ? 12 : 0)) * 60 + minute;
}

/** Sum daily first-to-last testing windows, then divide by cars, not gaps or daily averages. */
export function inspectionCadence(days: PortalDay[], inspector?: string | null): InspectionCadence {
  let minutes = 0;
  let cars = 0;
  let coveredDays = 0;
  for (const day of days) {
    if (inspector === null) continue;
    if (!day.testTimes) {
      if (day.verifiedEmpty) coveredDays++;
      continue;
    }
    // An employee uses their own window. The station uses one window for all staff,
    // so overlapping employee windows never double-count station elapsed time.
    const times = day.testTimes
      .filter((test) => inspector === undefined || test.inspector === inspector)
      .map((test) => test.minute);
    // Unknown timestamps can hide the first/last test; omit that day's estimate.
    if (times.some((time) => time === null)) continue;
    coveredDays++;
    if (times.length < 2) continue;
    const known = times as number[];
    const elapsed = Math.max(...known) - Math.min(...known);
    // A single clock minute does not establish a zero-minute test duration.
    if (elapsed <= 0) continue;
    minutes += elapsed;
    cars += times.length;
  }
  return { averageMinutes: cars ? minutes / cars : null, cars, coveredDays };
}
