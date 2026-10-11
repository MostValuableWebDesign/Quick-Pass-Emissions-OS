"use client";

import { useRef, useSyncExternalStore, type ReactNode } from "react";
import { GripVertical, MoveDown, MoveUp } from "lucide-react";
import { PanelResizeHandle } from "./performance-panel-resize-handle";
import {
  DASHBOARD_LAYOUT_KEY,
  DEFAULT_DASHBOARD_LAYOUT,
  parseDashboardLayout,
  reorderDashboardPanel,
  resizeDashboardPanel,
  type DashboardLayout,
  type DashboardPanelId,
} from "./performance-dashboard-layout";

const titles: Record<DashboardPanelId, string> = {
  trend: "Trend",
  employees: "Employees",
};

const CHANGE_EVENT = "quick-pass:performance-panel-layout";
let cachedRaw: string | null = null;
let cachedLayout = DEFAULT_DASHBOARD_LAYOUT;
let hasSnapshot = false;
let storageAvailable = true;

function getLayoutSnapshot() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DASHBOARD_LAYOUT_KEY);
  } catch {
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
  try {
    localStorage.setItem(DASHBOARD_LAYOUT_KEY, cachedRaw);
  } catch {
    storageAvailable = false;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function usePerformanceDashboardLayout() {
  const layout = useSyncExternalStore(
    subscribeLayout,
    getLayoutSnapshot,
    () => DEFAULT_DASHBOARD_LAYOUT,
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
  id,
  index,
  total,
  onMove,
}: {
  id: DashboardPanelId;
  index: number;
  total: number;
  onMove: (to: number) => void;
}) {
  const drag = useRef<{ pointer: number; x: number; y: number; moved: boolean } | null>(null);

  function clearDrag(element: HTMLElement) {
    element
      .closest(".pd-grid")
      ?.querySelectorAll<HTMLElement>(".pd-widget")
      .forEach((widget) => {
        delete widget.dataset.dragOver;
      });
    drag.current = null;
  }

  return (
    <div className="pd-panel-tools" role="group" aria-label={`${titles[id]} panel layout controls`}>
      <button
        type="button"
        className="pd-panel-tool pd-panel-drag"
        aria-label={`Drag to move ${titles[id]} panel`}
        title="Drag to move this panel"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          drag.current = {
            pointer: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const origin = drag.current;
          if (!origin || origin.pointer !== event.pointerId) return;
          if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8)
            origin.moved = true;
          if (!origin.moved) return;
          const target = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLElement>(".pd-widget");
          event.currentTarget
            .closest(".pd-grid")
            ?.querySelectorAll<HTMLElement>(".pd-widget")
            .forEach((widget) => {
              delete widget.dataset.dragOver;
            });
          if (target && target.dataset.panelId !== id) target.dataset.dragOver = "true";
        }}
        onPointerUp={(event) => {
          const origin = drag.current;
          const target = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLElement>(".pd-widget");
          const grid = event.currentTarget.closest(".pd-grid");
          if (origin?.moved && target && grid?.contains(target)) {
            const widgets = Array.from(grid.querySelectorAll<HTMLElement>(".pd-widget"));
            const targetIndex = widgets.indexOf(target);
            if (targetIndex >= 0) onMove(targetIndex);
          }
          clearDrag(event.currentTarget);
        }}
        onPointerCancel={(event) => clearDrag(event.currentTarget)}
      >
        <GripVertical size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="pd-panel-tool"
        aria-label={`Move ${titles[id]} panel up`}
        title="Move up"
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
      >
        <MoveUp size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="pd-panel-tool"
        aria-label={`Move ${titles[id]} panel down`}
        title="Move down"
        disabled={index === total - 1}
        onClick={() => onMove(index + 1)}
      >
        <MoveDown size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

export function PerformanceDashboardPanels({
  layout,
  onMove,
  onResize,
  onDrop,
  renderPanel,
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
      <PanelTools
        key={id}
        id={id}
        index={index}
        total={layout.length}
        onMove={(to) => onMove(id, to)}
      />
    );
  };
  return (
    <div className="pd-grid" data-testid="performance-panel-grid">
      {layout.map((panel) => (
        <div
          key={panel.id}
          className="pd-widget"
          data-panel-id={panel.id}
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
          <PanelResizeHandle
            label={titles[panel.id]}
            columns={panel.columns}
            height={panel.height}
            onResize={(columns, height) => onResize(panel.id, columns, height)}
          />
        </div>
      ))}
    </div>
  );
}
