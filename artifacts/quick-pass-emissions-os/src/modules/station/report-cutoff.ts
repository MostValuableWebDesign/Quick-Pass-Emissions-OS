import { BusinessError } from "../phase2";
import type { Counts, PortalDay } from "./dashboard-types";

/** Filter before free-retest classification, using the source's local test minute. */
export function reportThroughMinute(day: PortalDay, minute: number): PortalDay {
  if (
    Number.isInteger(minute) &&
    minute >= 0 &&
    minute <= 1439 &&
    day.verifiedEmpty &&
    day.total === 0
  )
    return { ...day, testTimes: [] };
  if (
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 1439 ||
    !day.testTimes ||
    day.testTimes.length !== day.total ||
    day.testTimes.some((test) => test.minute === null || !test.outcome)
  )
    throw new BusinessError("The 2 PM cutoff cannot be verified from this report's test times.");
  const testTimes = day.testTimes.filter((test) => test.minute! <= minute);
  const empty = (): Counts => ({ total: 0, passed: 0, failed: 0, aborted: 0, other: 0 });
  const counts = empty();
  const inspectors = new Map<string, Counts & { inspector: string }>();
  for (const test of testTimes) {
    const inspector = inspectors.get(test.inspector) ?? { ...empty(), inspector: test.inspector };
    inspector.total++;
    inspector[test.outcome!]++;
    counts.total++;
    counts[test.outcome!]++;
    inspectors.set(test.inspector, inspector);
  }
  return {
    ...day,
    ...counts,
    testTimes,
    inspectors: [...inspectors.values()],
    // Derived cutoff zero only; the original saved source snapshot is unchanged.
    verifiedEmpty: testTimes.length === 0,
  };
}
