import { describe, expect, it } from "vitest";
import { dashboardDates, dashboardTrendRange } from "../src/modules/station/dashboard-calculations";

describe("Independent report and trend periods", () => {
  it("anchors a daily lookback at the report end, not the report start", () => {
    const query = { start: "2026-09-01", end: "2026-10-12", trendDays: 7 as const };
    expect(dashboardTrendRange(query, "2026-10-13")).toEqual({
      start: "2026-10-06",
      end: "2026-10-12",
    });
    const dates = dashboardDates(query, "2026-10-13");
    expect(dates).toContain("2026-09-01");
    expect(dates).toContain("2026-10-13");
  });

  it("loads the selected calendar year only through today", () => {
    const query = { start: "2026-10-12", end: "2026-10-12", trendDays: 365 as const };
    expect(dashboardTrendRange(query, "2026-10-13")).toEqual({
      start: "2026-01-01",
      end: "2026-10-13",
    });
    expect(dashboardDates(query, "2026-10-13")).not.toContain("2026-10-14");
  });

  it("uses the full selected year for past years", () => {
    expect(
      dashboardTrendRange({ start: "2024-06-01", end: "2024-06-01", trendDays: 365 }, "2026-10-13"),
    ).toEqual({ start: "2024-01-01", end: "2024-12-31" });
  });

  it.each([
    [2, 730, "2024-10-19"],
    [3, 1095, "2023-10-19"],
    [4, 1460, "2022-10-19"],
    [5, 1825, "2021-10-19"],
  ] as const)("loads the past %s years through the report date", (years, days, expectedStart) => {
    const query = { start: "2026-10-19", end: "2026-10-19", trendDays: days };
    expect(dashboardTrendRange(query, "2026-10-19")).toEqual({
      start: expectedStart,
      end: "2026-10-19",
    });
    const dates = dashboardDates(query, "2026-10-19");
    expect(dates[0]).toBe(expectedStart);
    expect(dates.at(-1)).toBe("2026-10-19");
    expect(dates).toContain("2024-02-29");
  });
});
