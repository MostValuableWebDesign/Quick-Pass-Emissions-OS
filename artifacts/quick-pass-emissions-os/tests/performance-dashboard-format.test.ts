import { describe, expect, it } from "vitest";
import {
  excludeSundayTrendDays,
  monthlyTrendPoints,
} from "../src/components/performance-dashboard-format";

describe("Performance trend dates", () => {
  it("excludes Sunday while keeping Saturday and Monday", () => {
    const days = ["2026-10-10", "2026-10-11", "2026-10-12"].map((date) => ({ date }));
    expect(excludeSundayTrendDays(days)).toEqual([{ date: "2026-10-10" }, { date: "2026-10-12" }]);
  });

  it("keeps the trend empty when its window contains only Sundays", () => {
    expect(excludeSundayTrendDays([{ date: "2026-10-11" }, { date: "2026-10-18" }])).toEqual([]);
  });
});

describe("Yearly monthly totals", () => {
  const days = [
    { date: "2026-01-01", value: 20, station: 40 },
    { date: "2026-01-02", value: 30, station: 50 },
    { date: "2026-01-03", value: 40, station: 60 },
    { date: "2026-01-04", value: 999, station: 999 },
  ];

  it("shows twelve months and excludes Sunday from completed totals", () => {
    const months = monthlyTrendPoints(days, 2026, "2026-01-04");
    expect(months).toHaveLength(12);
    expect(months[0]).toMatchObject({
      label: "Jan",
      value: 90,
      station: 150,
      status: "complete",
    });
    expect(months[1]).toMatchObject({ label: "Feb", value: null, status: "upcoming" });
    expect(months[11].label).toBe("Dec");
  });

  it("does not present incomplete monthly coverage as a total or zero", () => {
    const months = monthlyTrendPoints(
      days.filter((day) => day.date !== "2026-01-02"),
      2026,
      "2026-01-04",
    );
    expect(months[0]).toMatchObject({ value: null, station: null, status: "incomplete" });
  });

  it("keeps confirmed zero days as a known zero total", () => {
    const months = monthlyTrendPoints(
      [{ date: "2026-01-01", value: 0, station: 0 }],
      2026,
      "2026-01-01",
    );
    expect(months[0]).toMatchObject({ value: 0, status: "complete" });
  });

  it("requires February 29 when aggregating a leap year", () => {
    const february = Array.from({ length: 29 }, (_, day) => ({
      date: `2024-02-${String(day + 1).padStart(2, "0")}`,
      value: 1,
      station: 2,
    }));
    expect(monthlyTrendPoints(february, 2024, "2024-12-31")[1]).toMatchObject({
      value: 25,
      station: 50,
      status: "complete",
    });
    expect(monthlyTrendPoints(february.slice(0, -1), 2024, "2024-12-31")[1].value).toBeNull();
  });
});
