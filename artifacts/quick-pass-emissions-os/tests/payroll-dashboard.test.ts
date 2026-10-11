import { describe, it, expect } from "vitest";
import {
  commissionCents,
  periodAmounts,
  baseRateSummary,
  adjustedCents,
} from "../src/modules/payroll/calculations";
import { commissionSummary, pageInfo } from "../src/modules/payroll/dashboard";
describe("Employee pay and volume commission", () => {
  it("uses progressive volume tiers without repricing earlier tests", () => {
    const tier = { volumeThreshold: 60, volumeIncreaseCents: 50 };
    expect([0, 50, 51, 60, 61, 65].map((n) => commissionCents(n, 50, 100, true, tier))).toEqual([
      0, 0, 100, 1000, 1150, 1750,
    ]);
    expect(commissionCents(65, 50, 100, false, tier)).toBe(0);
    expect(() => commissionCents(65, 50, 100, true, { ...tier, volumeThreshold: 49 })).toThrow();
    expect(() => commissionCents(100000, 0, 100000, true, tier)).toThrow();
  });
  it("computes daily and full weekly pay without inferring worked days", () => {
    expect(
      periodAmounts({ kind: "DAILY", amountCents: 15000 }, 0, [1750], { paidDays: 5 }),
    ).toEqual({ baseCents: 75000, commissionCents: 1750, totalCents: 76750 });
    expect(periodAmounts({ kind: "DAILY", amountCents: 15000 }, 0, [], {}).baseCents).toBeNull();
    expect(
      periodAmounts({ kind: "DAILY", amountCents: 15000 }, 0, [], { paidDays: 0 }).baseCents,
    ).toBe(0);
    expect(
      periodAmounts({ kind: "WEEKLY", amountCents: 80000 }, 0, [], { periodDays: 14 }).baseCents,
    ).toBe(160000);
    expect(
      periodAmounts({ kind: "WEEKLY", amountCents: 80000 }, 0, [], { periodDays: 5 }).baseCents,
    ).toBeNull();
    expect(
      periodAmounts({ kind: "DAILY", amountCents: 15000 }, 60, [], { paidDays: 5 }).baseCents,
    ).toBeNull();
  });
  it("displays equivalents only from an explicit schedule, with exact rounding", () => {
    expect(baseRateSummary({ kind: "DAILY", amountCents: 15000, scheduledDaysPerWeek: 5 })).toEqual(
      { daily: 15000, weekly: 75000 },
    );
    expect(
      baseRateSummary({ kind: "WEEKLY", amountCents: 80001, scheduledDaysPerWeek: 5 }),
    ).toEqual({ daily: 16000, weekly: 80001 });
    expect(
      baseRateSummary({
        kind: "HOURLY",
        amountCents: 1001,
        scheduledDaysPerWeek: 5,
        scheduledMinutesPerDay: 1,
      }),
    ).toEqual({ daily: 17, weekly: 83 });
    expect(baseRateSummary({ kind: "FIXED", amountCents: 1000 })).toEqual({
      daily: null,
      weekly: null,
    });
    expect(baseRateSummary({ kind: "DAILY", amountCents: 1000 }).weekly).toBeNull();
  });
  it("averages approved zero days but excludes pending or missing days and uses effective policies", () => {
    const policies = [
      { effectiveDate: "2026-10-02", threshold: 50, rateCents: 200, eligible: true },
      { effectiveDate: "2026-10-01", threshold: 50, rateCents: 100, eligible: true },
    ];
    const counts = [
      { date: "2026-10-01", count: 51, approvedAt: new Date() },
      { date: "2026-10-02", count: 0, approvedAt: new Date() },
      { date: "2026-10-03", count: 99, approvedAt: null },
    ];
    expect(commissionSummary("2026-10-01", counts, policies)).toMatchObject({
      daily: 100,
      weekly: 100,
      average: 50,
      approvedDays: 2,
      pendingDays: 1,
    });
    expect(commissionSummary("2026-10-03", counts, policies).daily).toBeNull();
    expect(commissionSummary("2026-10-01", counts, []).weekly).toBeNull();
    expect(commissionSummary("2026-10-01", [], policies)).toMatchObject({
      weekly: null,
      average: null,
    });
    expect(commissionSummary("2026-10-01", [{ ...counts[0], count: 0 }], policies)).toMatchObject({
      daily: 0,
      weekly: 0,
      average: 0,
    });
  });
  it("rounds percentage changes once, bounds decreases and preserves integer cents", () => {
    expect(adjustedCents(10001, 1000, "INCREASE")).toBe(11001);
    expect(adjustedCents(11001, 1000, "DECREASE")).toBe(9901);
    expect(adjustedCents(1, 5000, "INCREASE")).toBe(2);
    expect(adjustedCents(11001, 10000, "DECREASE")).toBe(0);
    expect(() => adjustedCents(100, 10001, "DECREASE")).toThrow();
    expect(() => adjustedCents(2000000000, 1, "INCREASE")).toThrow();
    expect(pageInfo(31, 99)).toEqual({ total: 31, totalPages: 3, page: 3, pageSize: 15 });
  });
});
