import type { InspectionCadence, PortalDay } from "./dashboard-types";

/** Report-local clock time, not an inferred UTC instant or measured duration. */
export function reportMinute(sourceDate: string): number | null {
  const match = / (\d{2}):(\d{2}) (AM|PM)$/.exec(sourceDate);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return (hour % 12 + (match[3] === "PM" ? 12 : 0)) * 60 + minute;
}

/** Pool individual intervals, not employee/day averages. Never cross dates or inspectors. */
export function inspectionCadence(days: PortalDay[], inspector?: string | null): InspectionCadence {
  let minutes = 0;
  let intervals = 0;
  let coveredDays = 0;
  for (const day of days) {
    if (inspector === null) continue;
    if (!day.testTimes) { if (day.verifiedEmpty) coveredDays++; continue; }
    const groups = new Map<string, (number | null)[]>();
    for (const test of day.testTimes) {
      if (inspector !== undefined && test.inspector !== inspector) continue;
      const times = groups.get(test.inspector) ?? [];
      times.push(test.minute);
      groups.set(test.inspector, times);
    }
    let complete = true;
    for (const times of groups.values()) {
      // A missing clock time makes sequence adjacency unverifiable for this employee/day.
      if (times.some((time) => time === null)) { complete = false; continue; }
      const sorted = (times as number[]).toSorted((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i] - sorted[i - 1];
        // Equal minute stamps cannot establish a zero-minute inspection.
        if (gap > 0) { minutes += gap; intervals++; }
      }
    }
    if (complete) coveredDays++;
  }
  return { averageMinutes: intervals ? minutes / intervals : null, intervals, coveredDays };
}
