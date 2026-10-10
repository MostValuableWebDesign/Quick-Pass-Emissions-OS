"use client";

import { useRef, type PointerEvent } from "react";

export function PanelResizeHandle({
  label, columns, height, onResize,
}: {
  label: string;
  columns: number;
  height: number;
  onResize: (columnsDelta: number, heightDelta: number) => void;
}) {
  const origin = useRef<{
    pointer: number; x: number; y: number; columns: number; height: number;
    lastColumns: number; lastHeight: number; columnWidth: number;
  } | null>(null);

  function begin(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const grid = event.currentTarget.closest(".pd-grid");
    if (!(grid instanceof HTMLElement)) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
    origin.current = {
      pointer: event.pointerId, x: event.clientX, y: event.clientY,
      columns, height, lastColumns: columns, lastHeight: height,
      columnWidth: (grid.clientWidth + gap) / 12,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const start = origin.current;
    if (!start || start.pointer !== event.pointerId) return;
    const narrow = window.matchMedia("(max-width: 760px)").matches;
    const nextColumns = narrow ? start.columns : Math.max(4, Math.min(12,
      start.columns + Math.round((event.clientX - start.x) / start.columnWidth)));
    const nextHeight = Math.max(240, Math.min(720,
      start.height + Math.round((event.clientY - start.y) / 40) * 40));
    const dx = nextColumns - start.lastColumns;
    const dy = nextHeight - start.lastHeight;
    if (dx || dy) onResize(dx, dy);
    start.lastColumns = nextColumns;
    start.lastHeight = nextHeight;
  }

  return (
    <button
      type="button"
      className="pd-panel-resize-handle"
      aria-label={`Resize ${label} panel. Drag the corner or use arrow keys.`}
      title="Drag corner to resize"
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={() => { origin.current = null; }}
      onPointerCancel={() => { origin.current = null; }}
      onLostPointerCapture={() => { origin.current = null; }}
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
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M5 17 17 5M10 17l7-7M15 17l2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}
