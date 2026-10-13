import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  employeePanelDisplayHeight,
  normalizeDashboardLayout,
  parseDashboardLayout,
  reorderDashboardPanel,
  resizeDashboardPanel,
} from "../src/components/performance-dashboard-layout";

describe("customizable performance panels", () => {
  it("accepts only complete, valid account layouts", () => {
    expect(normalizeDashboardLayout(DEFAULT_DASHBOARD_LAYOUT)).toEqual(DEFAULT_DASHBOARD_LAYOUT);
    expect(normalizeDashboardLayout(DEFAULT_DASHBOARD_LAYOUT.slice(0, 3))).toBeNull();
    expect(
      normalizeDashboardLayout([...DEFAULT_DASHBOARD_LAYOUT, DEFAULT_DASHBOARD_LAYOUT[0]]),
    ).toBeNull();
    expect(
      normalizeDashboardLayout(
        DEFAULT_DASHBOARD_LAYOUT.map((panel, index) =>
          index === 0 ? { ...panel, columns: 13 } : panel,
        ),
      ),
    ).toBeNull();
  });

  it("expands the Employees panel to show up to six visible rows", () => {
    expect(employeePanelDisplayHeight(240, 1)).toBe(240);
    expect(employeePanelDisplayHeight(240, 3)).toBe(364);
    expect(employeePanelDisplayHeight(420, 3)).toBe(364);
    expect(employeePanelDisplayHeight(240, 4)).toBe(442);
    expect(employeePanelDisplayHeight(240, 6)).toBe(598);
    expect(employeePanelDisplayHeight(600, 4)).toBe(600);
    expect(employeePanelDisplayHeight(240, 5)).toBe(520);
    expect(employeePanelDisplayHeight(240, 7)).toBe(240);
    expect(employeePanelDisplayHeight(240, 0)).toBe(240);
  });

  it("keeps existing full-width panels and adds two insight panels side by side", () => {
    expect(DEFAULT_DASHBOARD_LAYOUT).toEqual([
      { id: "trend", columns: 12, height: 360 },
      { id: "employees", columns: 12, height: 240 },
      { id: "busy-hours", columns: 6, height: 420 },
      { id: "commission-progress", columns: 6, height: 420 },
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
      { id: "busy-hours", columns: 6, height: 420 },
      { id: "commission-progress", columns: 6, height: 420 },
    ]);
  });

  it("keeps old saved positions/sizes and appends new panels without resetting preferences", () => {
    const migrated = parseDashboardLayout(
      JSON.stringify([
        { id: "employees", columns: 5, height: 300 },
        { id: "trend", columns: 7, height: 500 },
      ]),
    );
    expect(migrated.slice(0, 2)).toEqual([
      { id: "employees", columns: 5, height: 300 },
      { id: "trend", columns: 7, height: 500 },
    ]);
    expect(migrated.slice(2)).toEqual(DEFAULT_DASHBOARD_LAYOUT.slice(2));
    const moved = reorderDashboardPanel(migrated, "busy-hours", 0);
    const resized = resizeDashboardPanel(moved, "commission-progress", 1, 40);
    expect(parseDashboardLayout(JSON.stringify(resized))).toEqual(resized);
  });

  it.each([null, "", "{", "{}", "null"])(
    "uses safe defaults for invalid saved layouts (%s)",
    (saved) => {
      expect(parseDashboardLayout(saved)).toEqual(DEFAULT_DASHBOARD_LAYOUT);
    },
  );

  it("moves panels accessibly and accepts a dropped panel target", () => {
    const swapped = reorderDashboardPanel(DEFAULT_DASHBOARD_LAYOUT, "employees", 0);
    expect(swapped.map((panel) => panel.id)).toEqual([
      "employees",
      "trend",
      "busy-hours",
      "commission-progress",
    ]);
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
