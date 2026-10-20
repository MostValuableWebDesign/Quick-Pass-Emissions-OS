import { addDays } from "@/lib/time";
import type { PortalDay } from "./dashboard-types";

export type RepeatVehicleAnalysis = {
  start: string;
  end: string;
  identifiedInspections: number;
  unidentifiedInspections: number;
  distinctVehicles: number;
  repeatVehicles: number;
  repeatVisits: number;
  freeRetests: number;
  paidRepeatInspections: number;
  classificationUnknownDates: number;
};

/** Aggregate only verified VIN hashes. Never return or render raw vehicle identifiers. */
export function analyzeRepeatVehicleHistory(days: PortalDay[], start: string, end: string) {
  const latest = new Map<string, string>();
  const visits = new Map<string, number>();
  let identifiedInspections = 0;
  let unidentifiedInspections = 0;
  let freeRetests = 0;
  let paidRepeatInspections = 0;
  let classificationUnknownDates = 0;

  for (const day of days
    .filter((entry) => entry.date >= start && entry.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date))) {
    if (day.verifiedEmpty) continue;
    if (day.retestComplete === false) classificationUnknownDates++;
    const sourceRows = day.paceTestTimes ?? [];
    const rows = sourceRows
      .filter((row) => row.vinHash && row.recordKey && row.outcome)
      .sort(
        (a, b) =>
          (a.minute ?? -1) - (b.minute ?? -1) ||
          (a.recordKey ?? "").localeCompare(b.recordKey ?? ""),
      );
    const total = day.rawTotal ?? day.total + (day.freeRetests ?? 0);
    identifiedInspections += rows.length;
    unidentifiedInspections += Math.max(0, total - rows.length) + (day.incompleteRows?.total ?? 0);

    for (const row of rows) {
      const hash = row.vinHash!;
      const previousDate = latest.get(hash);
      if (previousDate) {
        if (previousDate >= addDays(day.date, -30)) freeRetests++;
        else paidRepeatInspections++;
      }
      latest.set(hash, day.date);
      visits.set(hash, (visits.get(hash) ?? 0) + 1);
    }
  }

  const repeatVehicles = [...visits.values()].filter((count) => count > 1).length;
  return {
    start,
    end,
    identifiedInspections,
    unidentifiedInspections,
    distinctVehicles: visits.size,
    repeatVehicles,
    repeatVisits: identifiedInspections - visits.size,
    freeRetests,
    paidRepeatInspections,
    classificationUnknownDates,
  } satisfies RepeatVehicleAnalysis;
}
