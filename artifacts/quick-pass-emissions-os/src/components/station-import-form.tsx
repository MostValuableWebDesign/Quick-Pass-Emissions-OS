"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { importStationAction } from "@/app/station-actions";
import { Button } from "./ui/button";

/** Dedicated import form: shows elapsed seconds while the server parses the report. */
export function StationImportForm({ history }: { history: number[] }) {
  const [state, formAction, pending] = useActionState(importStationAction, {});
  const [seconds, setSeconds] = useState(0);
  const started = useRef(0);
  useEffect(() => {
    if (!pending) return;
    started.current = Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started.current) / 1000)), 500);
    return () => {
      clearInterval(t);
      setSeconds(0);
    };
  }, [pending]);
  const known = history.filter((n) => n > 0);
  const estimate = known.length
    ? `Earlier successful imports took ${(Math.min(...known) / 1000).toFixed(1)}–${(Math.max(...known) / 1000).toFixed(1)} s (${known.length} observed). Duration varies with report size; this is not a promise.`
    : "Expected duration unknown: no import duration has been observed yet.";
  return (
    <form action={formAction} className="form-grid">
      <label className="field">
        <span>Original portal report (.xls, HTML export, max 2 MB)</span>
        <input
          type="file"
          name="report"
          accept=".xls,application/vnd.ms-excel,text/html"
          required
        />
      </label>
      <label className="field">
        <span>Reason</span>
        <input
          name="reason"
          required
          maxLength={2000}
          placeholder="e.g. Weekly export, all pages"
        />
      </label>
      <p className="muted wide" style={{ fontSize: 12 }}>
        {estimate}
      </p>
      <div className="form-footer">
        <Button disabled={pending}>
          {pending ? `Importing… ${seconds}s elapsed` : "Import report"}
        </Button>
        {pending && (
          <p role="status" className="muted">
            Do not resubmit. Exact repeat rows are skipped automatically.
          </p>
        )}
        {!pending && state.message && (
          <p role="status" className={state.ok ? "success" : "error-text"}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
