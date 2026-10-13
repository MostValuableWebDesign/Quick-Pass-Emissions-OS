import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { addDays } from "../src/lib/time";
import {
  buildDashboard,
  calendarDays,
  inspectorKey,
} from "../src/modules/station/dashboard-calculations";
import {
  classifyDashboardRetests,
  retestHistoryDates,
} from "../src/modules/station/dashboard-retests";
import { dashboardDaySchema } from "../src/modules/station/dashboard-service";
import type { PayPlan, PortalDay } from "../src/modules/station/dashboard-types";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const today = "2026-04-01";
const query = { start: today, end: today, trendDays: 7 as const };
const empty = (date: string): PortalDay => ({
  date,
  total: 0,
  passed: 0,
  failed: 0,
  aborted: 0,
  other: 0,
  inspectors: [],
  testTimes: [],
  verifiedEmpty: true,
  retrievedAt: "2026-04-02T12:00:00Z",
});
type TestInput = {
  vin: string;
  inspector?: string;
  outcome?: "passed" | "failed" | "aborted" | "other";
  minute?: number | null;
};
function sourceDay(date: string, tests: TestInput[]): PortalDay {
  const day = { ...empty(date), verifiedEmpty: tests.length === 0 };
  tests.forEach((test, index) => {
    const inspector = test.inspector ?? "A";
    const outcome = test.outcome ?? "passed";
    let counts = day.inspectors.find((person) => person.inspector === inspector);
    if (!counts) {
      counts = { inspector, total: 0, passed: 0, failed: 0, aborted: 0, other: 0 };
      day.inspectors.push(counts);
    }
    day.total++;
    day[outcome]++;
    counts.total++;
    counts[outcome]++;
    day.testTimes!.push({
      inspector,
      outcome,
      minute: test.minute === undefined ? 540 + index * 10 : test.minute,
      vinHash: hash(test.vin),
      recordKey: hash(`${date}:${index}`),
    });
  });
  return day;
}
function history(days: PortalDay[]) {
  const first = days.map((day) => day.date).sort()[0];
  const last = days
    .map((day) => day.date)
    .sort()
    .at(-1)!;
  const byDate = new Map(
    calendarDays(addDays(first, -30), last).map((date) => [date, empty(date)]),
  );
  days.forEach((day) => byDate.set(day.date, day));
  return [...byDate.values()];
}
const plan: PayPlan = {
  revision: 0,
  adjustments: [],
  profiles: ["A", "B"].map((name) => ({
    id: name,
    name,
    inspector: name,
    hourlyCents: 2300,
    mondayCents: null,
    standardMinutes: 600,
    shiftsPerWeek: 5,
    availableWeekdays: [1, 2, 3, 4, 5, 6],
    scheduledWeekdays: [],
    commissionEligible: true,
    approximate: false,
  })),
};
const dashboard = (days: PortalDay[], employee?: string) =>
  buildDashboard({ ...query, employee }, today, classifyDashboardRetests(history(days)), plan);

