import { describe, expect, it } from "vitest";
import {
  compareTrends,
  employeePerformance,
  previousRange,
  sourceHour,
  testBreakdown,
  trendPeriod,
  type AnalyticsRecord,
} from "../src/modules/station/analytics";
import { commissionCents, periodAmounts } from "../src/modules/payroll/calculations";
import { normalizeLayout, movePanel } from "../src/components/performance-layout";

function record(date = "2026-10-01", patch: Partial<AnalyticsRecord> = {}): AnalyticsRecord {
  return {
    employeeId: "e1",
    state: "CONFIRMED",
    eligible: true,
    source: { businessDate: date, sourceDate: "10/01/2026 09:00 AM", outcome: "Pass" },
    ...patch,
  };
}
const settings = [
  {
    effectiveDate: "2024-01-01",
    sourceTimezoneConfirmed: true,
    hours: Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, open: "08:00", close: "16:00" })),
  },
];
type TrendInput = Parameters<typeof trendPeriod>[0];
function trend(patch: Partial<TrendInput> = {}) {
  return trendPeriod({
    start: "2026-10-01",
    end: "2026-10-01",
    records: [record()],
    coverage: [{ date: "2026-10-01", attested: true }],
    settings,
    closures: [],
    now: new Date("2026-10-10T12:00:00Z"),
    ...patch,
  });
}
describe("Performance outcome and trend evidence", () => {
  it("keeps source outcomes and pending identities distinct without inferring eligibility", () => {
    const rows = [
      record(),
      record(undefined, { eligible: false }),
      record(undefined, { state: "PENDING", source: { ...record().source, outcome: "Abort" } }),
      record(undefined, { source: { ...record().source, outcome: "Fail" } }),
    ];
    expect(testBreakdown(rows)).toEqual([
      { outcome: "Abort", confirmed: 0, pending: 1 },
      { outcome: "Fail", confirmed: 1, pending: 0 },
      { outcome: "Pass", confirmed: 2, pending: 0 },
    ]);
    expect(testBreakdown([])).toEqual([]);
  });
  it.each([
    ["2026-01-01", "2026-01-02", "2025-12-30", "2025-12-31"],
    ["2024-03-01", "2024-03-02", "2024-02-28", "2024-02-29"],
    ["2026-03-08", "2026-03-08", "2026-03-07", "2026-03-07"],
    ["2026-11-01", "2026-11-01", "2026-10-31", "2026-10-31"],
  ])(
    "uses inclusive equal-length calendar periods across %s",
    (start, end, priorStart, priorEnd) => {
      expect(previousRange(start, end)).toEqual({ start: priorStart, end: priorEnd });
    },
  );
  it("withholds an unsupported preceding range", () => {
    expect(previousRange("0000-01-01", "0000-01-01")).toBeNull();
  });
  it("retains unknown days even with a broad owner attestation", () => {
    const result = trend({
      end: "2026-10-02",
      coverage: [
        { date: "2026-10-01", attested: true },
        { date: "2026-10-02", attested: true },
      ],
    });
    expect(result.days[1]).toMatchObject({
      displayedCount: null,
      status: "No report — unknown",
      complete: false,
    });
    expect(result.testsPerHour).toBeNull();
    expect(result.hours[10].displayedCount).toBeNull();
    expect(compareTrends(result, trend()).ready).toBe(false);
  });
  it.each([
    [{ coverage: [] }, "Coverage incomplete"],
    [{ records: [record(undefined, { state: "PENDING" })] }, "Pending identities"],
    [{ settings: [] }, "Hours not configured"],
    [{ settings: [{ ...settings[0], sourceTimezoneConfirmed: false }] }, "Timezone unverified"],
    [{ closures: ["2026-10-01"] }, "Records on closed date"],
  ] satisfies [Partial<TrendInput>, string][])(
    "withholds rates and comparisons for %j",
    (patch, status) => {
      const result = trend(patch);
      expect(result.days[0].status).toBe(status);
      expect(result.testsPerHour).toBeNull();
      expect(compareTrends(trend(), result).ready).toBe(false);
    },
  );
  it("uses Eastern midnight and never treats today's manual report as complete", () => {
    expect(trend({ now: new Date("2026-10-02T03:59:59Z") }).testsPerHour).toBeNull();
    expect(trend({ now: new Date("2026-10-02T04:00:00Z") }).testsPerHour).toBe(1 / 8);
  });
  it("explicit closures do not fabricate test zeros or require an absent report", () => {
    const result = trend({ end: "2026-10-02", closures: ["2026-10-02"] });
    expect(result.days[1]).toMatchObject({
      status: "Closed",
      complete: true,
      displayedCount: null,
      minutes: 0,
    });
    expect(result.testsPerHour).toBe(1 / 8);
    expect(trend({ records: [], closures: ["2026-10-01"] }).testsPerHour).toBeNull();
  });
  it("compares rates per actual open hour rather than treating unequal operating time as productivity", () => {
    const prior = trend({
      settings: [
        { ...settings[0], hours: settings[0].hours.map((h) => ({ ...h, close: "12:00" })) },
      ],
    });
    const result = compareTrends(trend({ records: [record(), record()] }), prior);
    expect(result).toMatchObject({
      ready: true,
      countChange: 1,
      rateChange: 0,
      percentRateChange: 0,
    });
  });
  it.each([
    ["2026-03-08", 1379],
    ["2026-11-01", 1499],
  ])("uses DST elapsed minutes on %s", (date, minutes) => {
    const result = trend({
      start: date,
      end: date,
      now: new Date("2026-12-01T12:00:00Z"),
      records: [record(date)],
      coverage: [{ date, attested: true }],
      settings: [{ ...settings[0], hours: [{ weekday: 7, open: "00:00", close: "23:59" }] }],
    });
    expect(result.minutes).toBe(minutes);
    expect(result.testsPerHour).toBe(60 / minutes);
  });
  it("uses effective schedules and ignores settings that start after the date", () => {
    const result = trend({
      settings: [{ ...settings[0], effectiveDate: "2026-10-02", hours: [] }, ...settings],
    });
    expect(result.minutes).toBe(480);
  });
  it.each([
    ["12:00 AM", 0],
    ["12:59 PM", 12],
    ["11:59 PM", 23],
    ["01:30 AM", 1],
  ])("groups raw local clock %s without inventing an offset", (time, hour) => {
    expect(sourceHour(`11/01/2026 ${time}`)).toBe(hour);
  });
  it("keeps date-only times unallocated and prevents false zero hour buckets", () => {
    const result = trend({
      records: [
        record(),
        record(undefined, { source: { ...record().source, sourceDate: "10/01/2026" } }),
      ],
    });
    expect(result.withoutTime).toEqual({ confirmed: 1, pending: 0 });
    expect(result.hours[0].displayedCount).toBeNull();
    expect(result.hours[9].displayedCount).toBe(1);
    expect(sourceHour("10/01/2026 00:00 AM")).toBeNull();
    expect(trend().hours[0].displayedCount).toBe(0);
  });
});

