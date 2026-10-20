import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("../src/modules/station/vehicle-retention-actions", () => ({
  getVehicleRetentionDetailsAction: vi.fn(),
}));
import { RepeatVehicleAnalysis } from "../src/components/repeat-vehicle-analysis";
vi.mock("../src/app/performance-layout-actions", () => ({
  savePerformancePanelLayoutAction: vi.fn(),
}));
import { PerformanceDashboardPanels } from "../src/components/performance-dashboard-panels";
import { DEFAULT_DASHBOARD_LAYOUT } from "../src/components/performance-dashboard-layout";
import {
  createRetentionModel,
  type RetentionVisit,
} from "../src/modules/station/vehicle-retention";

const rows: RetentionVisit[] = ["2025-01-01", "2026-01-01"].map((date, i) => ({
  id: `record-${i}`,
  key: `fingerprint-${i}`,
  source: "GA",
  sourceId: String(i),
  date,
  minute: 600,
  inspector: "Inspector A",
  outcome: "PASS",
  vinHash: "private-hash-not-for-browser",
  plateHash: null,
  invalidVin: false,
  identityStatus: "VALID_VIN",
  suffix: "1234",
  payment: "UNKNOWN",
  retest: "UNKNOWN",
  completion: "COMPLETED",
  sourceKind: "VIR",
  sourceUrl: null,
}));
const coverage = {
  start: "2025-01-01",
  end: "2026-10-19",
  totalDates: 657,
  loadedDates: 656,
  missingPeriods: [{ start: "2026-10-18", end: "2026-10-18" }],
  incompletePeriods: [],
  unprocessedPeriods: [],
  recordsNeedingReview: 0,
  unrepresentedRecords: 0,
};
function render(visits = rows, trendDays: "all" | 7 = "all") {
  const retention = createRetentionModel(
    visits,
    coverage,
    { label: "All inspectors", inspector: null },
    { start: "2026-10-01", end: "2026-10-19" },
  ).report;
  return renderToStaticMarkup(
    createElement(RepeatVehicleAnalysis, {
      report: {
        start: coverage.start,
        end: coverage.end,
        identifiedInspections: 8,
        unidentifiedInspections: 0,
        distinctVehicles: 5,
        repeatVehicles: 2,
        repeatVisits: 3,
        freeRetests: 0,
        paidRepeatInspections: 0,
        classificationUnknownDates: 0,
        retention,
      },
      query: { start: "2026-10-01", end: "2026-10-19", trendDays },
      pendingDates: 0,
      incompleteDates: 0,
    }),
  );
}
describe("retention presentation", () => {
  it("places the analysis directly after Trend, including when the panel order changes", () => {
    const layout = [
      DEFAULT_DASHBOARD_LAYOUT[1],
      DEFAULT_DASHBOARD_LAYOUT[0],
      ...DEFAULT_DASHBOARD_LAYOUT.slice(2),
    ];
    const html = renderToStaticMarkup(
      createElement(PerformanceDashboardPanels, {
        layout,
        employeeRowCount: 0,
        onMove: vi.fn(),
        onResize: vi.fn(),
        onDrop: vi.fn(),
        renderPanel: (id) => createElement("div", null, `${id} content`),
        afterPanel: (id) =>
          id === "trend" ? createElement("section", null, "Repeat analysis content") : null,
      }),
    );
    expect(html.indexOf("trend content")).toBeLessThan(html.indexOf("Repeat analysis content"));
    expect(html.indexOf("Repeat analysis content")).toBeLessThan(
      html.indexOf("busy-hours content"),
    );
    expect(html).toContain('data-testid="after-panel-trend"');
  });
  it("shows useful return stats directly without competing counts or a collapsed section", () => {
    const html = render();
    expect(html).toContain("<h2>Vehicle history</h2>");
    expect(html).toContain("Vehicles that returned");
    expect(html).toContain("Typical return time");
    expect(html).toContain("Returned the following year");
    expect(html).toContain("When vehicles come back");
    expect(html.match(/data-testid="metric-/g)).toHaveLength(2);
    expect(html).not.toContain("Recorded repeat vehicles");
    expect(html).not.toContain("Distinct VIN-matched vehicles");
    expect(html).not.toContain("Repeat inspections");
    expect(html).not.toContain('data-testid="metric-return-visits"');
    expect(html).not.toContain("QUALIFYING RETENTION");
    expect(html).not.toContain("TREND TIMEFRAME");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("More details");
    expect(html).toContain("30-day free-retest rule");
    expect(html).not.toContain("Payment not verified");
    expect(html).not.toContain("inspections need review");
    expect(html).toContain('data-testid="value-repeat-pct">1</strong>');
    expect(html).toContain("100.0% of 1 vehicle · 2+ qualifying visits in saved history");
    expect(html).toContain("Incomplete data");
    expect(html).toContain("VIN available:");
    expect(html).toContain("656 / 657 dates loaded");
    expect(html).toContain('data-testid="button-drill-repeat-pct">View vehicles');
    expect(html).not.toContain("Repeat inspections");
    expect(html).not.toContain("private-hash-not-for-browser");
    expect(html).not.toContain("New customer");
    expect(html).not.toContain("Free repeats · within 30 days");
    expect(html).not.toContain("Paid repeats · after 30 days");
  });
  it("uses the selected-period rate outside All Time and keeps its meaning visible", () => {
    const html = render(
      [...rows, { ...rows[1], id: "later", key: "later", sourceId: "later", date: "2026-10-10" }],
      7,
    );
    expect(html).toContain('data-testid="value-selected">1</strong>');
    expect(html).toContain("100.0% of 1 vehicle · Visited before these dates, then returned");
    expect(html).not.toContain('data-testid="value-repeat-pct"');
    expect(html).not.toContain('data-testid="metric-month"');
    expect(html).not.toContain('data-testid="metric-year"');
  });
  it("uses Insufficient data for empty denominators rather than a zero rate", () => {
    const html = render([]);
    expect(html).toContain('data-testid="value-repeat-pct">Insufficient data');
    expect(html).toContain('data-testid="value-median-interval">Insufficient data');
    expect(html).toContain("No return-time data available.");
    expect(html).not.toContain('id="vr-cohort-h"');
    expect(html).not.toContain('class="vr-bands"');
  });
});
