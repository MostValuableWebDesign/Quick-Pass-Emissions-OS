import { describe, expect, it } from "vitest";
import { dashboardDates, dashboardTrendRange } from "../src/modules/station/dashboard-calculations";

describe("Shared Performance reporting window", () => {
  it("uses the same selected dates for report calculations and the chart", () => {
    const query = { start: "2026-09-01", end: "2026-10-12", trendDays: "custom" as const };
    const expected = { start: "2026-09-01", end: "2026-10-12" };
    expect(dashboardTrendRange(query)).toEqual(expected);
    const dates = dashboardDates(query);
    expect(dates).toHaveLength(42);
    expect(dates[0]).toBe(query.start);
    expect(dates.at(-1)).toBe(query.end);
  });

  it("does not append today to a historical date selection", () => {
    const query = { start: "2024-06-01", end: "2024-06-01", trendDays: 365 as const };
    expect(dashboardTrendRange(query)).toEqual({ start: "2024-06-01", end: "2024-06-01" });
    expect(dashboardDates(query)).toEqual(["2024-06-01"]);
  });

  it("uses the verified station date for All Time and otherwise keeps the shared end date", () => {
    const query = { start: "2012-06-18", end: "2026-10-19", trendDays: "all" as const };
    expect(() => dashboardTrendRange(query)).toThrow("verified station-history start");
    expect(dashboardTrendRange(query, "2012-06-18")).toEqual({
      start: "2012-06-18",
      end: "2026-10-19",
    });
    const dates = dashboardDates(query, "2012-06-18");
    expect(dates[0]).toBe(query.start);
    expect(dates.at(-1)).toBe(query.end);
    expect(dates.length).toBeGreaterThan(5000);
  });
});
