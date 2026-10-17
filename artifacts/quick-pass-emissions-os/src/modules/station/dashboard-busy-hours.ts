import type { BusyHours, PortalDay } from "./dashboard-types";

/** Selected, counted inspections by report-local clock hour; never infer times for legacy caches. */
export function busyHours(
  dates: string[],
  snapshots: PortalDay[],
  inspector?: string | null,
): BusyHours {
  const buckets = Array<number>(24).fill(0);
  const byDate = new Map(snapshots.map((day) => [day.date, day]));
  let timedDays = 0;
  let untimedTests = 0;
  for (const date of dates) {
    const day = byDate.get(date);
    if (!day || day.retestComplete === false || day.incompleteRows?.total || inspector === null)
      continue;
    const count =
      inspector === undefined
        ? day.total
        : (day.inspectors.find((person) => person.inspector === inspector)?.total ?? 0);
    const times = (day.testTimes ?? []).filter(
      (test) =>
        (inspector === undefined || test.inspector === inspector) &&
        test.minute !== null &&
        Number.isInteger(test.minute) &&
        test.minute >= 0 &&
        test.minute < 1440,
    );
    for (const test of times) buckets[Math.floor(test.minute! / 60)]++;
    untimedTests += Math.max(0, count - times.length);
    if (times.length === count) timedDays++;
  }
  const complete = inspector !== null && timedDays === dates.length;
  const peakCount = Math.max(...buckets);
  return {
    hours: buckets.map((count, hour) => ({ hour, count: count || complete ? count : null })),
    observedTests: buckets.reduce((sum, count) => sum + count, 0),
    untimedTests,
    timedDays,
    expectedDays: dates.length,
    complete,
    linked: inspector !== null,
    peakHours: peakCount
      ? buckets.flatMap((count, hour) => (count === peakCount ? [hour] : []))
      : [],
    peakCount: peakCount || (complete ? 0 : null),
  };
}