type EmployeeInput = Parameters<typeof employeePerformance>[0];
type Period = EmployeeInput["pay"]["periods"][number];
const period: Period = {
  employeeId: "e1",
  periodId: "p1",
  start: "2026-10-01",
  end: "2026-10-07",
  status: "Provisional",
  baseCents: 10000,
  grossCents: 10202,
  missing: [],
  snapshot: undefined,
};
const daily = (date: string, count: number, cents: number | null, approved = true) => ({
  employeeId: "e1",
  date,
  count,
  commissionCents: cents,
  approved,
});
function employee(
  patch: Partial<EmployeeInput["pay"]> = {},
  start = "2026-10-01",
  end = "2026-10-07",
) {
  return employeePerformance({
    start,
    end,
    records: [
      record(),
      record(undefined, { employeeId: null }),
      record(undefined, { state: "PENDING", eligible: null }),
      record(undefined, { eligible: null }),
    ],
    pay: {
      employees: [{ id: "e1", user: { name: "Fixture employee" } }],
      daily: [daily("2026-10-01", 11, 101), daily("2026-10-02", 11, 101)],
      periods: [period],
      ...patch,
    },
  })[0];
}
const approved: Period = {
  ...period,
  snapshot: {
    baseCents: 10000,
    commissionCents: 202,
    totalCents: 10202,
    snapshot: {
      period: { startDate: period.start, endDate: period.end },
      input: { emissionsComplete: true },
      daily: [
        { date: "2026-10-01", count: 11, cents: 101 },
        { date: "2026-10-02", count: 11, cents: 101 },
      ],
    },
  },
};
describe("Employee performance pay boundaries", () => {
  it("uses each daily threshold and effective rate; never a weekly threshold or result-based eligibility", () => {
    const r = employee({
      daily: [
        daily("2026-10-01", 11, commissionCents(11, 10, 101, true)),
        daily("2026-10-02", 11, commissionCents(11, 10, 202, true)),
        daily("2026-10-03", 100, commissionCents(100, 10, 202, false)),
      ],
    });
    expect(r.commissionCents).toBe(303);
    expect(r).toMatchObject({ confirmed: 2, pending: 1, eligible: 1, unresolvedEligibility: 1 });
  });
  it("adds fixed compensation only once per fully contained actual period", () => {
    expect(employee()).toMatchObject({
      baseCents: 10000,
      grossCents: 10202,
      status: "Provisional — awaiting payroll approval",
    });
    expect(employee({}, "2026-10-02", "2026-10-05")).toMatchObject({
      baseCents: null,
      grossCents: null,
      partialPeriods: 1,
      status: "Partial period — pay not allocated",
    });
  });
  it("preserves half-up hourly rounding once per actual period", () => {
    const amounts = periodAmounts({ kind: "HOURLY", amountCents: 1001 }, 1, [101]);
    expect(
      employee({
        periods: [{ ...period, baseCents: amounts.baseCents, grossCents: amounts.totalCents }],
      }),
    ).toMatchObject({ baseCents: 17, grossCents: 118 });
  });
  it("does not add contained periods repeatedly across selected days", () => {
    expect(
      employee(
        {
          periods: [period, { ...period, periodId: "p2", start: "2026-10-08", end: "2026-10-14" }],
        },
        "2026-10-01",
        "2026-10-14",
      ),
    ).toMatchObject({ baseCents: 20000, grossCents: 20404, periodCount: 2 });
  });
  it.each([
    { daily: [] },
    { daily: [daily("2026-10-01", 11, 101, false)] },
    { daily: [daily("2026-10-01", 11, null)] },
  ])("missing daily inputs/approval/policy cannot appear as earned commission: %j", (patch) => {
    expect(employee(patch).commissionCents).toBeNull();
  });
  it("withholds incomplete period amounts even when a live base could be calculated", () => {
    expect(
      employee({ periods: [{ ...period, missing: ["Independently approved minutes"] }] }),
    ).toMatchObject({ baseCents: null, grossCents: null, status: "Incomplete inputs" });
    expect(employee({ periods: [] })).toMatchObject({
      baseCents: null,
      grossCents: null,
      status: "No payroll period",
    });
  });
  it("prefers frozen counts, daily commission and full pay over later policy/input changes", () => {
    expect(
      employee({
        daily: [daily("2026-10-01", 100, 90000, false)],
        periods: [
          { ...approved, baseCents: 99999, grossCents: null, missing: ["Live inputs changed"] },
        ],
      }),
    ).toMatchObject({
      approvedCounts: 22,
      commissionCents: 202,
      baseCents: 10000,
      grossCents: 10202,
      status: "Approved payroll snapshots",
      unapprovedDays: 0,
    });
  });
  it("selects only frozen days inside a partial range and never prorates base/gross", () => {
    expect(employee({ daily: [], periods: [approved] }, "2026-10-02", "2026-10-03")).toMatchObject({
      approvedCounts: 11,
      commissionCents: 101,
      baseCents: null,
      grossCents: null,
    });
  });
  it("never includes recorded live days outside the selected inclusive range", () => {
    expect(employee({}, "2026-10-02", "2026-10-03")).toMatchObject({
      approvedCounts: 11,
      commissionCents: 101,
      recordedPayDays: 1,
    });
  });
  it("withholds a total mixing approved and provisional periods", () => {
    expect(
      employee(
        {
          periods: [
            approved,
            { ...period, periodId: "p2", start: "2026-10-08", end: "2026-10-14" },
          ],
        },
        "2026-10-01",
        "2026-10-14",
      ),
    ).toMatchObject({
      baseCents: null,
      grossCents: null,
      status: "Mixed approvals — totals withheld",
    });
  });
  it("does not substitute live policies when frozen daily detail is missing or inconsistent", () => {
    for (const snapshot of [
      {},
      {
        period: { startDate: period.start, endDate: period.end },
        input: { emissionsComplete: true },
        daily: [{ date: "2026-10-01", count: 11, cents: 999 }],
      },
    ])
      expect(
        employee({ periods: [{ ...approved, snapshot: { ...approved.snapshot!, snapshot } }] })
          .commissionCents,
      ).toBeNull();
  });
  it("distinguishes explicit approved noneligibility/zero from absent records", () => {
    expect(employee({ daily: [daily("2026-10-01", 5, 0)] }).commissionCents).toBe(0);
    const snapshot = {
      period: { startDate: period.start, endDate: period.end },
      input: { emissionsComplete: true },
      daily: [],
    };
    expect(
      employee({
        daily: [],
        periods: [
          {
            ...approved,
            snapshot: { baseCents: 10000, commissionCents: 0, totalCents: 10000, snapshot },
          },
        ],
      }),
    ).toMatchObject({ commissionCents: 0, grossCents: 10000 });
  });
});

