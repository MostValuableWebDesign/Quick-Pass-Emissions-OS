import { dashboardDates } from "./dashboard-calculations";
import type { DashboardData } from "./dashboard-types";

/** Reuse the same backlog for one-shot refreshes and resumable foreground retrieval. */
export function pendingDashboardSourceDates(data: DashboardData, refresh = false) {
  const missing = [...data.missingDates, ...data.timingMissingDates, ...data.retestMissingDates];
  const incomplete = new Set(data.knownIncompleteDates ?? []);
  return [
    ...new Set(
      refresh && !missing.length
        ? dashboardDates(data.query, data.today, data.trendStart)
        : [...missing, ...data.staleDates],
    ),
  ].filter(
    (date) =>
      refresh || !incomplete.has(date) || (date === data.today && data.staleDates.includes(date)),
  );
}
