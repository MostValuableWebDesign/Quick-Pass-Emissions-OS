import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PerformanceCalendar } from "@/components/performance-calendar";
import {
  dayState,
  finalize,
  monthGrid,
  pickDay,
  selectStartDate,
  shouldAutoSearchSingleDay,
  shiftMonth,
} from "@/components/performance-calendar-utils";

const max = "2025-03-20";

describe("Performance calendar controls", () => {
  const renderCalendar = (start: string, end: string) =>
    renderToStaticMarkup(
      createElement(PerformanceCalendar, {
        start,
        end,
        today: max,
        period: "custom",
      }),
    );

  it("shows one date and hides range controls in single-day mode", () => {
    const markup = renderCalendar("2025-03-10", "2025-03-10");
    expect(markup).toContain("Mar 10, 2025");
    expect(markup).not.toContain(">From</span>");
    expect(markup).not.toContain(">Through</span>");
    expect(markup).not.toContain(">Today</button>");
    expect(markup).not.toContain("Apply dates");
    expect(markup).not.toContain("Report scope");
    expect(markup).not.toContain('class="pd-cal-side"');
    expect(markup).not.toContain("text-cal-selection");
  });

  it("shows date fields and actions in date-range mode", () => {
    const markup = renderCalendar("2025-03-10", "2025-03-15");
    expect(markup).toContain(">From</span>");
    expect(markup).toContain(">Through</span>");
    expect(markup).not.toContain(">Today</button>");
    expect(markup).toContain("Apply dates");
    expect(markup).not.toContain("Report scope");
    expect(markup).not.toContain('class="pd-cal-side"');
    expect(markup).not.toContain("Mar 10, 2025 to Mar 15, 2025");
  });
  it("keeps period presets inside the shared calendar control", () => {
    const markup = renderCalendar("2025-03-10", "2025-03-15");
    expect(markup).toContain('data-testid="select-report-period"');
    expect(markup).toContain(">Past 7 Days</option>");
    expect(markup).toContain(">Past 1 Year</option>");
    expect(markup).toContain(">Year to Date</option>");
    expect(markup).toContain(">All Time</option>");
    const toolbar = markup.slice(
      markup.indexOf('class="pd-cal-top"'),
      markup.indexOf('class="pd-cal-grid"'),
    );
    expect(toolbar).toContain('data-testid="select-report-period"');
    expect(markup).not.toContain("select-trend");
  });
});

describe("performance calendar helpers", () => {
  it("builds month grid with leading padding", () => {
    const g = monthGrid(2025, 2); // March 2025 starts Saturday
    expect(g.slice(0, 6).every((c) => c === null)).toBe(true);
    expect(g[6]).toBe("2025-03-01");
    expect(g.length % 7).toBe(0);
    expect(g.filter(Boolean).length).toBe(31);
  });
  it("shifts months across years", () => {
    expect(shiftMonth(2025, 0, -1)).toEqual({ y: 2024, m: 11 });
    expect(shiftMonth(2024, 11, 1)).toEqual({ y: 2025, m: 0 });
  });
  it("single mode selects one day", () => {
    expect(
      pickDay("single", { start: "2025-03-01", end: "2025-03-05" }, "2025-03-10", max),
    ).toEqual({ start: "2025-03-10", end: "2025-03-10" });
  });
  it("auto-searches a past date selected through From in single-day mode", () => {
    const selection = pickDay(
      "single",
      { start: "2025-03-15", end: "2025-03-15" },
      "2025-03-10",
      max,
    );
    expect(selection).toEqual({ start: "2025-03-10", end: "2025-03-10" });
    expect(shouldAutoSearchSingleDay("single", selection)).toBe(true);
  });
  it("keeps From changes in date-range mode pending until Apply", () => {
    const existingRange = selectStartDate(
      "range",
      { start: "2025-03-01", end: "2025-03-15" },
      "2025-03-10",
    );
    expect(existingRange).toEqual({ start: "2025-03-10", end: "2025-03-15" });
    expect(shouldAutoSearchSingleDay("range", existingRange)).toBe(false);

    const newRange = selectStartDate(
      "range",
      { start: "2025-03-01", end: "2025-03-05" },
      "2025-03-10",
    );
    expect(newRange).toEqual({ start: "2025-03-10", end: null });
    expect(shouldAutoSearchSingleDay("range", newRange)).toBe(false);
  });
  it("ignores future days", () => {
    const sel = { start: "2025-03-01", end: null };
    expect(pickDay("range", sel, "2025-03-21", max)).toBe(sel);
  });
  it("range mode: start then end, ordering swapped", () => {
    let s = pickDay("range", { start: "2025-03-01", end: "2025-03-02" }, "2025-03-10", max);
    expect(s).toEqual({ start: "2025-03-10", end: null });
    s = pickDay("range", s, "2025-03-04", max);
    expect(s).toEqual({ start: "2025-03-04", end: "2025-03-10" });
    expect(dayState("2025-03-06", s, null)).toEqual({ start: false, end: false, inRange: true });
  });
  it("finalize collapses incomplete range", () => {
    expect(finalize({ start: "2025-03-04", end: null })).toEqual({
      start: "2025-03-04",
      end: "2025-03-04",
    });
  });
});
