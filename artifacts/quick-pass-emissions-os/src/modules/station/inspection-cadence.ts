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

/** Pair only adjacent tests for the same inspector/date; pool retained gaps for the median. */
export function inspectionCadence(
  days: PortalDay[],
  inspector?: string | null,
  longGapMinutes: number | null = null,
): InspectionCadence {
  const gaps: number[] = [];
  let excludedLongGaps = 0;
  let excludedOvernightGaps = 0;
  let coveredDays = 0;
  let timedTests = 0;
  const priorDates = new Map<string, string>();
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (inspector === null) continue;
    // VIN coverage affects billing, not whether a physical test took time.
    const tests = day.paceTestTimes ?? day.testTimes;
    if (!tests) {
      if (day.verifiedEmpty) coveredDays++;
      continue;
    }
    const selected = tests.filter(
      (test) => inspector === undefined || test.inspector === inspector,
    );
    const expected =
      inspector === undefined
        ? (day.rawTotal ?? day.total)
        : (day.inspectors.find((person) => person.inspector === inspector)?.rawTotal ??
          day.inspectors.find((person) => person.inspector === inspector)?.total ??
          0);
    const valid = (minute: number | null): minute is number =>
      minute !== null && Number.isInteger(minute) && minute >= 0 && minute < 1440;
    if (selected.length === expected && selected.every((test) => valid(test.minute))) coveredDays++;
    const employees = new Set(selected.map((test) => test.inspector));
    for (const employee of employees) {
      const rows = selected.filter((test) => test.inspector === employee);
      const employeeCount = day.inspectors.find((person) => person.inspector === employee);
      // An unknown timestamp breaks adjacency; omit this employee/day rather than bridge it.
      if (
        rows.length !== (employeeCount?.rawTotal ?? employeeCount?.total ?? 0) ||
        rows.some((test) => !valid(test.minute))
      )
        continue;
      const times = rows.map((test) => test.minute as number).sort((a, b) => a - b);
      timedTests += times.length;
      const prior = priorDates.get(employee);
      if (prior && prior !== day.date) excludedOvernightGaps++;
      priorDates.set(employee, day.date);
      for (let i = 1; i < times.length; i++) {
        const gap = times[i] - times[i - 1];
        if (longGapMinutes !== null && gap > longGapMinutes) excludedLongGaps++;
        else gaps.push(gap);
      }
    }
  }
  gaps.sort((a, b) => a - b);
  const middle = Math.floor(gaps.length / 2);
  const medianMinutes = !gaps.length
    ? null
    : gaps.length % 2
      ? gaps[middle]
      : (gaps[middle - 1] + gaps[middle]) / 2;
  return {
    medianMinutes,
    includedGaps: gaps.length,
    excludedLongGaps,
    excludedOvernightGaps,
    coveredDays,
    timedTests,
  };
}
