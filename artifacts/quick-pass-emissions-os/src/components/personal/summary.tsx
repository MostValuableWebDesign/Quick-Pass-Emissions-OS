"use client";

import { useState } from "react";
import type { PersonalSummaryView, PersonalWorkspaceData } from "@/modules/personal/types";
import { type Priority, type Status, fmtDate, fmtStamp, PRI_LABEL, STATUS_LABEL } from "./shared";

export function addDays(d: string, n: number) {
  const [y, m, dd] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd + n));
  return t.toISOString().slice(0, 10);
}

export function SummaryControls({
  data,
  busy,
  mutate,
  onGenerated,
}: {
  data: PersonalWorkspaceData;
  busy: boolean;
  mutate: (b: Record<string, unknown>, ok?: string) => Promise<PersonalWorkspaceData | null>;
  onGenerated: (next: PersonalWorkspaceData, s: string, e: string) => void;
}) {
  const [start, setStart] = useState(addDays(data.today, -13));
  const [end, setEnd] = useState(data.today);
  const [first, setFirst] = useState(data.schedule?.firstDate ?? data.today);
  const [enabled, setEnabled] = useState(data.schedule?.enabled ?? false);
  const invalid = !start || !end || start > end;
  const sched = data.schedule;
  const schedDirty = !sched || sched.firstDate !== first || sched.enabled !== enabled;

  return (
    <div className="pw-sum-controls">
      <form
        className="pw-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          if (invalid) return;
          const next = await mutate(
            { op: "summary.generate", startDate: start, endDate: end },
            "Summary saved.",
          );
          if (next) onGenerated(next, start, end);
        }}
      >
        <p className="pw-panel-title">Generate a summary</p>
        <div className="pw-range">
          <label>
            <span>From</span>
            <input
              type="date"
              value={start}
              max={end}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
          </label>
        </div>
        {invalid && <p className="pw-error-text">Start date must be on or before the end date.</p>}
        <button
          type="submit"
          className="pw-btn pw-btn-sm pw-btn-primary"
          disabled={busy || invalid}
        >
          Generate
        </button>
        <p className="pw-hint">Dates use America/New_York. Built only from recorded tasks.</p>
        <p className="pw-hint">
          Generating the same dates refreshes that saved summary without adding a duplicate.
        </p>
      </form>

      <form
        className="pw-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          await mutate({ op: "schedule.save", firstDate: first, enabled }, "Schedule saved.");
        }}
      >
        <p className="pw-panel-title">Every 14 days</p>
        <label className="pw-inline">
          <span>First period starts</span>
          <input type="date" value={first} onChange={(e) => setFirst(e.target.value)} required />
        </label>
        <label className="pw-switch">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Generate automatically</span>
        </label>
        <button
          type="submit"
          className="pw-btn pw-btn-sm pw-btn-quiet"
          disabled={busy || !first || !schedDirty}
        >
          Save schedule
        </button>
        <div
          className={`pw-runner ${sched?.enabled && data.runner.healthy ? "is-ok" : "is-warn"}`}
          role="status"
        >
          {!sched ? (
            <span>No schedule saved yet. Manual generation works anytime.</span>
          ) : !sched.enabled ? (
            <span>
              Automatic summaries are off. Next period would start {fmtDate(sched.nextDate)}.
            </span>
          ) : data.runner.healthy ? (
            <span>
              Scheduler checked in {fmtStamp(data.runner.lastRunAt)}. Next summary due{" "}
              {fmtDate(addDays(sched.nextDate, 14))}. This shows recent activity, not a guarantee.
            </span>
          ) : (
            <span>
              <strong>Automatic generation is inactive.</strong> It is waiting for the independent
              jobs runner
              {data.runner.lastRunAt
                ? ` (last seen ${fmtStamp(data.runner.lastRunAt)})`
                : ", which has not run yet"}
              . Manual generation still works.
            </span>
          )}
          {sched?.lastRunAt && <small>Last schedule check: {fmtStamp(sched.lastRunAt)}</small>}
        </div>
      </form>
    </div>
  );
}

export function SummaryDoc({
  summary,
  notify,
}: {
  summary: PersonalSummaryView;
  notify: (t: "ok" | "err", s: string) => void;
}) {
  const s = summary.snapshot;
  const reopenedIds = new Set(s.reopened.map((r) => r.id));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(s.text);
      notify("ok", "Summary copied.");
    } catch {
      notify("err", "Copy was blocked by the browser. Select the text and copy manually.");
    }
  };
  const print = () => {
    document.body.classList.add("pw-printing");
    const done = () => {
      document.body.classList.remove("pw-printing");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };
  return (
    <article className="pw-editor">
      <div className="pw-toolbar">
        <span className="pw-stamp">Saved {fmtStamp(summary.createdAt)}</span>
        <div className="pw-toolbar-actions">
          <button type="button" className="pw-btn pw-btn-sm pw-btn-quiet" onClick={copy}>
            Copy text
          </button>
          <button type="button" className="pw-btn pw-btn-sm pw-btn-primary" onClick={print}>
            Print / PDF
          </button>
        </div>
      </div>
      <div className="pw-paper pw-summary-doc">
        <p className="pw-kicker">Personal summary · Quick Pass</p>
        <h2 className="pw-doc-title">
          {fmtDate(summary.startDate)} – {fmtDate(summary.endDate)}
        </h2>
        <p className="pw-doc-text">
          {s.completed.length} unique task{s.completed.length === 1 ? "" : "s"} completed.{" "}
          {s.unfinished.length} unfinished as of {fmtDate(summary.endDate)}.
        </p>

        <h3 className="pw-doc-h">
          Completed <span>{s.completed.length}</span>
        </h3>
        {s.completed.length ? (
          <ul className="pw-doc-list">
            {s.completed.map((c) => (
              <li key={c.id}>
                <div>
                  <strong>{c.title}</strong>
                  {(c.reopened || reopenedIds.has(c.id)) && (
                    <span className="pw-tag pw-tag-warn">Reopened</span>
                  )}
                </div>
                <small>{fmtDate(c.completedDate)}</small>
                {c.completionNote && <p>{c.completionNote}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pw-hint">No tasks were recorded as completed in this period.</p>
        )}

        <h3 className="pw-doc-h">
          Unfinished priorities <span>{s.unfinished.length}</span>
        </h3>
        {s.unfinished.length ? (
          <ul className="pw-doc-list">
            {s.unfinished.map((u) => (
              <li key={u.id}>
                <div>
                  <strong>{u.title}</strong>
                  <span className={`pw-pri pw-pri-${u.priority.toLowerCase()}`}>
                    {PRI_LABEL[u.priority as Priority] ?? u.priority}
                  </span>
                </div>
                <small>
                  {STATUS_LABEL[u.status as Status] ?? u.status}
                  {u.dueDate ? ` · due ${fmtDate(u.dueDate)}` : ""}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pw-hint">No open priorities at the time of this summary.</p>
        )}

        {s.reopened.length > 0 && (
          <>
            <h3 className="pw-doc-h">
              Reopened <span>{s.reopened.length}</span>
            </h3>
            <ul className="pw-doc-list">
              {s.reopened.map((r) => (
                <li key={`${r.id}-${r.reopenedDate}`}>
                  <div>
                    <strong>{r.title}</strong>
                  </div>
                  <small>Reopened {fmtDate(r.reopenedDate)}</small>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="pw-doc-foot">
          Generated from recorded tasks only. No hours or estimates included.
        </p>
      </div>
    </article>
  );
}
