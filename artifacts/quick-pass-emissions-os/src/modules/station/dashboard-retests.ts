import { addDays } from "@/lib/time";
import { calendarDays, dashboardDates } from "./dashboard-calculations";
import type { DashboardQuery, PortalDay } from "./dashboard-types";

/** Calendar-day policy in the station timezone; day 30 is free, day 31 is paid. */
export function retestHistoryDates(query: DashboardQuery, today: string, allTimeStart?: string) {
  return [
    ...new Set(
      dashboardDates(query, today, allTimeStart).flatMap((date) =>
        calendarDays(addDays(date, -30), date),
      ),
    ),
  ].sort();
}

/** VIN coverage for retained rows; incomplete source rows are intentionally excluded. */
export function hasVinEvidence(day: PortalDay) {
  return (
    day.verifiedEmpty ||
    (day.testTimes?.length === day.total &&
      day.testTimes.every((test) => !!test.vinHash && !!test.recordKey && !!test.outcome))
  );
}

/** Replay distinct source tests, not distinct VINs. All inspectors share VIN history.
 * A free inspection is still a previous occurrence for a later inspection.
 * Legacy aggregate-only snapshots cannot establish paid car counts.
 */
export function classifyDashboardRetests(snapshots: PortalDay[]): PortalDay[] {
  const byDate = new Map(snapshots.map((day) => [day.date, day]));
  const latest = new Map<string, string>();
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((source) => {
      const day: PortalDay = {
        ...source,
        // Incomplete source rows were deliberately excluded; only retained tests count.
        rawTotal: source.total,
        freeRetests: 0,
        inspectors: source.inspectors.map((inspector) => ({
          ...inspector,
          rawTotal: inspector.total,
          freeRetests: 0,
        })),
        testTimes: [],
        // Unknown inspector/timing evidence must not bridge gaps between valid rows.
        paceTestTimes: source.incompleteRows?.total ? [] : source.testTimes,
        retestComplete:
          source.verifiedEmpty ||
          (hasVinEvidence(source) &&
            calendarDays(addDays(source.date, -30), addDays(source.date, -1)).every((date) => {
              const prior = byDate.get(date);
              return prior && hasVinEvidence(prior);
            })),
      };
      const rows = [...(source.testTimes ?? [])].sort(
        (a, b) =>
          (a.minute ?? -1) - (b.minute ?? -1) ||
          (a.recordKey ?? "").localeCompare(b.recordKey ?? ""),
      );
      const seenMinutes = new Map<string, number | null>();
      for (const test of rows) {
        if (!test.vinHash || !test.recordKey || !test.outcome) {
          day.retestComplete = false;
          continue;
        }
        const previous = latest.get(test.vinHash);
        // Minute-precision exports cannot assign the first paid inspection to an
        // employee/outcome if same-day VIN occurrences have ambiguous clock order.
        if (
          seenMinutes.has(test.vinHash) &&
          (test.minute === null ||
            seenMinutes.get(test.vinHash) === null ||
            seenMinutes.get(test.vinHash) === test.minute)
        )
          day.retestComplete = false;
        seenMinutes.set(test.vinHash, test.minute);
        const free = previous !== undefined && previous >= addDays(source.date, -30);
        latest.set(test.vinHash, source.date);
        if (!free) {
          day.testTimes!.push(test);
          continue;
        }
        day.total--;
        day[test.outcome]--;
        day.freeRetests!++;
        const inspector = day.inspectors.find((person) => person.inspector === test.inspector);
        if (inspector) {
          inspector.total--;
          inspector[test.outcome]--;
          inspector.freeRetests!++;
        }
      }
      return day;
    });
}