describe("VIN-based free retests", () => {
  it.each([0, 1, 29, 30])(
    "excludes a repeat at %i calendar days, including across inspectors",
    (gap) => {
      const prior = sourceDay(addDays(today, -gap), [{ vin: "repeat", inspector: "B" }]);
      const current = sourceDay(
        today,
        gap === 0
          ? [
              { vin: "repeat", inspector: "B", minute: 540 },
              { vin: "repeat", inspector: "A", minute: 550 },
            ]
          : [{ vin: "repeat", inspector: "A" }],
      );
      const data = dashboard(gap === 0 ? [current] : [prior, current]);
      expect(data.summary.cars).toBe(gap === 0 ? 1 : 0);
      expect(data.summary.revenueCents).toBe(gap === 0 ? 2000 : 0);
      expect(data.summary.freeRetests).toBe(1);
      expect(data.employees.find((person) => person.inspector === "A")?.cars).toBe(0);
      // A free-only employee still worked; base pay must not disappear.
      expect(data.employees.find((person) => person.inspector === "A")?.baseCents).toBe(23000);
    },
  );
  it("counts a day-31 repeat as paid and does not include lookback revenue in selected totals", () => {
    const data = dashboard([
      sourceDay(addDays(today, -31), [{ vin: "repeat" }]),
      sourceDay(today, [{ vin: "repeat", outcome: "failed" }]),
    ]);
    expect(data.summary).toMatchObject({ cars: 1, failed: 1, revenueCents: 2000, freeRetests: 0 });
  });
  it("uses the most recent occurrence, including a previous free retest", () => {
    const data = dashboard([
      sourceDay(addDays(today, -40), [{ vin: "repeat" }]),
      sourceDay(addDays(today, -20), [{ vin: "repeat" }]),
      sourceDay(today, [{ vin: "repeat" }]),
    ]);
    expect(data.summary.cars).toBe(0);
  });
  it("uses calendar days through DST and accepts unsorted snapshots", () => {
    const data = buildDashboard(
      query,
      today,
      classifyDashboardRetests(
        history([
          sourceDay(today, [{ vin: "repeat" }]),
          sourceDay("2026-03-02", [{ vin: "repeat" }]),
        ]).reverse(),
      ),
      plan,
    );
    expect(data.summary.cars).toBe(0);
  });
  it("does not classify equal-minute or unknown-time same-VIN tests as paid with a guessed order", () => {
    for (const minute of [540, null]) {
      const data = dashboard([
        sourceDay(today, [
          { vin: "repeat", minute },
          { vin: "repeat", minute },
        ]),
      ]);
      expect(data.summary.cars).toBeNull();
      expect(data.summary.revenueCents).toBeNull();
    }
  });
  it("preserves unknown totals and commissions when historical coverage is missing", () => {
    const days = history([sourceDay(today, [{ vin: "new" }])]).filter(
      (day) => day.date !== addDays(today, -30),
    );
    const data = buildDashboard(query, today, classifyDashboardRetests(days), plan);
    expect(data.summary.cars).toBeNull();
    expect(data.summary.revenueCents).toBeNull();
    expect(data.summary.commissionCents).toBeNull();
    expect(data.employees.find((person) => person.inspector === "A")?.baseCents).toBe(23000);
    expect(data.series.at(-1)?.cars).toBeNull();
    expect(data.summary.inspectionCadence.medianMinutes).toBeNull();
  });
  it("includes free retests in pace while leaving revenue and commission counts unchanged", () => {
    const source = sourceDay(today, [
      { vin: "same", minute: 540 },
      { vin: "same", minute: 550 },
      { vin: "other", minute: 562 },
    ]);
    const data = dashboard([source]);
    expect(data.summary.cars).toBe(2);
    expect(data.summary.revenueCents).toBe(4000);
    expect(data.summary.freeRetests).toBe(1);
    expect(data.summary.inspectionCadence).toMatchObject({
      medianMinutes: 11,
      timedTests: 3,
      includedGaps: 2,
    });
    const incomplete = buildDashboard(query, today, classifyDashboardRetests([source]), plan);
    expect(incomplete.summary.cars).toBeNull();
    expect(incomplete.summary.inspectionCadence.medianMinutes).toBe(11);
  });
  it("requires VIN-bearing backfill for legacy cached timing/count snapshots", () => {
    const legacy = {
      ...sourceDay(today, [{ vin: "new" }]),
      testTimes: [{ inspector: "A", minute: 540 }],
    };
    expect(dashboardDaySchema.safeParse(legacy).success).toBe(true);
    const data = buildDashboard(query, today, classifyDashboardRetests(history([legacy])), plan);
    expect(data.summary.cars).toBeNull();
  });
  it("deduplicates overlapping cached dates without collapsing separate tests of one VIN", () => {
    const day = sourceDay(today, [{ vin: "same" }, { vin: "same" }, { vin: "different" }]);
    const classified = classifyDashboardRetests([...history([day]), day]);
    expect(classified.filter((row) => row.date === today)).toHaveLength(1);
    const data = buildDashboard(query, today, classified, plan);
    expect(data.summary.cars).toBe(2);
    expect(data.summary.freeRetests).toBe(1);
  });
  it("rejects partial identity metadata, duplicate record keys and outcome/count mismatches", () => {
    const day = sourceDay(today, [{ vin: "one" }, { vin: "two" }]);
    expect(dashboardDaySchema.safeParse(day).success).toBe(true);
    expect(
      dashboardDaySchema.safeParse({
        ...day,
        testTimes: day.testTimes!.map((test) => ({ ...test, outcome: undefined })),
      }).success,
    ).toBe(false);
    expect(
      dashboardDaySchema.safeParse({
        ...day,
        testTimes: day.testTimes!.map((test) => ({ ...test, recordKey: hash("same") })),
      }).success,
    ).toBe(false);
    expect(
      dashboardDaySchema.safeParse({
        ...day,
        testTimes: day.testTimes!.map((test) => ({ ...test, outcome: "failed" })),
      }).success,
    ).toBe(false);
  });
  it("bases each employee's commission on paid shop cars, even under an employee filter", () => {
    const tests = Array.from({ length: 52 }, (_, index) => ({
      vin: `car-${index}`,
      inspector: index % 2 ? "A" : "B",
    }));
    const days = [
      sourceDay(addDays(today, -1), [{ vin: "car-0" }, { vin: "car-1" }]),
      sourceDay(today, tests),
    ];
    const all = dashboard(days);
    const filtered = dashboard(days, inspectorKey("A"));
    expect(all.summary.cars).toBe(50);
    expect(all.summary.revenueCents).toBe(100000);
    expect(all.summary.commissionCents).toBe(0);
    expect(filtered.summary.cars).toBe(25);
    expect(filtered.summary.commissionCents).toBe(0);
    expect(filtered.summary.freeRetests).toBe(1);
  });
  it("applies the rule per day before summing a range while preserving physical-inspection pace", () => {
    const yesterday = addDays(today, -1);
    const data = buildDashboard(
      { ...query, start: yesterday },
      today,
      classifyDashboardRetests(
        history([
          sourceDay(yesterday, [{ vin: "one" }, { vin: "two" }]),
          sourceDay(today, [{ vin: "one" }, { vin: "three" }, { vin: "four" }]),
        ]),
      ),
      plan,
    );
    expect(data.summary).toMatchObject({ cars: 4, revenueCents: 8000, freeRetests: 1 });
    expect(data.series.slice(-2).map((day) => day.cars)).toEqual([2, 2]);
    expect(data.summary.inspectionCadence.timedTests).toBe(5);
    expect(data.summary.inspectionCadence.includedGaps).toBe(3);
  });
  it("loads lookback for the selected dates and today without exporting a multi-year gap", () => {
    const needed = retestHistoryDates({ ...query, start: "2025-01-15", end: "2025-01-15" }, today);
    expect(needed).toContain("2024-12-16");
    expect(needed).not.toContain("2024-12-10");
    expect(needed).toContain(addDays(today, -30));
    expect(needed).not.toContain("2025-08-01");
    expect(needed.length).toBe(62);
  });
  it("keeps a verified empty date zero even before lookback coverage exists", () => {
    expect(
      buildDashboard(query, today, classifyDashboardRetests([empty(today)]), plan).summary.cars,
    ).toBe(0);
  });
});
