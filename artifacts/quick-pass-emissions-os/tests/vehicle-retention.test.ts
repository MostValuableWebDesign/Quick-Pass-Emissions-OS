import { describe, expect, it } from "vitest";
import {
  createRetentionModel,
  datePeriods,
  prepareRetentionVisits,
  retentionDetails,
  type RetentionVisit,
  type RetentionCoverage,
  type RetentionScope,
} from "../src/modules/station/vehicle-retention";

const coverage = (overrides: Partial<RetentionCoverage> = {}): RetentionCoverage => ({
  start: "2019-01-01",
  end: "2026-10-19",
  totalDates: 2849,
  loadedDates: 2849,
  missingPeriods: [],
  incompletePeriods: [],
  unprocessedPeriods: [],
  recordsNeedingReview: 0,
  unrepresentedRecords: 0,
  ...overrides,
});
const all: RetentionScope = { label: "All inspectors", inspector: null };
function visit(
  id: string,
  date: string,
  vin: string | null,
  extra: Partial<RetentionVisit> = {},
): RetentionVisit {
  return {
    id,
    key: id,
    source: "GA_DASHBOARD",
    sourceId: id,
    date,
    minute: 600,
    inspector: "Inspector A",
    outcome: "PASS",
    vinHash: vin,
    plateHash: null,
    invalidVin: false,
    identityStatus: vin ? "VALID_VIN" : "UNREVIEWED",
    suffix: "1234",
    payment: "UNKNOWN",
    retest: "INITIAL",
    completion: "COMPLETED",
    sourceKind: "VIR",
    sourceUrl: "/api/inspection-history/source?jobId=job&windowId=window",
    ...extra,
  };
}
function model(
  rows: RetentionVisit[],
  c = coverage(),
  scope = all,
  selected = { start: "2026-10-01", end: "2026-10-19" },
) {
  return createRetentionModel(rows, c, scope, selected);
}

