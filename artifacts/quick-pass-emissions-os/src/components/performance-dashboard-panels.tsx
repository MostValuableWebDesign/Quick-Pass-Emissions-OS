"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { GripVertical, MoveDown, MoveUp } from "lucide-react";
import { savePerformancePanelLayoutAction } from "@/app/performance-layout-actions";
import { PanelResizeHandle } from "./performance-panel-resize-handle";
import {
  DASHBOARD_LAYOUT_KEY,
  isDashboardPanelId,
  DEFAULT_DASHBOARD_LAYOUT,
  employeePanelDisplayHeight,
  parseDashboardLayout,
  reorderDashboardPanel,
  resizeDashboardPanel,
  type DashboardLayout,
  type DashboardPanelId,
} from "./performance-dashboard-layout";

const titles: Record<DashboardPanelId, string> = {
  trend: "Trend",
  employees: "Employees",
  "busy-hours": "Busy hours",
  "commission-progress": "Commission progress",
};

function saveLocalLayout(key: string, layout: DashboardLayout) {
  try {
    localStorage.setItem(key, JSON.stringify(layout));
  } catch {
    // Account saving remains authoritative when browser storage is unavailable.
  }
}

export function usePerformanceDashboardLayout(
  initialLayout: DashboardLayout | null,
  accountId: string,
) {
  const storageKey = `${DASHBOARD_LAYOUT_KEY}:${accountId}`;
  const firstLayout = initialLayout ?? DEFAULT_DASHBOARD_LAYOUT;
  const [layout, setLayout] = useState<DashboardLayout>(() =>
    firstLayout.map((panel) => ({ ...panel })),
  );
  const layoutRef = useRef(layout);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    initialLayout ? "saved" : "idle",
  );
  const [showSaveStatus, setShowSaveStatus] = useState(false);
  const saveVersion = useRef(0);
  const saveQueue = useRef(Promise.resolve());

  const persist = useCallback((next: DashboardLayout) => {
    setShowSaveStatus(true);
    const version = ++saveVersion.current;
    setSaveStatus("saving");
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        const result = await savePerformancePanelLayoutAction(next);
        if (version === saveVersion.current) setSaveStatus(result.ok ? "saved" : "error");
      } catch {
        if (version === saveVersion.current) setSaveStatus("error");
      }
    });
  }, []);

  const applyLayout = useCallback(
    (next: DashboardLayout) => {
      layoutRef.current = next;
      setLayout(next);
      saveLocalLayout(storageKey, next);
      persist(next);
    },
    [persist, storageKey],
  );

  useEffect(() => {
    if (initialLayout) {
      saveLocalLayout(storageKey, initialLayout);
      return;
    }

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(storageKey);
        if (raw === null) {
          raw = localStorage.getItem(DASHBOARD_LAYOUT_KEY);
          if (raw !== null) {
            localStorage.setItem(storageKey, raw);
            localStorage.removeItem(DASHBOARD_LAYOUT_KEY);
          }
        }
      } catch {
        return;
      }
      if (raw !== null) applyLayout(parseDashboardLayout(raw));
    });
    return () => {
      active = false;
    };
  }, [initialLayout, applyLayout, storageKey]);

  useEffect(() => {
    function syncLocalLayout(event: StorageEvent) {
      if (event.key !== storageKey) return;
      const next = parseDashboardLayout(event.newValue);
      layoutRef.current = next;
      setLayout(next);
    }
    window.addEventListener("storage", syncLocalLayout);
    return () => window.removeEventListener("storage", syncLocalLayout);
  }, [storageKey]);

  const retrySave = useCallback(() => persist(layoutRef.current), [persist]);

  return {
    layout,
    saveStatus,
    showSaveStatus,
    retrySave,
    move(id: DashboardPanelId, toIndex: number) {
      const current = layoutRef.current;
      const next = reorderDashboardPanel(current, id, toIndex);
      if (next !== current) applyLayout(next);
    },
    resize(id: DashboardPanelId, columns: number, height: number) {
      const current = layoutRef.current;
      const next = resizeDashboardPanel(current, id, columns, height);
      if (next !== current) applyLayout(next);
    },
    reset() {
      applyLayout(DEFAULT_DASHBOARD_LAYOUT.map((panel) => ({ ...panel })));
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
  employeeRowCount,
  onMove,
  onResize,
  onDrop,
  renderPanel,
  afterPanel,
}: {
  layout: DashboardLayout;
  employeeRowCount: number;
  onMove: (id: DashboardPanelId, toIndex: number) => void;
  onResize: (id: DashboardPanelId, columns: number, height: number) => void;
  onDrop: (id: DashboardPanelId, target: DashboardPanelId) => void;
  renderPanel: (id: DashboardPanelId, controls: ReactNode) => ReactNode;
  afterPanel?: (id: DashboardPanelId) => ReactNode;
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
    <div className="pd-grid" id="performance-panels" data-testid="performance-panel-grid">
      {layout.map((panel) =>
        (() => {
          const height =
            panel.id === "employees"
              ? employeePanelDisplayHeight(panel.height, employeeRowCount)
              : panel.height;
          const following = afterPanel?.(panel.id);
          return (
            <Fragment key={panel.id}>
              <div
                className="pd-widget"
                data-panel-id={panel.id}
                data-testid={`panel-${panel.id}`}
                style={{ gridColumn: `span ${panel.columns}`, height }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const dragged = event.dataTransfer.getData("text/plain");
                  if (isDashboardPanelId(dragged)) onDrop(dragged, panel.id);
                }}
              >
                {renderPanel(panel.id, controls(panel.id))}
                <PanelResizeHandle
                  label={titles[panel.id]}
                  columns={panel.columns}
                  height={height}
                  onResize={(columns, heightDelta) =>
                    onResize(panel.id, columns, heightDelta + height - panel.height)
                  }
                />
              </div>
              {following && (
                <div
                  style={{ gridColumn: "1 / -1", minWidth: 0 }}
                  data-testid={`after-panel-${panel.id}`}
                >
                  {following}
                </div>
              )}
            </Fragment>
          );
        })(),
      )}
    </div>
  );
}
