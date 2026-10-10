"use client";
import {
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type PointerEvent,
} from "react";
import { GripVertical, MoveDiagonal2, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";
import { movePanel, normalizeLayout, type PanelLayout } from "./performance-layout";

const fallback = new Map<string, string>();
const eventName = "quick-pass-performance-layout";
function subscribe(notify: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key) fallback.delete(event.key);
    else fallback.clear();
    notify();
  };
  window.addEventListener(eventName, notify);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(eventName, notify);
    window.removeEventListener("storage", storage);
  };
}
function read(key: string) {
  if (fallback.has(key)) return fallback.get(key)!;
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
type Panel = PanelLayout & { title: string; content: ReactNode };
export function PerformancePanels({ ownerId, panels }: { ownerId: string; panels: Panel[] }) {
  const key = `quick-pass:performance-layout:v1:${ownerId}`;
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => "",
  );
  const defaults = panels.map(({ id, span, height }) => ({ id, span, height }));
  const layout = normalizeLayout(raw, defaults);
  const grid = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: string; over: string } | null>(null);
  const gesture = useRef<{
    kind: "move" | "resize";
    id: string;
    x: number;
    y: number;
    span: number;
    height: number;
    over: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  function save(next: PanelLayout[]) {
    const value = JSON.stringify({ version: 1, panels: next });
    try {
      window.localStorage.setItem(key, value);
      fallback.delete(key);
    } catch {
      fallback.set(key, value);
      setNotice("Browser storage unavailable. Layout kept for this session.");
      window.dispatchEvent(new Event(eventName));
      return false;
    }
    window.dispatchEvent(new Event(eventName));
    return true;
  }
  function change(id: string, patch: Partial<Pick<PanelLayout, "span" | "height">>) {
    save(layout.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function start(
    event: PointerEvent<HTMLButtonElement>,
    panel: PanelLayout,
    kind: "move" | "resize",
  ) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      kind,
      id: panel.id,
      x: event.clientX,
      y: event.clientY,
      span: panel.span,
      height: event.currentTarget.closest("article")!.getBoundingClientRect().height,
      over: panel.id,
    };
    if (kind === "move") setDrag({ from: panel.id, over: panel.id });
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current) return;
    if (current.kind === "resize") {
      const width = grid.current!.getBoundingClientRect().width;
      const span =
        window.innerWidth <= 850
          ? current.span
          : Math.max(
              4,
              Math.min(12, current.span + Math.round((event.clientX - current.x) / (width / 12))),
            );
      change(current.id, {
        span,
        height: Math.max(
          240,
          Math.min(1000, Math.round(current.height + event.clientY - current.y)),
        ),
      });
    } else {
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-performance-panel]");
      if (target && grid.current?.contains(target)) {
        current.over = target.dataset.performancePanel!;
        setDrag({ from: current.id, over: current.over });
      }
      if (event.clientY < 60) window.scrollBy(0, -24);
      else if (event.clientY > window.innerHeight - 60) window.scrollBy(0, 24);
    }
  }
  function finish(cancel = false) {
    const current = gesture.current;
    if (!cancel && current?.kind === "move") {
      if (save(movePanel(layout, current.id, current.over)))
        setNotice("Panel moved. Layout saved in this browser.");
    }
    gesture.current = null;
    setDrag(null);
  }
  function step(panel: PanelLayout, delta: number) {
    const other = layout[layout.findIndex((p) => p.id === panel.id) + delta];
    if (other) {
      if (save(movePanel(layout, panel.id, other.id)))
        setNotice("Panel moved. Layout saved in this browser.");
    }
  }
  return (
    <>
      <div className="performance-layout-toolbar space-top">
        <p className="muted">
          Drag a grip to reorder. Drag a lower corner to resize. Arrow buttons and width controls
          also work with a keyboard. Saved per owner in this browser.
        </p>
        <button
          className="button button-outline"
          onClick={() => {
            if (save(defaults)) setNotice("Default panel layout restored.");
          }}
        >
          <RotateCcw size={15} /> Reset panels
        </button>
      </div>
      <p
        className={notice.startsWith("Browser storage unavailable") ? "notice warning" : "sr-only"}
        role="status"
        aria-live="polite"
      >
        {notice}
      </p>
      <div className="performance-grid" ref={grid}>
        {layout.map((position, index) => {
          const panel = panels.find((p) => p.id === position.id)!;
          return (
            <article
              key={panel.id}
              data-performance-panel={panel.id}
              aria-label={`${panel.title} panel`}
              className={`performance-panel${drag?.over === panel.id && drag.from !== panel.id ? " drop-target" : ""}${drag?.from === panel.id ? " moving" : ""}`}
              style={
                {
                  "--panel-span": position.span,
                  "--panel-height": position.height ? `${position.height}px` : "auto",
                } as CSSProperties
              }
            >
              <div className="performance-panel-controls">
                <button
                  className="panel-grip"
                  aria-label={`Drag ${panel.title} panel`}
                  title="Drag to move; Up/Down arrows also move this panel"
                  onPointerDown={(e) => start(e, position, "move")}
                  onPointerMove={move}
                  onPointerUp={() => finish()}
                  onPointerCancel={() => finish(true)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      step(position, e.key === "ArrowUp" ? -1 : 1);
                    }
                  }}
                >
                  <GripVertical size={18} />
                </button>
                <span className="panel-control-title">{panel.title}</span>
                <button
                  className="panel-tool"
                  aria-label={`Move ${panel.title} earlier`}
                  disabled={index === 0}
                  onClick={() => step(position, -1)}
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  className="panel-tool"
                  aria-label={`Move ${panel.title} later`}
                  disabled={index === layout.length - 1}
                  onClick={() => step(position, 1)}
                >
                  <ChevronDown size={16} />
                </button>
                <select
                  className="panel-width"
                  aria-label={`${panel.title} panel width`}
                  value={position.span}
                  onChange={(e) => change(panel.id, { span: Number(e.target.value) })}
                >
                  {Array.from({ length: 9 }, (_, i) => i + 4).map((n) => (
                    <option key={n} value={n}>
                      {n === 12 ? "Full" : n === 6 ? "Half" : `${n}/12`} width
                    </option>
                  ))}
                </select>
                <button
                  className="panel-tool auto-height"
                  onClick={() => change(panel.id, { height: 0 })}
                  aria-label={`Auto height for ${panel.title}`}
                >
                  Auto height
                </button>
              </div>
              <div className="performance-panel-body">{panel.content}</div>
              <button
                className="panel-resize"
                aria-label={`Resize ${panel.title} panel`}
                title="Drag to resize; arrow keys adjust width and height"
                onPointerDown={(e) => start(e, position, "resize")}
                onPointerMove={move}
                onPointerUp={() => finish()}
                onPointerCancel={() => finish(true)}
                onKeyDown={(e) => {
                  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
                  e.preventDefault();
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight")
                    change(panel.id, {
                      span: Math.max(
                        4,
                        Math.min(12, position.span + (e.key === "ArrowLeft" ? -1 : 1)),
                      ),
                    });
                  else
                    change(panel.id, {
                      height: Math.max(
                        240,
                        Math.min(1000, (position.height || 420) + (e.key === "ArrowUp" ? -40 : 40)),
                      ),
                    });
                }}
              >
                <MoveDiagonal2 size={16} />
              </button>
            </article>
          );
        })}
      </div>
    </>
  );
}
