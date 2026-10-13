"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  type CalMode, type CalSel, dayState, finalize, monthGrid, parseIso, pickDay, shiftMonth,
} from "./performance-calendar-utils";

const monthLabel = (y: number, m: number) =>
  new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m, 1)));
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));

export function PayrollDateFilter({
  start, end, today,
}: { start: string; end: string; today: string }) {
  const initial = parseIso(end);
  const latest = parseIso(today);
  const [mode, setMode] = useState<CalMode>(start === end ? "single" : "range");
  const [selection, setSelection] = useState<CalSel>({ start, end });
  const [view, setView] = useState({ y: initial.y, m: initial.m });
  const [hover, setHover] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState(end);
  const [error, setError] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);
  const out = finalize(selection);
  const pending = mode === "range" && selection.end === null;
  const cells = monthGrid(view.y, view.m);
  const tabDate = cells.includes(focusDate) ? focusDate : cells.find((day) => day && day <= today);

  const select = (day: string) => {
    setSelection(pickDay(mode, selection, day, today));
    setFocusDate(day);
    setError("");
  };
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, day: string) => {
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const delta = deltas[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + delta);
    const next = date.toISOString().slice(0, 10);
    if (next > today) return;
    setFocusDate(next);
    setView({ y: date.getUTCFullYear(), m: date.getUTCMonth() });
    requestAnimationFrame(() =>
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus());
  };

  return (
    <form className="card-body payroll-calendar-form" action="/payroll" method="get"
      aria-label="Employee pay dates" onSubmit={(event) => {
        if (pending) {
          event.preventDefault();
          setError("Select the end date for your range.");
        } else if ((Date.parse(out.end) - Date.parse(out.start)) / 86400000 > 366) {
          event.preventDefault();
          setError("Choose a range of at most 367 days.");
        }
      }}>
      <div className="payroll-calendar">
        <div className="filter-tabs" role="group" aria-label="Pay date selection">
          <button type="button" className={`filter-tab${mode === "single" ? " active" : ""}`}
            aria-pressed={mode === "single"} onClick={() => {
              setMode("single");
              setSelection({ start: selection.start, end: selection.start });
              setError("");
            }}>Single day</button>
          <button type="button" className={`filter-tab${mode === "range" ? " active" : ""}`}
            aria-pressed={mode === "range"} onClick={() => {
              setMode("range");
              setError("");
            }}>Date range</button>
        </div>
        <div className="payroll-calendar-nav">
          <button type="button" className="calendar-picker-button" aria-label="Previous month"
            onClick={() => setView(shiftMonth(view.y, view.m, -1))}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <strong aria-live="polite">{monthLabel(view.y, view.m)}</strong>
          <button type="button" className="calendar-picker-button" aria-label="Next month"
            disabled={view.y * 12 + view.m >= latest.y * 12 + latest.m}
            onClick={() => setView(shiftMonth(view.y, view.m, 1))}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        <div ref={gridRef} className="payroll-calendar-grid" role="group"
          aria-label={monthLabel(view.y, view.m)} onMouseLeave={() => setHover(null)}>
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) =>
            <span className="payroll-calendar-weekday" key={day} aria-hidden="true">{day}</span>)}
          {cells.map((day, index) => {
            if (!day) return <span key={`blank-${index}`} aria-hidden="true" />;
            const state = dayState(day, selection, pending ? hover : null);
            return (
              <button key={day} type="button" data-day={day} data-testid={`pay-day-${day}`}
                className={`payroll-calendar-day${state.inRange ? " in-range" : ""}${state.start || state.end ? " selected" : ""}`}
                disabled={day > today} tabIndex={day === tabDate ? 0 : -1}
                aria-label={dateLabel(day)} aria-pressed={state.start || state.end || state.inRange}
                onClick={() => select(day)} onMouseEnter={() => setHover(day)}
                onKeyDown={(event) => onKey(event, day)}>
                {parseIso(day).d}
              </button>
            );
          })}
        </div>
      </div>
      <div className="payroll-calendar-selection">
        <span className="muted">{mode === "single" ? "Selected day" : "Selected range"}</span>
        <strong aria-live="polite" data-testid="pay-date-selection">
          {dateLabel(out.start)}
          {pending ? " — Select end date" : out.start !== out.end ? ` — ${dateLabel(out.end)}` : ""}
        </strong>
        <input type="hidden" name="start" value={out.start} />
        <input type="hidden" name="end" value={out.end} />
        <div className="payroll-calendar-actions">
          <button className="button button-secondary" type="button" onClick={() => {
            setMode("single");
            setSelection({ start: today, end: today });
            setView({ y: latest.y, m: latest.m });
            setFocusDate(today);
            setError("");
          }}>Today</button>
          <button className="button button-primary" type="submit" disabled={pending}>Apply dates</button>
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </form>
  );
}
