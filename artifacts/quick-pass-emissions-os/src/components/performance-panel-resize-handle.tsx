"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";

export function PanelResizeHandle({
  label,
  columns,
  height,
  onResize,
}: {
  label: string;
  columns: number;
  height: number;
  onResize: (columnsDelta: number, heightDelta: number) => void;
}) {
  const origin = useRef<{
    pointer: number;
    axis: "width" | "height";
    x: number;
    y: number;
    columns: number;
    height: number;
    lastColumns: number;
    lastHeight: number;
    columnWidth: number;
  } | null>(null);

  function begin(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const grid = event.currentTarget.closest(".pd-grid");
    if (!(grid instanceof HTMLElement)) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
    origin.current = {
      pointer: event.pointerId,
      axis: event.currentTarget.dataset.axis === "width" ? "width" : "height",
      x: event.clientX,
      y: event.clientY,
      columns,
      height,
      lastColumns: columns,
      lastHeight: height,
      columnWidth: (grid.clientWidth + gap) / 12,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const start = origin.current;
    if (!start || start.pointer !== event.pointerId) return;
    if (start.axis === "width") {
      if (window.matchMedia("(max-width: 480px)").matches) return;
      const nextColumns = Math.max(
        4,
        Math.min(12, start.columns + Math.round((event.clientX - start.x) / start.columnWidth)),
      );
      const dx = nextColumns - start.lastColumns;
      if (dx) onResize(dx, 0);
      start.lastColumns = nextColumns;
      return;
    }
    const nextHeight = Math.max(
      240,
      Math.min(720, start.height + Math.round((event.clientY - start.y) / 40) * 40),
    );
    const dy = nextHeight - start.lastHeight;
    if (dy) onResize(0, dy);
    start.lastHeight = nextHeight;
  }

  function finish() {
    origin.current = null;
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    axis: "width" | "height",
  ) {
    if (axis === "width") {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      if (window.matchMedia("(max-width: 480px)").matches) return;
      onResize(event.key === "ArrowLeft" ? -1 : 1, 0);
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    onResize(0, event.key === "ArrowUp" ? -40 : 40);
  }

  return (
    <>
      <button
        type="button"
        className="pd-panel-edge-handle pd-panel-edge-width"
        data-axis="width"
        aria-label={`Resize ${label} panel width`}
        aria-orientation="vertical"
        title="Drag horizontally to resize width; use left and right arrow keys"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onKeyDown={(event) => handleKeyDown(event, "width")}
      >
        <span aria-hidden="true" />
      </button>
      <button
        type="button"
        className="pd-panel-edge-handle pd-panel-edge-height"
        data-axis="height"
        aria-label={`Resize ${label} panel height`}
        aria-orientation="horizontal"
        title="Drag vertically to resize height; use up and down arrow keys"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onKeyDown={(event) => handleKeyDown(event, "height")}
      >
        <span aria-hidden="true" />
      </button>
    </>
  );
}
