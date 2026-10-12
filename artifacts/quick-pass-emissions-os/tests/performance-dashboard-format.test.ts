import { describe, expect, it } from "vitest";
import { excludeSundayTrendDays } from "../src/components/performance-dashboard-format";

describe("Performance trend dates", () => {
  it("excludes Sunday while keeping Saturday and Monday", () => {
    const days = ["2026-10-10", "2026-10-11", "2026-10-12"].map((date) => ({ date }));
    expect(excludeSundayTrendDays(days)).toEqual([{ date: "2026-10-10" }, { date: "2026-10-12" }]);
  });

  it("keeps the trend empty when its window contains only Sundays", () => {
    expect(excludeSundayTrendDays([{ date: "2026-10-11" }, { date: "2026-10-18" }])).toEqual([]);
  });
});
