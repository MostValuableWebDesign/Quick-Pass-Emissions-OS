import { describe, expect, it } from "vitest";
import { busyHours } from "../src/modules/station/dashboard-busy-hours";
import { buildDashboard, inspectorKey } from "../src/modules/station/dashboard-calculations";
import type { PayPlan, PortalDay } from "../src/modules/station/dashboard-types";

const date = "2026-01-15";
const query = { start: date, end: date, trendDays: 7 as const };
const plan: PayPlan = {
  revision: 1,
  adjustments: [],
  profiles: ["A", "B"].map((name) => ({
    id: name,
    name,
    inspector: name,
    hourlyCents: 1000,
    mondayCents: null,
    standardMinutes: 480,
    shiftsPerWeek: 7,
    availableWeekdays: [1, 2, 3, 4, 5, 6, 7],
    scheduledWeekdays: [1, 2, 3, 4, 5, 6, 7],
    commissionEligible: true,
    approximate: false,
  })),
};
function snapshot(minutes: (number | null)[], sourceDate = date): PortalDay {
  return {
    date: sourceDate,
    retrievedAt: `${sourceDate}T20:00:00Z`,
    total: minutes.length,
    passed: minutes.length,
    failed: 0,
    aborted: 0,
    other: 0,
    verifiedEmpty: minutes.length === 0,
    retestComplete: true,
    inspectors: minutes.length
      ? [
          {
            inspector: "A",
            total: minutes.length,
            passed: minutes.length,
            failed: 0,
            aborted: 0,
            other: 0,
          },
        ]
      : [],
    testTimes: minutes.map((minute) => ({ inspector: "A", minute })),
  };
}

describe("Performance busy hours", () => {
  it("groups midnight, noon and last-minute clock values without timezone conversion", () => {
    const result = busyHours([date], [snapshot([0, 59, 60, 719, 720, 1439])]);
    expect(result.complete).toBe(true);
    expect(result.observedTests).toBe(6);
    expect(result.hours.filter((hour) => hour.count)).toEqual([
      { hour: 0, count: 2 },
      { hour: 1, count: 1 },
      { hour: 11, count: 1 },
      { hour: 12, count: 1 },
      { hour: 23, count: 1 },
    ]);
    expect(result.peakHours).toEqual([0]);
    expect(result.hours[2].count).toBe(0);
  });
  it("reports tied peaks and scopes timing to the selected inspector", () => {
    const day = snapshot([540, 600]);
    day.total++;
    day.passed++;
    day.inspectors.push({ inspector: "B", total: 1, passed: 1, failed: 0, aborted: 0, other: 0 });
    day.testTimes!.push({ inspector: "B", minute: 540 });
    expect(busyHours([date], [day]).peakHours).toEqual([9]);
    expect(busyHours([date], [day], "A").peakHours).toEqual([9, 10]);
    expect(busyHours([date], [day], "A").observedTests).toBe(2);
    expect(busyHours([date], [day], "absent").hours.every((hour) => hour.count === 0)).toBe(true);
  });
  it("keeps gaps unknown for partial dates and null timestamps while retaining observed buckets", () => {
    const result = busyHours(["2026-01-14", date], [snapshot([540, null])]);
    expect(result).toMatchObject({
      complete: false,
      timedDays: 0,
      expectedDays: 2,
      observedTests: 1,
      untimedTests: 1,
    });
    expect(result.hours[9].count).toBe(1);
    expect(result.hours[10].count).toBeNull();
  });
  it("does not manufacture hourly zeros from count-only caches, missing VIN history or unlinked staff", () => {
    const legacy = snapshot([540]);
    delete legacy.testTimes;
    for (const result of [
      busyHours([date], [legacy]),
      busyHours([date], [{ ...snapshot([540]), retestComplete: false }]),
      busyHours([date], [snapshot([540])], null),
      busyHours([date], []),
    ]) {
      expect(result.complete).toBe(false);
      expect(result.hours.every((hour) => hour.count === null)).toBe(true);
      expect(result.peakCount).toBeNull();
    }
  });
  it("accepts an explicitly empty source day as zero and excludes dates outside the selection", () => {
    const result = busyHours([date], [snapshot([]), snapshot([540], "2026-01-14")]);
    expect(result.complete).toBe(true);
    expect(result.observedTests).toBe(0);
    expect(result.hours.every((hour) => hour.count === 0)).toBe(true);
  });
});

describe("Performance daily commission progress", () => {
  it.each([
    [49, 0],
    [50, 0],
    [51, 100],
    [95, 4500],
  ])("counts %i shop tests as %i cents per eligible worker", (count, cents) => {
    const data = buildDashboard(query, date, [snapshot(Array(count).fill(540))], plan);
    expect(data.commissionProgress).toMatchObject({
      threshold: 50,
      rateCents: 100,
      days: [
        { date, stationCars: count, perEmployeeCents: cents, selectedCommissionCents: cents * 2 },
      ],
    });
    expect(data.commissionProgress.days).toHaveLength(1); // Do not use the 7-day trend as the selection.
  });
  it("resets the threshold daily rather than pooling a date range", () => {
    const data = buildDashboard(
      { ...query, start: "2026-01-14" },
      date,
      [snapshot(Array(51).fill(540), "2026-01-14"), snapshot(Array(51).fill(540))],
      plan,
    );
    expect(data.commissionProgress.days.map((day) => day.perEmployeeCents)).toEqual([100, 100]);
    expect(data.summary.commissionCents).toBe(400);
  });
  it("keeps the shop threshold when filtered and respects off days and ineligible staff", () => {
    const day = snapshot(Array(95).fill(540));
    const filtered = buildDashboard({ ...query, employee: inspectorKey("A") }, date, [day], plan);
    expect(filtered.commissionProgress.days[0]).toMatchObject({
      stationCars: 95,
      perEmployeeCents: 4500,
      selectedCommissionCents: 4500,
    });
    expect(filtered.busyHours.observedTests).toBe(95);
    const disabled = { ...plan, profiles: [{ ...plan.profiles[0], commissionEligible: false }] };
    expect(
      buildDashboard(query, date, [day], disabled).commissionProgress.days[0]
        .selectedCommissionCents,
    ).toBe(0);
    const off = {
      ...plan,
      adjustments: [{ profileId: "A", date, minutes: 0, baseCents: null, grassCut: false }],
    };
    expect(
      buildDashboard({ ...query, employee: inspectorKey("A") }, date, [day], off).commissionProgress
        .days[0].selectedCommissionCents,
    ).toBe(0);
  });
  it("withholds progress when report/VIN coverage is unknown and accepts verified zero", () => {
    for (const days of [[], [{ ...snapshot([540]), retestComplete: false }]]) {
      const data = buildDashboard(query, date, days, plan);
      expect(data.commissionProgress.days[0]).toMatchObject({
        stationCars: null,
        commissionTests: null,
        perEmployeeCents: null,
        selectedCommissionCents: null,
      });
    }
    expect(
      buildDashboard(query, date, [snapshot([])], plan).commissionProgress.days[0],
    ).toMatchObject({ stationCars: 0, commissionTests: 0, perEmployeeCents: 0 });
  });
});
