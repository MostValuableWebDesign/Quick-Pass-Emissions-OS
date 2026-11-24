"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SpendingSnapshot } from "@/modules/personal/expense-types";
import {
  csvUrl,
  errText,
  fetchReport,
  fmtDay,
  missingLabel,
  money,
  monthRange,
  yearRange,
} from "./expenses-api";

type Preset = "month" | "year" | "custom";

export function ExpenseReports({ today, onOpen }: { today: string; onOpen: (id: string) => void }) {
  const [preset, setPreset] = useState<Preset>("month");
  const [range, setRange] = useState(monthRange(today));
  const [report, setReport] = useState<SpendingSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const invalid = !range.start || !range.end || range.start > range.end;

  const load = useCallback(async (s: string, e: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const next = await fetchReport(s, e);
      if (id === requestId.current) setReport(next);
    } catch (err) {
      if (id === requestId.current) setError(errText(err, "Report failed."));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  const firstRef = useRef(range);
  useEffect(() => {
    const t = setTimeout(() => void load(firstRef.current.start, firstRef.current.end), 0);
    return () => clearTimeout(t);
  }, [load]);

  const choose = (p: Preset) => {
    setPreset(p);
    if (p === "custom") return;
    const r = p === "month" ? monthRange(today) : yearRange(today);
    setRange(r);
    void load(r.start, r.end);
  };

  return (
    <div className="ex-report">
      <form
        className="pw-panel ex-report-ctl"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) void load(range.start, range.end);
        }}
      >
        <fieldset className="pw-seg">
          <legend>Period</legend>
          {(["month", "year", "custom"] as const).map((p) => (
            <button
              type="button"
              key={p}
              className={preset === p ? "is-on" : ""}
              aria-pressed={preset === p}
              onClick={() => choose(p)}
              data-testid={`seg-period-${p}`}
            >
              {p === "month" ? "This month" : p === "year" ? "This year" : "Custom"}
            </button>
          ))}
        </fieldset>
        <div className="pw-range">
          <label>
            <span>From</span>
            <input
              type="date"
              value={range.start}
              onChange={(e) => {
                setPreset("custom");
                setRange((r) => ({ ...r, start: e.target.value }));
              }}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={range.end}
              onChange={(e) => {
                setPreset("custom");
                setRange((r) => ({ ...r, end: e.target.value }));
              }}
            />
          </label>
        </div>
        {invalid && <p className="pw-error-text">Start must be on or before the end date.</p>}
        <div className="ex-form-foot">
          <button
            type="submit"
            className="pw-btn pw-btn-sm pw-btn-primary"
            disabled={invalid || loading}
            data-testid="button-run-report"
          >
            Run report
          </button>
          {invalid ? null : (
            <a
              className="pw-btn pw-btn-sm pw-btn-quiet"
              href={csvUrl(range.start, range.end)}
              download
              data-testid="link-csv"
            >
              Download CSV
            </a>
          )}
        </div>
        <p className="pw-hint">
          Spending counts payments and refunds by their own dates; planned items by expense date.
          Reimbursements are shown separately, never as extra spending.
        </p>
      </form>

      {error ? (
        <div className="pw-save-alert" role="alert">
          <div>
            <strong>Report did not load</strong>
            <span>{error}</span>
          </div>
          <button
            type="button"
            className="pw-btn pw-btn-sm pw-btn-primary"
            onClick={() => void load(range.start, range.end)}
          >
            Retry
          </button>
        </div>
      ) : loading && !report ? (
        <div className="ex-skel" aria-busy="true">
          <span />
          <span />
          <span />
        </div>
      ) : report ? (
        <SpendingView report={report} onOpen={onOpen} dim={loading} />
      ) : null}
    </div>
  );
}

export function SpendingFigures({ s }: { s: Omit<SpendingSnapshot, "rows"> & { rows?: unknown } }) {
  return (
    <dl className="ex-tape ex-tape-report">
      <div>
        <dt>Net spending</dt>
        <dd>{money(s.spentCents)}</dd>
        <small>
          {money(s.paidCents)} paid − {money(s.refundedCents)} refunded
        </small>
      </div>
      <div>
        <dt>Planned</dt>
        <dd>{money(s.plannedCents)}</dd>
        {s.plannedUnknownCount > 0 && <small>+ {s.plannedUnknownCount} without a total</small>}
      </div>
      <div>
        <dt>Still owed at period end</dt>
        <dd>{money(s.balanceCents)}</dd>
        {s.unknownBalanceCount > 0 && <small>+ {s.unknownBalanceCount} unknown</small>}
      </div>
      <div>
        <dt>Reimbursements (net)</dt>
        <dd>{money(s.reimbursedCents)}</dd>
        <small>Not counted as spending</small>
      </div>
    </dl>
  );
}

export function CategoryTable({ s }: { s: Pick<SpendingSnapshot, "categories"> }) {
  if (!s.categories.length) return <p className="pw-hint">No category activity in this period.</p>;
  return (
    <div className="ex-table-wrap">
      <table className="ex-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Planned</th>
            <th>Paid</th>
            <th>Refunded</th>
            <th>Net</th>
            <th>Reimbursed</th>
          </tr>
        </thead>
        <tbody>
          {s.categories.map((c) => (
            <tr key={c.category || "none"}>
              <td>{c.category || <em>Uncategorized</em>}</td>
              <td>{money(c.plannedCents)}</td>
              <td>{money(c.paidCents)}</td>
              <td>{money(c.refundedCents)}</td>
              <td>
                <b>{money(c.spentCents)}</b>
              </td>
              <td>{money(c.reimbursedCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpendingView({
  report,
  onOpen,
  dim,
}: {
  report: SpendingSnapshot;
  onOpen: (id: string) => void;
  dim: boolean;
}) {
  return (
    <div className={`ex-report-body ${dim ? "is-dim" : ""}`}>
      <p className="pw-kicker">
        {fmtDay(report.startDate)} – {fmtDay(report.endDate)}
      </p>
      <SpendingFigures s={report} />
      <h3 className="pw-doc-h">
        By category <span>{report.categories.length}</span>
      </h3>
      <CategoryTable s={report} />
      <h3 className="pw-doc-h">
        Expenses <span>{report.rows.length}</span>
      </h3>
      {report.rows.length ? (
        <div className="ex-table-wrap">
          <table className="ex-table">
            <thead>
              <tr>
                <th>Expense</th>
                <th>Date</th>
                <th>Total</th>
                <th>Net</th>
                <th>Left</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button type="button" className="pw-link" onClick={() => onOpen(r.id)}>
                      {r.title}
                    </button>
                    <small>
                      {[r.vendor, r.category, r.planned ? "planned" : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                    {r.missing.length > 0 && (
                      <small className="ex-missing">
                        Missing {r.missing.map(missingLabel).join(", ")}
                      </small>
                    )}
                  </td>
                  <td>{r.date ? fmtDay(r.date) : "—"}</td>
                  <td>{money(r.amountCents)}</td>
                  <td>
                    <b>{money(r.spentCents)}</b>
                  </td>
                  <td>{r.balanceCents == null ? "Unknown" : money(r.balanceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="pw-hint">Nothing recorded or planned in this period.</p>
      )}
    </div>
  );
}
