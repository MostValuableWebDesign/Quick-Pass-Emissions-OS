"use client";

import { useState, useTransition } from "react";
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
        <input type="date" name="start" value={from} max={today} required
          onChange={(event) => {
            setFrom(event.target.value);
            if (to < event.target.value) setTo(event.target.value);
          }} />
      </label>
      {mode === "range" && <label className="field">
        <span>End date</span>
        <input type="date" name="end" value={to} min={from} max={today} required
          onChange={(event) => setTo(event.target.value)} />
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
