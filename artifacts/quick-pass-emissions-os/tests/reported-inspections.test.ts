import { describe, expect, it } from "vitest";
import { parsePerformanceReport, parseReport, digest } from "../src/modules/station/report";
import { reportedVin } from "../src/modules/station/reported-vin";
import { includeReportedInspections } from "../src/modules/station/report-counts";
import { classifyDashboardRetests } from "../src/modules/station/dashboard-retests";
import { buildDashboard, calendarDays } from "../src/modules/station/dashboard-calculations";
import type { PayPlan, PortalDay } from "../src/modules/station/dashboard-types";
import { createRetentionModel } from "../src/modules/station/vehicle-retention";
import { fixtureStation, reportFixture } from "./station-fixtures";

const date = "2026-10-19";
const blank = (date: string): PortalDay => ({
  date,
  total: 0,
  passed: 0,
  failed: 0,
  aborted: 0,
  other: 0,
  inspectors: [],
  testTimes: [],
  verifiedEmpty: true,
  retrievedAt: "2026-10-20T12:00:00Z",
});
const reported = {
  id: "report",
  key: digest("provider-report"),
  date,
  minute: 600,
  inspector: "A",
  outcome: "Pass",
  vinHash: digest("SOURCE-VIN-WITH-BAD-FORMAT"),
  invalidVin: true,
  plateHash: null,
  identityStatus: "REPORTED_VIN",
  source: "GA_DASHBOARD",
  sourceId: "provider-report",
  suffix: "RMAT",
  payment: "UNKNOWN",
  retest: "UNKNOWN",
  completion: "COMPLETED",
  sourceKind: "VIR",
  sourceUrl: null,
};
const plan: PayPlan = {
  revision: 0,
  adjustments: [],
  profiles: [
    {
      id: "A",
      name: "A",
      inspector: "A",
      hourlyCents: 2300,
      mondayCents: null,
      standardMinutes: 600,
      shiftsPerWeek: 5,
      availableWeekdays: [1, 2, 3, 4, 5, 6],
      scheduledWeekdays: [],
      commissionEligible: true,
      approximate: false,
    },
  ],
};
describe("provider inspections are not disqualified by VIN validation", () => {
  it.each(["1HGCM82633A004353", "TOO-SHORT", "1HGCM82633AOO4352", "00000000000000000"])(
    "accepts a provider report whose VIN is %s",
    (vin) => {
      const body = reportFixture(date).replace("1SYNTHETIC0000001", vin);
      expect(parsePerformanceReport(body, fixtureStation).rows).toHaveLength(1);
      expect(parsePerformanceReport(body, fixtureStation).incompleteRows).toEqual([]);
      expect(parseReport(body, fixtureStation).rows).toHaveLength(1);
    },
  );
  it("uses exact reported values without merging blank or placeholder identities", () => {
    expect(reportedVin("  bad-format-vin ")).toBe("BAD-FORMAT-VIN");
    for (const value of ["", "UNKNOWN", "N/A", "00000000000000000", "INVALID"])
      expect(reportedVin(value)).toBeNull();
  });
  it("restores cached VIN-only exclusions once and includes them in cars, revenue, pay and trend", () => {
    const validRows = Array.from({ length: 50 }, (_, i) => ({
      ...reported,
      key: digest(`report-${i}`),
      vinHash: digest(`vin-${i}`),
      minute: 500 + i,
      invalidVin: false,
    }));
    const original: PortalDay = {
      ...blank(date),
      verifiedEmpty: false,
      total: 50,
      passed: 50,
      inspectors: [{ inspector: "A", total: 50, passed: 50, failed: 0, aborted: 0, other: 0 }],
      testTimes: validRows.map((row) => ({
        inspector: row.inspector,
        minute: row.minute,
        vinHash: row.vinHash,
        recordKey: row.key,
        outcome: "passed",
      })),
      incompleteRows: { total: 1, vehicle: 1, inspector: 0, outcome: 0 },
    };
    const restored = includeReportedInspections([original], [reported]);
    expect(restored[0].total).toBe(51);
    expect(restored[0].incompleteRows).toBeUndefined();
    expect(original.total).toBe(50);
    expect(includeReportedInspections(restored, [reported])[0].total).toBe(51);
    const history = calendarDays("2026-09-19", date).map((d) =>
      d === date ? restored[0] : blank(d),
    );
    const data = buildDashboard(
      { start: date, end: date, trendDays: 7 },
      date,
      classifyDashboardRetests(history),
      plan,
    );
    expect(data.summary).toMatchObject({
      cars: 51,
      revenueCents: 102000,
      baseCents: 23000,
      commissionCents: 100,
      payCents: 23100,
    });
    expect(data.employees[0]).toMatchObject({ cars: 51, revenueCents: 102000 });
    expect(data.series.find((day) => day.date === date)).toMatchObject({
      cars: 51,
      revenueCents: 102000,
    });
  });
  it("counts source reports with blank VINs without claiming an identifier", () => {
    const body = reportFixture(date).replace("1SYNTHETIC0000001", "");
    const parsed = parsePerformanceReport(body, fixtureStation);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].unidentifiedVehicle).toBe(true);
    expect(parsed.incompleteRows).toEqual([]);
  });
  it("does not classify shared placeholder VINs as the same vehicle or as free retests", () => {
    const day: PortalDay = {
      ...blank(date),
      verifiedEmpty: false,
      total: 2,
      passed: 2,
      inspectors: [{ inspector: "A", total: 2, passed: 2, failed: 0, aborted: 0, other: 0 }],
      testTimes: [1, 2].map((i) => ({
        inspector: "A",
        minute: 500 + i * 10,
        recordKey: digest(`placeholder-${i}`),
        vinHash: digest("00000000000000000"),
        outcome: "passed",
      })),
    };
    const source = day.testTimes!.map((row) => ({
      ...reported,
      key: row.recordKey!,
      vinHash: null,
    }));
    const restored = includeReportedInspections([day], source)[0];
    const history = calendarDays("2026-09-19", date).map((d) => (d === date ? restored : blank(d)));
    const current = classifyDashboardRetests(history).find((d) => d.date === date)!;
    expect(current.total).toBe(2);
    expect(current.freeRetests).toBe(0);
    expect(current.retestComplete).toBe(true);
    expect(current.testTimes?.every((row) => !row.vinHash)).toBe(true);
  });
  it("still applies the 30-day rule to the exact reported VIN and accepts later returns", () => {
    const visits = [
      { ...reported, id: "prior", key: "prior", sourceId: "prior", date: "2025-01-01" },
      { ...reported, id: "free", key: "free", sourceId: "free", date: "2025-01-31" },
      { ...reported, id: "paid", key: "paid", sourceId: "paid", date: "2025-03-03" },
      { ...reported, id: "missing", key: "missing", sourceId: "missing", vinHash: null },
    ];
    const model = createRetentionModel(
      visits,
      {
        start: "2025-01-01",
        end: date,
        totalDates: 657,
        loadedDates: 657,
        missingPeriods: [],
        incompletePeriods: [],
        unprocessedPeriods: [],
        recordsNeedingReview: 0,
        unrepresentedRecords: 0,
      },
      { label: "All", inspector: null },
      { start: "2025-01-01", end: date },
    );
    expect(model.report).toMatchObject({
      qualifyingInspections: 3,
      identifiableVehicles: 1,
      repeatVehicles: 1,
      classifications: { inferredFreeRetestsExcluded: 1 },
    });
  });
});
