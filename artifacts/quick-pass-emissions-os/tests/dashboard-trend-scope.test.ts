import { describe, expect, it } from "vitest";
import { dashboardDates, dashboardTrendRange } from "../src/modules/station/dashboard-calculations";

describe("Independent report and trend periods", () => {
  it("retrieves Jan 2023 through today independently of the selected report dates", () => {
    const query = { start: "2026-06-01", end: "2026-06-30", trendDays: "since2023" as const };
    expect(dashboardTrendRange(query, "2026-10-18")).toEqual({
      start: "2023-01-01",
      end: "2026-10-18",
    });
    const dates = dashboardDates(query, "2026-10-18");
    expect(dates).toHaveLength(1387);
    expect(dates[0]).toBe("2023-01-01");
    expect(dates.at(-1)).toBe("2026-10-18");
    expect(dates).toContain("2024-02-29");
    expect(dates).not.toContain("2026-10-19");
  });
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

  it("loads a two-calendar-year trend ending at the report date", () => {
    const query = { start: "2026-10-18", end: "2026-10-18", trendDays: 730 as const };
    expect(dashboardTrendRange(query, "2026-10-19")).toEqual({
      start: "2024-10-18",
      end: "2026-10-18",
    });
    const dates = dashboardDates(query, "2026-10-19");
    expect(dates).toContain("2024-10-18");
    expect(dates).toContain("2026-10-18");
    expect(dates).toContain("2026-10-19");
  });
});
