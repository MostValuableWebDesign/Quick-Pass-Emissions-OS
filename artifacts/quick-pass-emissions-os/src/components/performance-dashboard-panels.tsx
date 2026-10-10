"use client";

import { useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Grip, GripVertical, MoveDown, MoveUp } from "lucide-react";
import {
  DASHBOARD_LAYOUT_KEY, DEFAULT_DASHBOARD_LAYOUT, parseDashboardLayout,
  reorderDashboardPanel, resizeDashboardPanel,
  type DashboardLayout, type DashboardPanelId,
} from "./performance-dashboard-layout";

const titles: Record<DashboardPanelId, string> = {
  trend: "Trend", employees: "Employees",
};

const CHANGE_EVENT = "quick-pass:performance-panel-layout";
let cachedRaw: string | null = null;
let cachedLayout = DEFAULT_DASHBOARD_LAYOUT;
let hasSnapshot = false;
let storageAvailable = true;

function getLayoutSnapshot() {
  let raw: string | null = null;
  try { raw = localStorage.getItem(DASHBOARD_LAYOUT_KEY); } catch {
    storageAvailable = false;
    if (!hasSnapshot) {
      cachedLayout = DEFAULT_DASHBOARD_LAYOUT;
      hasSnapshot = true;
    }
    return cachedLayout;
  }
  if (!storageAvailable && raw === null) return cachedLayout;
  if (!hasSnapshot || raw !== cachedRaw) {
    cachedRaw = raw;
    cachedLayout = parseDashboardLayout(raw);
    hasSnapshot = true;
  }
  return cachedLayout;
}

function subscribeLayout(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function saveLayout(next: DashboardLayout) {
  cachedLayout = next;
  cachedRaw = JSON.stringify(next);
  hasSnapshot = true;
  try { localStorage.setItem(DASHBOARD_LAYOUT_KEY, cachedRaw); }
  catch { storageAvailable = false; }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function usePerformanceDashboardLayout() {
  const layout = useSyncExternalStore(
    subscribeLayout, getLayoutSnapshot, () => DEFAULT_DASHBOARD_LAYOUT,
  );

  return {
    layout,
    move(id: DashboardPanelId, toIndex: number) {
      const next = reorderDashboardPanel(getLayoutSnapshot(), id, toIndex);
      if (next !== getLayoutSnapshot()) saveLayout(next);
    },
    resize(id: DashboardPanelId, columns: number, height: number) {
      const current = getLayoutSnapshot();
      const next = resizeDashboardPanel(current, id, columns, height);
      if (next !== current) saveLayout(next);
    },
    reset() {
      saveLayout(DEFAULT_DASHBOARD_LAYOUT.map((panel) => ({ ...panel })));
    },
  };
}

function PanelTools({
  id, index, total, onMove, onResize,
}: {
  id: DashboardPanelId;
  index: number;
  total: number;
  onMove: (to: number) => void;
  onResize: (columns: number, height: number) => void;
}) {
  const start = useRef<{
    x: number; y: number; columns: number; height: number;
    lastColumns: number; lastHeight: number; columnWidth: number; pointer: number;
  } | null>(null);

  function begin(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const widget = event.currentTarget.closest<HTMLElement>(".pd-widget");
    const grid = widget?.parentElement;
    if (!widget || !grid) return;
    const style = getComputedStyle(grid);
    const gap = Number.parseFloat(style.columnGap) || 0;
    const columnWidth = (grid.clientWidth - gap * 11) / 12;
    const rect = widget.getBoundingClientRect();
    const columns = Number.parseInt(style.gridColumnEnd.replace("span ", ""), 10);
    const safeColumns = Number.isFinite(columns) ? columns : 12;
    start.current = {
      x: event.clientX, y: event.clientY, columns: safeColumns,
      height: rect.height, lastColumns: safeColumns, lastHeight: rect.height,
      columnWidth, pointer: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    const origin = start.current;
    if (!origin || origin.pointer !== event.pointerId) return;
    const targetColumns = window.matchMedia("(max-width: 760px)").matches
      ? origin.columns : Math.max(4, Math.min(12, origin.columns + Math.round((event.clientX - origin.x) / origin.columnWidth)));
    const targetHeight = Math.max(240, Math.min(720, origin.height + Math.round((event.clientY - origin.y) / 40) * 40));
    const columnsDelta = targetColumns - origin.lastColumns;
    const heightDelta = targetHeight - origin.lastHeight;
    if (columnsDelta || heightDelta) onResize(columnsDelta, heightDelta);
    start.current = {
      ...origin, lastColumns: targetColumns, lastHeight: targetHeight,
    };
  }

  return (
    <div className="pd-panel-tools" role="group" aria-label={`${titles[id]} panel layout controls`}>
      <button
        type="button" draggable
        className="pd-panel-tool pd-panel-drag"
        aria-label={`Drag to move ${titles[id]} panel`}
        title="Drag to move this panel"
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", id);
          event.dataTransfer.effectAllowed = "move";
        }}
      >
        <GripVertical size={15} aria-hidden="true" />
      </button>
      <button type="button" className="pd-panel-tool" aria-label={`Move ${titles[id]} panel up`} title="Move up" disabled={index === 0} onClick={() => onMove(index - 1)}>
        <MoveUp size={14} aria-hidden="true" />
      </button>
      <button type="button" className="pd-panel-tool" aria-label={`Move ${titles[id]} panel down`} title="Move down" disabled={index === total - 1} onClick={() => onMove(index + 1)}>
        <MoveDown size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="pd-panel-tool pd-panel-resize"
        aria-label={`Resize ${titles[id]} panel. Drag horizontally or vertically; use arrow keys to resize.`}
        title="Drag to resize · arrow keys also work"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={() => { start.current = null; }}
        onPointerCancel={() => { start.current = null; }}
        onKeyDown={(event) => {
          const changes: Record<string, [number, number]> = {
            ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -40], ArrowDown: [0, 40],
          };
          const change = changes[event.key];
          if (!change) return;
          event.preventDefault();
          onResize(window.matchMedia("(max-width: 760px)").matches ? 0 : change[0], change[1]);
        }}
      >
        <Grip size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

export function PerformanceDashboardPanels({
  layout, onMove, onResize, onDrop, renderPanel,
}: {
  layout: DashboardLayout;
  onMove: (id: DashboardPanelId, toIndex: number) => void;
  onResize: (id: DashboardPanelId, columns: number, height: number) => void;
  onDrop: (id: DashboardPanelId, target: DashboardPanelId) => void;
  renderPanel: (id: DashboardPanelId, controls: ReactNode) => ReactNode;
}) {
  const controls = (id: DashboardPanelId) => {
    const index = layout.findIndex((panel) => panel.id === id);
    return (
      <PanelTools key={id} id={id} index={index} total={layout.length}
        onMove={(to) => onMove(id, to)} onResize={(columns, height) => onResize(id, columns, height)} />
    );
  };
  return (
    <div className="pd-grid" data-testid="performance-panel-grid">
      {layout.map((panel) => (
        <div
          key={panel.id}
          className="pd-widget"
          data-testid={`panel-${panel.id}`}
          style={{ gridColumn: `span ${panel.columns}`, height: panel.height }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const dragged = event.dataTransfer.getData("text/plain");
            if (dragged === "trend" || dragged === "employees") onDrop(dragged, panel.id);
          }}
        >
          {renderPanel(panel.id, controls(panel.id))}
        </div>
      ))}
    </div>
  );
}
