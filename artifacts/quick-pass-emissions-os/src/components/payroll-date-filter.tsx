"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function PayrollDateFilter({
  start, end, today,
}: { start: string; end: string; today: string }) {
  const router = useRouter();
  const [mode, setMode] = useState(start === end ? "day" : "range");
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  const [loading, startTransition] = useTransition();
  const [error, setError] = useState("");
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const openCalendar = (input: HTMLInputElement | null) => {
    if (!input) return;
    input.focus();
    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
        return;
      }
    } catch {
      // Fall back to the browser's normal date input interaction.
    }
    input.click();
  };
  const show = (first: string, last: string) => {
    if (Math.round((Date.parse(last) - Date.parse(first)) / 86400000) > 366) {
      setError("Choose a range of at most 367 days.");
      return;
    }
    setError("");
    startTransition(() => router.push(`/payroll?${new URLSearchParams({ start: first, end: last })}`));
  };
  return (
    <form className="card-body payroll-date-filter" onSubmit={(event) => {
      event.preventDefault();
      show(from, mode === "day" ? from : to);
    }}>
      <div className="filter-tabs" role="group" aria-label="Pay date selection">
        <button type="button" className={mode === "day" ? "filter-tab active" : "filter-tab"}
          aria-pressed={mode === "day"} onClick={() => setMode("day")}>Single day</button>
        <button type="button" className={mode === "range" ? "filter-tab active" : "filter-tab"}
          aria-pressed={mode === "range"} onClick={() => { setMode("range"); if (to < from) setTo(from); }}>Date range</button>
      </div>
      <label className="field">
        <span>{mode === "day" ? "Date" : "Start date"}</span>
        <div className="payroll-date-control">
          <input ref={startRef} type="date" name="start" aria-label={mode === "day" ? "Date" : "Start date"}
            value={from} max={today} required
            onChange={(event) => {
              setFrom(event.target.value);
              if (to < event.target.value) setTo(event.target.value);
            }} />
          <button type="button" className="calendar-picker-button"
            aria-label={`Open calendar for ${mode === "day" ? "date" : "start date"}`}
            title="Open calendar" onClick={() => openCalendar(startRef.current)}>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
              <rect x="2.5" y="4" width="15" height="13" rx="2" />
              <path d="M6 2.5v3M14 2.5v3M3 8h14M6 11h2m2 0h2m-6 3h2" />
            </svg>
          </button>
        </div>
      </label>
      {mode === "range" && <label className="field">
        <span>End date</span>
        <div className="payroll-date-control">
          <input ref={endRef} type="date" name="end" aria-label="End date"
            value={to} min={from} max={today} required
            onChange={(event) => setTo(event.target.value)} />
          <button type="button" className="calendar-picker-button"
            aria-label="Open calendar for end date" title="Open calendar"
            onClick={() => openCalendar(endRef.current)}>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
              <rect x="2.5" y="4" width="15" height="13" rx="2" />
              <path d="M6 2.5v3M14 2.5v3M3 8h14M6 11h2m2 0h2m-6 3h2" />
            </svg>
          </button>
        </div>
      </label>}
      <button className="button button-secondary" type="button" disabled={loading}
        onClick={() => show(today, today)}>Today</button>
      <button className="button button-primary" type="submit" disabled={loading}>
        {loading ? "Loading…" : "Apply"}
      </button>
      {error && <p className="error-text" role="alert">{error}</p>}
    </form>
  );
}
