import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { inspectionCadence, reportMinute } from "../src/modules/station/inspection-cadence";
import { buildDashboard, inspectorKey } from "../src/modules/station/dashboard-calculations";
import { dashboardDaySchema } from "../src/modules/station/dashboard-service";
import type { PortalDay } from "../src/modules/station/dashboard-types";
import { EmployeeTable } from "../src/components/performance-dashboard-employees";

const date = "2026-10-10";
function day(tests: NonNullable<PortalDay["testTimes"]>, businessDate = date): PortalDay {
  const inspectors = [...new Set(tests.map((t) => t.inspector))].map((inspector) => {
    const total = tests.filter((t) => t.inspector === inspector).length;
    return { inspector, total, passed: total, failed: 0, aborted: 0, other: 0 };
  });
  return {
    date: businessDate,
    total: tests.length,
    passed: tests.length,
    failed: 0,
    aborted: 0,
    other: 0,
    retrievedAt: "2026-10-11T01:00:00Z",
    verifiedEmpty: tests.length === 0,
    inspectors,
    testTimes: tests,
  };
}
const fixture = day([
  { inspector: "A", minute: 550 },
  { inspector: "B", minute: 540 },
  { inspector: "A", minute: 540 },
  { inspector: "A", minute: 546 },
  { inspector: "B", minute: 560 },
]);
const query = { start: date, end: date, trendDays: 7 as const };
const plan = { revision: 0, profiles: [], adjustments: [] };

describe("report-based average time per car", () => {
  it("reads noon, midnight and source-local minutes without inventing a time for date-only rows", () => {
    expect(reportMinute("10/10/2026 12:00 AM")).toBe(0);
    expect(reportMinute("10/10/2026 12:00 PM")).toBe(720);
    expect(reportMinute("10/10/2026 01:05 PM")).toBe(785);
    expect(reportMinute("10/10/2026")).toBeNull();
    expect(reportMinute("10/10/2026 13:00 PM")).toBeNull();
  });
  it("divides each testing window by cars, not gaps, without double-counting overlapping employee windows", () => {
    expect(inspectionCadence([fixture], "A")).toEqual({
      averageMinutes: 10 / 3,
      cars: 3,
      coveredDays: 1,
    });
    expect(inspectionCadence([fixture], "B").averageMinutes).toBe(10);
    expect(inspectionCadence([fixture])).toEqual({ averageMinutes: 4, cars: 5, coveredDays: 1 });
  });
  it("never compares tests across business dates", () => {
    const first = day([{ inspector: "A", minute: 1000 }], "2026-10-09");
    const second = day([{ inspector: "A", minute: 540 }]);
    expect(inspectionCadence([first, second])).toEqual({
      averageMinutes: null,
      cars: 0,
      coveredDays: 2,
    });
  });
  it("includes pauses and cars with tied timestamps, but never invents zero-duration or unknown windows", () => {
    const pause = day([
      { inspector: "A", minute: 540 },
      { inspector: "A", minute: 540 },
      { inspector: "A", minute: 660 },
    ]);
    expect(inspectionCadence([pause]).averageMinutes).toBe(40);
    const missing = day([
      { inspector: "A", minute: 540 },
      { inspector: "A", minute: null },
      { inspector: "A", minute: 550 },
    ]);
    expect(inspectionCadence([missing])).toEqual({ averageMinutes: null, cars: 0, coveredDays: 0 });
    expect(inspectionCadence([day([{ inspector: "A", minute: 540 }])]).averageMinutes).toBeNull();
    expect(
      inspectionCadence([
        day([
          { inspector: "A", minute: 540 },
          { inspector: "A", minute: 540 },
        ]),
      ]).averageMinutes,
    ).toBeNull();
  });
  it("preserves legacy count caches and requests timing backfill without treating missing times as zero", () => {
    const legacy = { ...fixture, testTimes: undefined };
    expect(dashboardDaySchema.safeParse(legacy).success).toBe(true);
    const data = buildDashboard(query, date, [legacy], plan);
    expect(data.summary.cars).toBe(5);
    expect(data.summary.inspectionCadence.averageMinutes).toBeNull();
    expect(data.timingMissingDates).toEqual([date]);
    expect(buildDashboard(query, date, [fixture], plan).timingMissingDates).toEqual([]);
  });
  it("requires timing rows to match the verified inspector counts", () => {
    expect(dashboardDaySchema.safeParse(fixture).success).toBe(true);
    expect(
      dashboardDaySchema.safeParse({ ...fixture, testTimes: fixture.testTimes!.slice(1) }).success,
    ).toBe(false);
    expect(
      dashboardDaySchema.safeParse({
        ...fixture,
        testTimes: fixture.testTimes!.map((t) => ({ ...t, inspector: "wrong" })),
      }).success,
    ).toBe(false);
    expect(dashboardDaySchema.safeParse(day([{ inspector: "A", minute: 1440 }])).success).toBe(
      false,
    );
  });
  it("uses only selected dates and honors employee filters in the headline", () => {
    const unrelated = day(
      [
        { inspector: "A", minute: 100 },
        { inspector: "A", minute: 200 },
      ],
      "2026-10-09",
    );
    const data = buildDashboard(query, date, [fixture, unrelated], plan);
    expect(data.summary.inspectionCadence.averageMinutes).toBe(4);
    const filtered = buildDashboard(
      { ...query, employee: inspectorKey("A") },
      date,
      [fixture, unrelated],
      plan,
    );
    expect(filtered.summary.inspectionCadence.averageMinutes).toBe(10 / 3);
    expect(filtered.employees).toHaveLength(1);
    const html = renderToStaticMarkup(
      createElement(EmployeeTable, {
        employees: data.employees,
        overallCadence: data.summary.inspectionCadence,
      }),
    );
    expect(html).toContain("Avg. time/car (est.)");
    expect(html).toContain("3.3 min/car");
    expect(html).toContain("10.0 min/car");
    expect(html).toContain("4.0 min/car");
    expect(html).toContain("button-sort-inspectionCadence");
  });
  it("sums daily windows and divides by total timed cars for ranges, exposing partial coverage", () => {
    const second = day(
      [
        { inspector: "A", minute: 500 },
        { inspector: "A", minute: 520 },
      ],
      "2026-10-11",
    );
    const data = buildDashboard(
      { ...query, end: second.date },
      second.date,
      [fixture, second],
      plan,
    );
    expect(data.summary.inspectionCadence).toEqual({
      averageMinutes: 40 / 7,
      cars: 7,
      coveredDays: 2,
    });
    expect(data.employees.find((e) => e.inspector === "A")?.inspectionCadence.averageMinutes).toBe(
      6,
    );
    const partial = buildDashboard({ ...query, end: second.date }, second.date, [fixture], plan);
    expect(partial.summary.inspectionCadence).toEqual({
      averageMinutes: 4,
      cars: 5,
      coveredDays: 1,
    });
    expect(partial.summary.expectedDays).toBe(2);
  });
});
