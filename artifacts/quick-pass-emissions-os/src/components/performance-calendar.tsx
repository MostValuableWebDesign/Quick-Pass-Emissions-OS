"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  type CalMode,
  type CalSel,
  dayState,
  finalize,
  modeForDates,
  monthGrid,
  parseIso,
  pickDay,
  selectStartDate,
  shouldAutoSearchSingleDay,
  shiftMonth,
} from "./performance-calendar-utils";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

type Props = {
  start: string;
  end: string;
  today: string;
  employee?: string | null;
  trendDays: 7 | 30 | 365;
};

export function PerformanceCalendar({ start, end, today, employee, trendDays }: Props) {
  const [mode, setMode] = useState<CalMode>(modeForDates(start, end));
  const [sel, setSel] = useState<CalSel>({ start, end });
  const [hover, setHover] = useState<string | null>(null);
  const init = parseIso(end || today);
  const [view, setView] = useState({ y: init.y, m: init.m });
  const formRef = useRef<HTMLFormElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [focusDay, setFocusDay] = useState<string>(end || today);

  const t = parseIso(today);
  const atMax = view.y * 12 + view.m >= t.y * 12 + t.m;
  const cells = monthGrid(view.y, view.m);
  const out = finalize(sel);
  const pending = mode === "range" && sel.end === null;
  const tabDay = cells.includes(focusDay) ? focusDay : (cells.find((c) => c && c <= today) ?? null);

  const click = (day: string) => {
    const next = pickDay(mode, sel, day, today);
    setSel(next);
    setFocusDay(day);
    if (shouldAutoSearchSingleDay(mode, next)) submit(next);
  };

  const submit = (selection: CalSel) => {
    // Submit the new selection, not the previous render's controlled values.
    const form = formRef.current;
    if (!form) return;
    const values = finalize(selection);
    (form.elements.namedItem("start") as HTMLInputElement).value = values.start;
    (form.elements.namedItem("end") as HTMLInputElement).value = values.end;
    form.requestSubmit();
  };

  const onKey = (e: React.KeyboardEvent, day: string) => {
    const deltas: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const d = deltas[e.key];
    if (d === undefined) return;
    e.preventDefault();
    const p = parseIso(day);
    const n = new Date(Date.UTC(p.y, p.m, p.d + d));
    const nIso = n.toISOString().slice(0, 10);
    if (nIso > today) return;
    setFocusDay(nIso);
    setView({ y: n.getUTCFullYear(), m: n.getUTCMonth() });
    requestAnimationFrame(() =>
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${nIso}"]`)?.focus(),
    );
  };

  const switchMode = (m: CalMode) => {
    setMode(m);
    if (m === "single") setSel({ start: sel.start, end: sel.start });
  };

  const label = (s: string) => {
    const p = parseIso(s);
    return `${MONTHS[p.m].slice(0, 3)} ${p.d}, ${p.y}`;
  };

  return (
    <form
      ref={formRef}
      method="get"
      action="/performance"
      id="performance-query"
      className="pd-cal-form"
      aria-label="Reporting dates"
    >
      <div className="pd-cal" data-testid="calendar">
        <div className="pd-cal-top">
          <div className="pd-seg" role="group" aria-label="Selection mode">
            <button
              type="button"
              aria-pressed={mode === "single"}
              onClick={() => switchMode("single")}
              data-testid="button-mode-single"
            >
              Single day
            </button>
            <button
              type="button"
              aria-pressed={mode === "range"}
              onClick={() => switchMode("range")}
              data-testid="button-mode-range"
            >
              Date range
            </button>
          </div>
          <div className="pd-cal-nav">
            <button
              type="button"
              className="pd-cal-arrow"
              aria-label="Previous month"
              onClick={() => setView(shiftMonth(view.y, view.m, -1))}
              data-testid="button-cal-prev"
            >
              <ChevronLeft size={16} />
            </button>
            <strong aria-live="polite" data-testid="text-cal-month">
              {MONTHS[view.m]} {view.y}
            </strong>
            <button
              type="button"
              className="pd-cal-arrow"
              aria-label="Next month"
              disabled={atMax}
              onClick={() => setView(shiftMonth(view.y, view.m, 1))}
              data-testid="button-cal-next"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div
          className="pd-cal-grid"
          role="group"
          aria-label={`${MONTHS[view.m]} ${view.y}`}
          ref={gridRef}
          onMouseLeave={() => setHover(null)}
        >
          {DOW.map((d) => (
            <span key={d} className="pd-cal-dow" aria-hidden>
              {d}
            </span>
          ))}
          {cells.map((day, i) => {
            if (!day) return <span key={`e${i}`} className="pd-cal-empty" aria-hidden />;
            const st = dayState(day, sel, pending ? hover : null);
            const future = day > today;
            const cls = [
              "pd-cal-day",
              st.inRange && "in",
              st.start && "s",
              st.end && "e",
              (st.start || st.end) && "sel",
              day === today && "today",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={day}
                type="button"
                className={cls}
                data-day={day}
                disabled={future}
                tabIndex={day === tabDay ? 0 : -1}
                aria-pressed={st.start || st.end || st.inRange}
                aria-label={`${label(day)}${day === today ? ", today" : ""}${st.start ? ", selected start" : ""}${st.end && !st.start ? ", selected end" : ""}`}
                onClick={() => click(day)}
                onMouseEnter={() => setHover(day)}
                onKeyDown={(e) => onKey(e, day)}
                data-testid={`button-day-${day}`}
              >
                <span>{parseIso(day).d}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pd-cal-side">
        <div className="pd-cal-scope-title">
          {mode === "single" ? "Selected date" : "Report scope"}
        </div>
        {mode === "single" ? (
          <div className="pd-cal-sum" data-testid="text-cal-selection">
            <span className="lab">Date</span>
            <strong className="pd-num">{label(out.start)}</strong>
          </div>
        ) : (
          pending && (
            <small className="pd-cal-range-hint">Select an end date, or Apply for one day.</small>
          )
        )}
        <input type="hidden" name="employee" value={employee ?? ""} />
        <input type="hidden" name="trendDays" value={trendDays} />
        {mode === "single" ? (
          <>
            <input type="hidden" name="start" value={out.start} data-testid="input-start" />
            <input type="hidden" name="end" value={out.end} data-testid="input-end" />
          </>
        ) : (
          <>
            <label className="field">
              <span>From</span>
              <input
                type="date"
                name="start"
                value={out.start}
                max={today}
                required
                data-testid="input-start"
                onChange={(e) => {
                  const next = selectStartDate(mode, sel, e.target.value);
                  setSel(next);
                  if (shouldAutoSearchSingleDay(mode, next)) submit(next);
                }}
              />
            </label>
            <label className="field">
              <span>Through</span>
              <input
                type="date"
                name="end"
                value={out.end}
                min={out.start}
                max={today}
                required
                data-testid="input-end"
                onChange={(e) => {
                  setSel({ ...sel, end: e.target.value });
                }}
              />
            </label>
            <div className="pd-cal-acts">
              <button className="button button-primary button-sm" data-testid="button-apply-range">
                Apply dates
              </button>
            </div>
          </>
        )}
      </div>
    </form>
  );
}
