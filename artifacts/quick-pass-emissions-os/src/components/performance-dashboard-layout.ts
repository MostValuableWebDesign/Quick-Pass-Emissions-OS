export type DashboardPanelId = "trend" | "employees";
export type DashboardPanel = {
  id: DashboardPanelId;
  columns: number;
  height: number;
};
export type DashboardLayout = DashboardPanel[];

export const DASHBOARD_LAYOUT_KEY = "quick-pass-performance-layout-v1";
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = [
  { id: "trend", columns: 12, height: 360 },
  { id: "employees", columns: 12, height: 420 },
];

export function employeePanelDisplayHeight(savedHeight: number, visibleRows: number) {
  const minimum =
    visibleRows > 0 && visibleRows < 7 ? Math.min(720, 250 + visibleRows * 80) : 0;
  return Math.max(savedHeight, minimum);
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

export function parseDashboardLayout(raw: string | null): DashboardLayout {
  if (!raw) return DEFAULT_DASHBOARD_LAYOUT.map((panel) => ({ ...panel }));
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_DASHBOARD_LAYOUT.map((panel) => ({ ...panel }));
    const source = new Map<DashboardPanelId, Partial<DashboardPanel>>();
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        "id" in item &&
        (item.id === "trend" || item.id === "employees")
      ) {
        source.set(item.id, item);
      }
    }
    return DEFAULT_DASHBOARD_LAYOUT.map((fallback) => {
      const item = source.get(fallback.id);
      return {
        id: fallback.id,
        columns:
          typeof item?.columns === "number" && Number.isFinite(item.columns)
            ? clamp(item.columns, 4, 12)
            : fallback.columns,
        height:
          typeof item?.height === "number" && Number.isFinite(item.height)
            ? clamp(item.height, 240, 720)
            : fallback.height,
      };
    }).sort((a, b) => {
      const aIndex = parsed.findIndex(
        (entry) => entry && typeof entry === "object" && "id" in entry && entry.id === a.id,
      );
      const bIndex = parsed.findIndex(
        (entry) => entry && typeof entry === "object" && "id" in entry && entry.id === b.id,
      );
      return (aIndex < 0 ? parsed.length : aIndex) - (bIndex < 0 ? parsed.length : bIndex);
    });
  } catch {
    return DEFAULT_DASHBOARD_LAYOUT.map((panel) => ({ ...panel }));
  }
}

export function reorderDashboardPanel(
  layout: DashboardLayout,
  id: DashboardPanelId,
  toIndex: number,
) {
  const from = layout.findIndex((panel) => panel.id === id);
  if (from < 0) return layout;
  const to = clamp(toIndex, 0, layout.length - 1);
  if (from === to) return layout;
  const next = [...layout];
  const [panel] = next.splice(from, 1);
  next.splice(to, 0, panel);
  return next;
}

export function resizeDashboardPanel(
  layout: DashboardLayout,
  id: DashboardPanelId,
  columnsDelta: number,
  heightDelta: number,
) {
  if (columnsDelta === 0 && heightDelta === 0) return layout;
  return layout.map((panel) =>
    panel.id === id
      ? {
          ...panel,
          columns: clamp(panel.columns + columnsDelta, 4, 12),
          height: clamp(panel.height + heightDelta, 240, 720),
        }
      : panel,
  );
}