describe("Performance layout recovery", () => {
  const defaults = [
    { id: "a", span: 6, height: 0 },
    { id: "b", span: 12, height: 420 },
    { id: "new", span: 6, height: 0 },
  ];
  it("recovers malformed or old-version browser storage", () => {
    for (const raw of ["", "bad json", "null", '{"version":2,"panels":[]}'])
      expect(normalizeLayout(raw, defaults)).toEqual(defaults);
  });
  it("drops unknown/duplicate panels, clamps sizes and appends new panels", () => {
    expect(
      normalizeLayout(
        JSON.stringify({
          version: 1,
          panels: [
            { id: "b", span: 99, height: -5 },
            { id: "b", span: 4 },
            { id: "unknown" },
            { id: "a", span: "bad", height: 9000 },
          ],
        }),
        defaults,
      ),
    ).toEqual([
      { id: "b", span: 12, height: 240 },
      { id: "a", span: 6, height: 1000 },
      defaults[2],
    ]);
  });
  it("moves both directions without losing panels and ignores invalid targets", () => {
    expect(movePanel(defaults, "a", "new").map((p) => p.id)).toEqual(["b", "new", "a"]);
    expect(movePanel(defaults, "new", "a").map((p) => p.id)).toEqual(["new", "a", "b"]);
    expect(movePanel(defaults, "bad", "a")).toBe(defaults);
  });
});