describe("vehicle retention definitions and reconciliation", () => {
  it("scopes repeat totals and timing to the trend window while using prior visits for returning status", () => {
    const m = model(
      [
        visit("prior", "2025-10-01", "A", { inspector: "Inspector B" }),
        visit("current", "2026-10-18", "A"),
        visit("new", "2026-10-19", "B"),
        visit("outside", "2026-10-01", "C"),
      ],
      coverage({ start: "2026-10-13", totalDates: 7, loadedDates: 7 }),
      all,
      { start: "2026-10-13", end: "2026-10-19" },
    );
    expect(m.report).toMatchObject({
      repeatVehicles: 0,
      identifiableVehicles: 2,
      qualifyingInspections: 2,
      repeatInspections: 0,
      medianIntervalDays: null,
      selectedPeriod: { returning: 1, firstObserved: 1, vehicles: 2, rate: 0.5 },
      returningMonth: { start: "2026-10-13", returning: 1, vehicles: 2 },
      returningYear: { start: "2026-10-13", returning: 1, vehicles: 2 },
      coverage: { sourceRecords: 2, vinMatchedRecords: 2, reviewableVisits: 2 },
    });
    expect(retentionDetails(m, { metric: "selected" }).total).toBe(1);
    expect(
      retentionDetails(m, { metric: "selected", vehicleId: "current" }).visits.map((v) => v.date),
    ).toEqual(["2025-10-01", "2026-10-18"]);
    expect(retentionDetails(m, { metric: "review" }).total).toBe(2);
  });
  it("does not call an earlier known retest a first-observed vehicle in a later period", () => {
    const m = model([
      visit("prior", "2025-01-01", "A", { retest: "FREE_RETEST" }),
      visit("current", "2026-10-01", "A"),
    ]);
    expect(m.report.returningMonth).toMatchObject({
      vehicles: 1,
      returning: 0,
      firstObserved: 0,
      priorNonqualifying: 1,
    });
  });
  it("separates distinct repeat vehicles, repeat visits and the identifiable denominator", () => {
    const m = model([
      visit("a1", "2024-01-01", "A"),
      visit("a2", "2025-01-01", "A"),
      visit("a3", "2026-01-01", "A"),
      visit("b1", "2026-02-01", "B"),
    ]);
    expect(m.report).toMatchObject({
      repeatVehicles: 1,
      identifiableVehicles: 2,
      repeatPercentage: 0.5,
      qualifyingInspections: 4,
      repeatInspections: 2,
      intervalCount: 2,
    });
    expect(retentionDetails(m, { metric: "repeat" }).total).toBe(m.report.repeatVehicles);
  });
  it("excludes explicitly known free AND paid retests, not short intervals", () => {
    const m = model([
      visit("1", "2025-01-01", "A"),
      visit("2", "2025-01-02", "A", { retest: "UNKNOWN" }),
      visit("3", "2025-01-03", "A", { retest: "FREE_RETEST" }),
      visit("4", "2026-01-03", "A", { retest: "PAID_RETEST" }),
    ]);
    expect(m.report).toMatchObject({
      qualifyingInspections: 2,
      repeatInspections: 1,
      medianIntervalDays: 1,
      classifications: { unknownRetestIncluded: 1, knownRetestsExcluded: 2 },
    });
  });
  it("does not require or invent payment evidence", () => {
    const m = model([
      visit("1", "2025-01-01", "A", { payment: "UNKNOWN" }),
      visit("2", "2026-01-01", "A", { payment: "UNPAID" }),
    ]);
    expect(m.report.repeatVehicles).toBe(1);
    expect(m.report.classifications.unknownPayment).toBe(1);
    expect(
      retentionDetails(m, { metric: "repeat", vehicleId: "1" }).visits.map((v) => v.payment),
    ).toEqual(["UNKNOWN", "UNPAID"]);
  });
  it("deduplicates canonical keys and stable source IDs on repeated retrieval", () => {
    const first = visit("1", "2025-01-01", "A");
    const prepared = prepareRetentionVisits([
      first,
      { ...first },
      visit("duplicate", "2025-01-01", "A", { sourceId: "1" }),
    ]);
    expect(prepared.duplicates).toBe(2);
    expect(model([first, { ...first }]).report).toMatchObject({
      identifiableVehicles: 1,
      repeatVehicles: 0,
      repeatInspections: 0,
    });
  });
  it("uses pre-period station history across inspector changes with inclusive period boundaries", () => {
    const m = model(
      [
        visit("a0", "2025-12-31", "A"),
        visit("a1", "2026-01-01", "A", { inspector: "Inspector B" }),
        visit("a2", "2026-01-31", "A", { inspector: "Inspector B" }),
        visit("b1", "2026-01-01", "B", { inspector: "Inspector B" }),
      ],
      coverage({ end: "2026-01-31" }),
      { id: "b", label: "B", inspector: "Inspector B" },
      { start: "2026-01-01", end: "2026-01-31" },
    );
    expect(m.report.returningMonth).toMatchObject({
      returning: 1,
      firstObserved: 1,
      vehicles: 2,
      rate: 0.5,
    });
    expect(m.report.selectedPeriod.returning).toBe(1);
    expect(m.report.repeatPercentage).toBe(0.5);
    expect(retentionDetails(m, { metric: "month" }).vehicles).toHaveLength(1);
    expect(
      retentionDetails(m, { metric: "month", vehicleId: "a1" }).visits.map((v) => v.inspector),
    ).toEqual(["Inspector A", "Inspector B", "Inspector B"]);
  });
  it("counts annual cohort members once and labels incomplete following years Year to date", () => {
    const m = model([
      visit("a1", "2025-01-01", "A"),
      visit("a2", "2025-12-31", "A"),
      visit("a3", "2026-01-01", "A", { inspector: "Inspector B" }),
      visit("b1", "2025-05-01", "B"),
      visit("b2", "2026-02-01", "B", { retest: "FREE_RETEST" }),
    ]);
    expect(m.report.annualCohorts.find((c) => c.year === 2025)).toMatchObject({
      cohort: 2,
      returned: 1,
      rate: 0.5,
      label: "Year to date",
      followEnd: "2026-10-19",
    });
    const detail = retentionDetails(m, { metric: "cohort", year: 2025 });
    expect(detail.total).toBe(2);
    expect(detail.vehicles.filter((v) => v.returned)).toHaveLength(1);
    expect(m.report.annualCohorts.find((c) => c.year === 2026)).toMatchObject({
      rate: null,
      label: "Following year not started",
    });
  });
  it("localizes annual partial coverage to the cohort and following year", () => {
    const m = model([], coverage({ missingPeriods: [{ start: "2026-10-18", end: "2026-10-19" }] }));
    expect(m.report.annualCohorts.find((c) => c.year === 2020)?.partialCoverage).toBe(false);
    expect(m.report.annualCohorts.find((c) => c.year === 2025)?.partialCoverage).toBe(true);
  });
  it("uses calendar days through leap years and DST, not elapsed 24-hour blocks", () => {
    const m = model([
      visit("1", "2024-02-28", "A"),
      visit("2", "2024-03-01", "A"),
      visit("3", "2024-03-11", "A"),
    ]);
    expect(m.report.medianIntervalDays).toBe(6);
    expect(m.report.intervals.find((b) => b.id === "1-30")?.count).toBe(2);
  });
  it("reconciles interval bands with qualifying repeated visits and interval drilldowns", () => {
    const m = model([
      visit("1", "2024-01-01", "A"),
      visit("2", "2024-01-01", "A", { minute: 700 }),
      visit("3", "2025-01-01", "A"),
      visit("4", "2026-01-01", "A"),
    ]);
    expect(m.report.intervals.reduce((n, b) => n + b.count, 0)).toBe(m.report.repeatInspections);
    expect(retentionDetails(m, { metric: "intervals" }).total).toBe(m.report.intervalCount);
    for (const band of m.report.intervals)
      expect(retentionDetails(m, { metric: "intervals", band: band.id }).total).toBe(band.count);
  });
  it("keeps plate/state fallback separate and excludes ambiguous plate bindings", () => {
    const m = model([
      visit("v1", "2024-01-01", "A", { plateHash: "P" }),
      visit("p1", "2025-01-01", null, { plateHash: "P", identityStatus: "PLATE_STATE" }),
      visit("p2", "2026-01-01", null, { plateHash: "P", identityStatus: "PLATE_STATE" }),
      visit("v2", "2024-01-01", "B", { plateHash: "AMBIG" }),
      visit("v3", "2024-01-01", "C", { plateHash: "AMBIG" }),
      visit("p3", "2026-01-01", null, { plateHash: "AMBIG", identityStatus: "PLATE_STATE" }),
    ]);
    expect(m.report).toMatchObject({
      identifiableVehicles: 3,
      repeatVehicles: 0,
      coverage: { plateFallbackRecords: 2, plateFallbackVehicles: 1, ambiguousRecords: 1 },
    });
    expect(retentionDetails(m, { metric: "plate" }).total).toBe(1);
  });
  it("does not promote invalid or unreviewed hashes into valid VIN matches", () => {
    const m = model([
      visit("invalid", "2025-01-01", "A", { invalidVin: true, plateHash: "P" }),
      visit("unreviewed", "2026-01-01", "A", { identityStatus: "UNREVIEWED" }),
    ]);
    expect(m.report.identifiableVehicles).toBe(0);
    expect(m.report.repeatPercentage).toBeNull();
    expect(m.report.coverage.plateFallbackRecords).toBe(0);
  });
  it("shows partial coverage and includes unrepresented report rows in matching coverage", () => {
    const m = model(
      [visit("1", "2025-01-01", "A")],
      coverage({
        missingPeriods: [{ start: "2025-01-02", end: "2025-01-03" }],
        unrepresentedRecords: 1,
        unprocessedPeriods: [
          { start: "2025-01-04", end: "2025-01-05", status: "PENDING", review: 0 },
        ],
      }),
    );
    expect(m.report.coverage).toMatchObject({
      label: "Partial coverage",
      sourceRecords: 2,
      vinMatchedRecords: 1,
      identifierCoverage: 0.5,
      unmatchedRecords: 1,
    });
  });
  it("has insufficient data rather than zero rates for empty denominators", () => {
    const r = model([]).report;
    expect(r.repeatPercentage).toBeNull();
    expect(r.returningMonth.rate).toBeNull();
    expect(r.medianIntervalDays).toBeNull();
    expect(r.coverage.identifierCoverage).toBeNull();
    expect(r.annualCohorts.every((c) => c.rate === null)).toBe(true);
  });
  it("paginates distinct vehicles and sends only masked visit/vehicle views", () => {
    const rows = Array.from({ length: 17 }, (_, i) => [
      visit(`a${i}`, "2025-01-01", `private-hash-${i}`),
      visit(`b${i}`, "2026-01-01", `private-hash-${i}`),
    ]).flat();
    const m = model(rows),
      first = retentionDetails(m, { metric: "repeat" }),
      second = retentionDetails(m, { metric: "repeat", page: 2 });
    expect(first).toMatchObject({ total: 17, pages: 2, page: 1 });
    expect(first.vehicles).toHaveLength(15);
    expect(second.vehicles).toHaveLength(2);
    expect(JSON.stringify(first)).not.toContain("private-hash");
    expect(first.vehicles[0].label).toBe("Vehicle ••••1234");
    const visits = retentionDetails(m, { metric: "repeat", vehicleId: first.vehicles[0].id });
    expect(visits.visits).toHaveLength(2);
    expect(visits.visits[0].sourceUrl).toContain("/api/inspection-history/source?");
    expect(JSON.stringify(visits)).not.toContain("private-hash");
  });
  it("reconciles loaded visits needing review with their drilldown, separately from source flags", () => {
    const m = model([
      visit("unknown", "2025-01-01", "A", { retest: "UNKNOWN" }),
      visit("known", "2026-01-01", "B", { payment: "PAID" }),
      visit("retest", "2026-01-02", "A", { retest: "FREE_RETEST", payment: "PAID" }),
    ]);
    expect(retentionDetails(m, { metric: "review" }).total).toBe(
      m.report.coverage.reviewableVisits,
    );
    expect(m.report.coverage.reviewableVisits).toBe(2);
  });
  it("compresses actual missing dates without treating endpoints as complete history", () => {
    expect(datePeriods(["2025-01-03", "2025-01-01", "2025-01-02", "2025-02-01"])).toEqual([
      { start: "2025-01-01", end: "2025-01-03" },
      { start: "2025-02-01", end: "2025-02-01" },
    ]);
  });
});
