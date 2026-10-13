import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { inspectionCadence, reportMinute } from "../src/modules/station/inspection-cadence";
import { buildDashboard, inspectorKey } from "../src/modules/station/dashboard-calculations";
import { dashboardDaySchema } from "../src/modules/station/dashboard-service";
import type { PortalDay } from "../src/modules/station/dashboard-types";
import { EmployeeTable } from "../src/components/performance-dashboard-employees";
import { inspectionTime, usd } from "../src/components/performance-dashboard-format";

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

describe("report-based typical time between tests", () => {
  it("reads source-local clock times without inventing date-only timestamps", () => {
    expect(reportMinute("10/10/2026 12:00 AM")).toBe(0);
    expect(reportMinute("10/10/2026 12:00 PM")).toBe(720);
    expect(reportMinute("10/10/2026 01:05 PM")).toBe(785);
    expect(reportMinute("10/10/2026")).toBeNull();
    expect(reportMinute("10/10/2026 13:00 PM")).toBeNull();
  });
  it("sorts within each employee/day and never pairs different employees", () => {
    expect(inspectionCadence([fixture], "A")).toMatchObject({
      medianMinutes: 5,
      includedGaps: 2,
      coveredDays: 1,
      timedTests: 3,
    });
    expect(inspectionCadence([fixture], "B").medianMinutes).toBe(20);
    expect(inspectionCadence([fixture])).toMatchObject({ medianMinutes: 6, includedGaps: 3 });
  });
  it("excludes the configured long gap and reports its count without assigning a cause", () => {
    const source = day([540, 550, 562, 622, 633].map((minute) => ({ inspector: "A", minute })));
    expect(inspectionCadence([source], "A", 30)).toMatchObject({
      medianMinutes: 11,
      includedGaps: 3,
      excludedLongGaps: 1,
      excludedOvernightGaps: 0,
    });
    expect(inspectionCadence([source], "A")).toMatchObject({
      medianMinutes: 11.5,
      includedGaps: 4,
      excludedLongGaps: 0,
    });
  });
  it("includes the exact limit, excludes only larger gaps, and returns no value when all gaps are excluded", () => {
    const source = day([540, 570, 601].map((minute) => ({ inspector: "A", minute })));
    expect(inspectionCadence([source], "A", 30)).toMatchObject({
      medianMinutes: 30,
      includedGaps: 1,
      excludedLongGaps: 1,
    });
    expect(inspectionCadence([source], "A", 1)).toMatchObject({
      medianMinutes: null,
      includedGaps: 0,
      excludedLongGaps: 2,
    });
  });
  it("counts excluded overnight boundaries separately and sorts dates without forming cross-date gaps", () => {
    const first = day([{ inspector: "A", minute: 1430 }], "2026-10-09");
    const second = day([
      { inspector: "A", minute: 5 },
      { inspector: "B", minute: 6 },
    ]);
    expect(inspectionCadence([second, first])).toMatchObject({
      medianMinutes: null,
      includedGaps: 0,
      excludedOvernightGaps: 1,
      coveredDays: 2,
      timedTests: 3,
    });
  });
  it("retains zero-minute gaps at source precision but does not bridge missing timestamps", () => {
    const tied = day([
      { inspector: "A", minute: 540 },
      { inspector: "A", minute: 540 },
    ]);
    expect(inspectionCadence([tied]).medianMinutes).toBe(0);
    const missing = day([
      { inspector: "A", minute: 540 },
      { inspector: "A", minute: null },
      { inspector: "A", minute: 550 },
    ]);
    expect(inspectionCadence([missing])).toMatchObject({
      medianMinutes: null,
      includedGaps: 0,
      coveredDays: 0,
    });
    expect(inspectionCadence([day([{ inspector: "A", minute: 540 }])]).medianMinutes).toBeNull();
  });
  it("does not omit another employee's valid day when one employee has missing timing", () => {
    const missing = day([
      { inspector: "A", minute: null },
      { inspector: "B", minute: 540 },
      { inspector: "B", minute: 550 },
    ]);
    expect(inspectionCadence([missing])).toMatchObject({
      medianMinutes: 10,
      includedGaps: 1,
      coveredDays: 0,
    });
    expect(inspectionCadence([missing], "B").coveredDays).toBe(1);
    expect(inspectionCadence([missing], null).medianMinutes).toBeNull();
  });
  it("preserves legacy caches, detects missing timing and never invents gaps on empty dates", () => {
    const legacy = { ...fixture, testTimes: undefined };
    expect(dashboardDaySchema.safeParse(legacy).success).toBe(true);
    const data = buildDashboard(query, date, [legacy], plan);
    expect(data.summary.cars).toBe(5);
    expect(data.summary.inspectionCadence.medianMinutes).toBeNull();
    expect(data.timingMissingDates).toEqual([date]);
    expect(inspectionCadence([day([])])).toMatchObject({ medianMinutes: null, coveredDays: 1 });
  });
  it("requires timing rows to match inspector counts and rejects out-of-range timestamps", () => {
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
    expect(
      inspectionCadence([
        day([
          { inspector: "A", minute: 1440 },
          { inspector: "A", minute: 540 },
        ]),
      ]).medianMinutes,
    ).toBeNull();
  });
  it("uses only selected dates and filters, without gap-count details", () => {
    const unrelated = day(
      [
        { inspector: "A", minute: 100 },
        { inspector: "A", minute: 200 },
      ],
      "2026-10-09",
    );
    const settings = { revision: 1, longGapMinutes: 10 };
    const data = buildDashboard(query, date, [fixture, unrelated], plan, settings);
    expect(data.summary.inspectionCadence.medianMinutes).toBe(5);
    const filtered = buildDashboard(
      { ...query, employee: inspectorKey("A") },
      date,
      [fixture, unrelated],
      plan,
      settings,
    );
    expect(filtered.summary.inspectionCadence.medianMinutes).toBe(5);
    expect(filtered.employees).toHaveLength(1);
    const html = renderToStaticMarkup(
      createElement(EmployeeTable, {
        employees: data.employees,
        overallCadence: data.summary.inspectionCadence,
      }),
    );
    expect(html).toContain('class="pd-table pd-num pd-employee-table"');
    expect(html).not.toContain("<colgroup>");
    expect(html).toContain("Avg Test Time");
    expect(html).toContain("5 min");
    expect(html).not.toMatch(/gaps used|excluded long gaps|overnight excluded/i);
    expect(html).not.toContain("min/car");
    expect(html).not.toContain(".00");
    expect(html).toContain("button-sort-inspectionCadence");
    expect(inspectionTime(5.5)).toBe("6 min");
    expect(usd(23000)).toBe("$230");

    const employee = data.employees.find((person) => person.inspector === "A")!;
    const profile = {
      id: "profile-A",
      name: "Inspector A",
      inspector: "A",
      hourlyCents: 2300,
      mondayCents: null,
      standardMinutes: 600,
      shiftsPerWeek: 5,
      availableWeekdays: [1, 2, 3, 4, 5, 6],
      scheduledWeekdays: [6],
      commissionEligible: true,
      approximate: true,
    };
    const payHtml = renderToStaticMarkup(
      createElement(EmployeeTable, {
        employees: [{ ...employee, workingDays: 1, baseCents: 23000, payCents: 23000 }],
        profiles: [profile],
      }),
    );
    expect(payHtml).toContain("$230");
    expect(payHtml).toContain("$1,150 / week");
    expect(payHtml).not.toContain("$230 / day");
    expect(payHtml).not.toContain("approx.");
  });
  it("pools retained daily employee gaps for ranges, rather than averaging medians or bridging days", () => {
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
    expect(data.summary.inspectionCadence).toMatchObject({
      medianMinutes: 13,
      includedGaps: 4,
      timedTests: 7,
      coveredDays: 2,
      excludedOvernightGaps: 1,
    });
    expect(data.employees.find((e) => e.inspector === "A")?.inspectionCadence.medianMinutes).toBe(
      6,
    );
    const partial = buildDashboard({ ...query, end: second.date }, second.date, [fixture], plan);
    expect(partial.summary.inspectionCadence).toMatchObject({ medianMinutes: 6, coveredDays: 1 });
    expect(partial.summary.expectedDays).toBe(2);
  });
});
