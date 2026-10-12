import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  employeePanelDisplayHeight,
  parseDashboardLayout,
  reorderDashboardPanel,
  resizeDashboardPanel,
} from "../src/components/performance-dashboard-layout";

describe("customizable performance panels", () => {
  it("expands the Employees panel to show up to four visible rows", () => {
    expect(employeePanelDisplayHeight(240, 1)).toBe(280);
    expect(employeePanelDisplayHeight(240, 4)).toBe(520);
    expect(employeePanelDisplayHeight(600, 4)).toBe(600);
    expect(employeePanelDisplayHeight(240, 5)).toBe(240);
    expect(employeePanelDisplayHeight(240, 0)).toBe(240);
  });

  it("starts with both panels full-width and keeps the existing trend-first order", () => {
    expect(DEFAULT_DASHBOARD_LAYOUT).toEqual([
      { id: "trend", columns: 12, height: 360 },
      { id: "employees", columns: 12, height: 420 },
    ]);
  });

  it("persists valid order and panel sizes while clamping unsafe values", () => {
    expect(
      parseDashboardLayout(
        JSON.stringify([
          { id: "employees", columns: 5, height: 480 },
          { id: "trend", columns: 30, height: 50 },
          { id: "unknown", columns: 1, height: 1 },
        ]),
      ),
    ).toEqual([
      { id: "employees", columns: 5, height: 480 },
      { id: "trend", columns: 12, height: 240 },
    ]);
  });

  it.each([null, "", "{", "{}", "null"])(
    "uses safe defaults for invalid saved layouts (%s)",
    (saved) => {
      expect(parseDashboardLayout(saved)).toEqual(DEFAULT_DASHBOARD_LAYOUT);
    },
  );

  it("moves panels accessibly and accepts a dropped panel target", () => {
    const swapped = reorderDashboardPanel(DEFAULT_DASHBOARD_LAYOUT, "employees", 0);
    expect(swapped.map((panel) => panel.id)).toEqual(["employees", "trend"]);
    expect(reorderDashboardPanel(swapped, "trend", 1)).toEqual(swapped);
  });

  it("sizes width and height within bounds and leaves other panels unchanged", () => {
    const resized = resizeDashboardPanel(DEFAULT_DASHBOARD_LAYOUT, "trend", -8, -500);
    expect(resized[0]).toMatchObject({ id: "trend", columns: 4, height: 240 });
    expect(resized[1]).toEqual(DEFAULT_DASHBOARD_LAYOUT[1]);
    const expanded = resizeDashboardPanel(resized, "trend", 8, 1000);
    expect(expanded[0]).toMatchObject({ columns: 12, height: 720 });
    expect(resizeDashboardPanel(expanded, "trend", 0, 0)).toBe(expanded);
  });
});
