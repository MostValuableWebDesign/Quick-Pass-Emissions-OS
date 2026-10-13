import { describe, expect, it } from "vitest";
import { buildDashboard } from "../src/modules/station/dashboard-calculations";
import { applyPerformancePay, payOverviewInput, recordedCommission } from "../src/modules/payroll/overview";
import type { DashboardData, PayPlan, PortalDay } from "../src/modules/station/dashboard-types";

const plan: PayPlan = {
  revision: 1,
  adjustments: [],
  profiles: [{
    id: "profile-al",
    name: "Al",
    inspector: "ALGIE KEY III",
    hourlyCents: 2300,
    mondayCents: null,
    standardMinutes: 600,
    shiftsPerWeek: 5,
    availableWeekdays: [1, 2, 3, 4, 5, 6],
    scheduledWeekdays: [1, 2, 3, 4, 5],
    commissionEligible: true,
    approximate: false,
  }],
};

function snapshot(date: string, count: number): PortalDay {
  return {
    date,
    retrievedAt: "2026-10-13T17:00:00Z",
    total: count, passed: count, failed: 0, aborted: 0, other: 0,
    verifiedEmpty: false, retestComplete: true,
    inspectors: [{
      inspector: "ALGIE KEY III",
      total: count, passed: count, failed: 0, aborted: 0, other: 0,
    }],
  };
}

function report(start: string, end: string): DashboardData {
  return buildDashboard(
    { start, end, trendDays: 7 },
    "2026-10-13",
    [snapshot("2026-10-12", 95), snapshot("2026-10-13", 60)],
    plan,
  );
}

function roster(start: string, end: string) {
  return {
    filter: {
      date: end, start, end, weekStart: 1,
      employeesPage: 1, historyPage: 1, periodsPage: 1,
    },
    week: { start: "2026-10-12", end: "2026-10-18" },
    employees: [{
      id: "staff-al", name: "Al (Algie)", active: true,
      base: { daily: 23000, weekly: 115000 },
      commission: { daily: null, weekly: null, average: null, approvedDays: 0, pendingDays: 0, missingPolicies: 0 },
      rangeCommission: { daily: null, weekly: null, average: null, approvedDays: 0, pendingDays: 0, missingPolicies: 0 },
      policy: null,
    }],
  } as unknown as Parameters<typeof applyPerformancePay>[0];
}

describe("informational payroll projection", () => {
  it("uses the shop-wide Performance commission over 50 cars per day for both selected and weekly amounts", () => {
    const single = applyPerformancePay(roster("2026-10-12", "2026-10-12"), report("2026-10-12", "2026-10-13"));
    expect(single.employees[0].commission).toMatchObject({
      daily: 4500, weekly: 5500, average: 2750, recordedDays: 2, missingDays: 0,
    });
    const range = applyPerformancePay(roster("2026-10-12", "2026-10-13"), report("2026-10-12", "2026-10-13"));
    expect(range.employees[0].commission).toMatchObject({
      daily: 5500, weekly: 5500, average: 2750, recordedDays: 2, missingDays: 0,
    });
    expect(range.employees[0].rate).toMatchObject({ rateCents: 100, threshold: 50 });
  });
  it("shows known commissions with missing-day coverage, without inventing commission from absent reports", () => {
    const result = applyPerformancePay(
      roster("2026-10-12", "2026-10-14"),
      report("2026-10-12", "2026-10-14"),
    );
    expect(result.employees[0].commission).toMatchObject({
      daily: 5500, recordedDays: 2, missingDays: 1,
    });
    expect(recordedCommission([{ date: "2026-10-14", cents: null, working: true, workKnown: true }]).total).toBeNull();
  });
  it("rejects reversed, future, and overlong date ranges", () => {
    expect(payOverviewInput.safeParse({ start: "2026-10-13", end: "2026-10-12" }).success).toBe(false);
    expect(payOverviewInput.safeParse({ start: "2026-10-13", end: "2099-01-01" }).success).toBe(false);
    expect(payOverviewInput.safeParse({ start: "2024-01-01", end: "2026-10-13" }).success).toBe(false);
  });
});
