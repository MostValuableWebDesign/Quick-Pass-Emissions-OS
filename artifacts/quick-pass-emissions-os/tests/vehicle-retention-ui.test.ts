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
function render(visits = rows) {
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
      query: { start: "2026-10-01", end: "2026-10-19", trendDays: "all" },
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
  it("preserves the recorded summary, adds defined retention, and discloses provisional matching", () => {
    const html = render();
    expect(html).toContain("Vehicles tested more than once");
    expect(html).toContain("Distinct VIN-matched vehicles");
    expect(html).toContain('data-testid="value-repeat-pct">100.0%');
    expect(html).toContain("Partial coverage");
    expect(html).toContain("First observed in available history");
    expect(html).toContain("Validated VIN identity:");
    expect(html).toContain("America/New_York");
    expect(html).not.toContain("private-hash-not-for-browser");
    expect(html).not.toContain("New customer");
    expect(html.indexOf('data-testid="text-provisional-retest"')).toBeLessThan(
      html.indexOf('data-testid="details-coverage"'),
    );
    expect(html).not.toContain("Free repeats · within 30 days");
    expect(html).not.toContain("Paid repeats · after 30 days");
  });
  it("uses Insufficient data for empty denominators rather than a zero rate", () => {
    const html = render([]);
    expect(html).toContain('data-testid="value-repeat-pct">Insufficient data');
    expect(html).toContain('data-testid="value-median-interval">Insufficient data');
  });
});
