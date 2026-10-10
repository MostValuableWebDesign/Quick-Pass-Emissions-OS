"use client";

import "./performance-dashboard.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "./mock-actions";
import { useRouter } from "./mock-actions";
import { RefreshCw, SlidersHorizontal } from "lucide-react";
import type { DashboardData, DashboardState } from "./dashboard-types";
import { getPerformanceDashboardAction } from "./mock-actions";
import { PerformanceTrend } from "./performance-dashboard-trend";
import { EmployeeTable } from "./performance-dashboard-employees";
import { PayPlanDialog } from "./performance-dashboard-pay";
import { instant, longDate, num, usd } from "./performance-dashboard-format";

export function PerformanceDashboard({ initial }: { initial: DashboardData }) {
  const router = useRouter();
  const [data, setData] = useState<DashboardData>(initial);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);
  const { start, end, trendDays, employee } = initial.query;
  const q = useMemo(() => ({ start, end, trendDays, employee }), [start, end, trendDays, employee]);

  const load = useCallback(async (refresh: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const res: DashboardState = await getPerformanceDashboardAction(q, refresh);
      if (res.data) setData(res.data);
      setMessage(res.ok === false || !res.data ? (res.message ?? "Could not reach the station portal.") : null);
    } catch {
      setMessage("Could not reach the station portal. Showing last saved numbers.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => { if (mounted) void load(false); });
    return () => { mounted = false; };
  }, [load]);

  const s = data.summary;
  const c = data.current;
  const single = q.start === q.end;
  const partial = s.coveredDays < s.expectedDays;
  const filtered = !!q.employee;
  const empName = data.employeeOptions.find((e) => e.id === q.employee)?.name;
  const tested = c ? c.passed + c.failed : 0;
  const pct = (n: number) => (c && c.total ? `${(n / c.total) * 100}%` : "0%");

  return (
    <div className="pd" aria-busy={loading}>
      <header className="pd-head">
        <div>
          <div className="eyebrow">OWNER · STATION</div>
          <h1>Performance</h1>
          <div className="pd-sub">
            <span>{single ? longDate(q.start) : `${longDate(q.start)} to ${longDate(q.end)}`}</span>
            {empName && <span className="pd-chip ok">{empName}</span>}
            {loading ? (
              <span className="pd-chip" role="status"><span className="pd-dot live" />Updating</span>
            ) : (
              <span className="pd-chip">Synced {instant(data.syncedAt)}</span>
            )}
            {partial && (
              <span className="pd-chip warn" title={data.missingDates.join(", ")}>
                Partial: {s.coveredDays}/{s.expectedDays} days
              </span>
            )}
            {data.staleDates.length > 0 && <span className="pd-chip warn">{data.staleDates.length} stale</span>}
          </div>
        </div>
        <div className="pd-actions">
          <button type="button" className="button button-outline" onClick={() => load(true)} disabled={loading} data-testid="button-refresh">
            <RefreshCw size={15} /> {loading ? "Refreshing" : "Refresh"}
          </button>
          <PayPlanDialog
            key={JSON.stringify(data.payPlan)}
            plan={data.payPlan}
            inspectors={data.inspectors}
            query={q}
            today={data.today}
            onSaved={(r) => {
              if (!r.data) return;
              if (r.data.query.employee !== q.employee) {
                const params = new URLSearchParams({ start: q.start, end: q.end, trendDays: String(q.trendDays) });
                if (r.data.query.employee) params.set("employee", r.data.query.employee);
                router.replace(`/performance?${params}`);
              } else setData(r.data);
            }}
          />
          <Link className="button button-outline" href="/performance/settings" data-testid="link-setup">
            <SlidersHorizontal size={15} /> Records
          </Link>
        </div>
      </header>

      {(message || data.error) && (
        <div className="notice warning" role="alert" style={{ margin: 0 }}>
          {message ?? data.error}
        </div>
      )}

      <section className="pd-hero" aria-label="Headline numbers">
        <div className="pd-today">
          <div className="lab">TODAY · STATION</div>
          <strong className="pd-num" data-testid="text-today-total">{c ? c.total : "--"}</strong>
          {c ? (
            <>
              <div className="pd-split" aria-hidden>
                <span style={{ width: pct(c.passed), background: "#47c99d" }} />
                <span style={{ width: pct(c.failed), background: "#e5a24d" }} />
                <span style={{ width: pct(c.aborted + c.other), background: "#6f8b94" }} />
              </div>
              <div className="pd-legend pd-num">
                <span><i style={{ background: "#47c99d" }} />Pass {c.passed}</span>
                <span><i style={{ background: "#e5a24d" }} />Fail {c.failed}</span>
                <span><i style={{ background: "#6f8b94" }} />Abort {c.aborted}</span>
                {c.other > 0 && <span><i style={{ background: "#6f8b94" }} />Other {c.other}</span>}
              </div>
              <small style={{ display: "block", marginTop: 10 }}>
                {usd(tested * 2000, true)} estimated today · as of {instant(c.retrievedAt)}
              </small>
            </>
          ) : (
            <small>{loading ? "Fetching today's count..." : "Today's count not retrieved yet."}</small>
          )}
        </div>
        <div className="pd-kpis pd-num">
          <div className="pd-kpi">
            <span className="lab">Cars tested</span>
            <strong data-testid="text-cars">{num(s.cars)}</strong>
            <small>{s.cars === null ? "Count unavailable" :
              `${s.passed} pass · ${s.failed} fail · ${s.aborted} abort${s.other > 0 ? ` · ${s.other} other` : ""}`}</small>
          </div>
          <div className="pd-kpi accent">
            <span className="lab">Revenue (est.)</span>
            <strong data-testid="text-revenue">{usd(s.revenueCents, true)}</strong>
            <small>$20 per pass or fail</small>
          </div>
          <div className="pd-kpi">
            <span className="lab">Staff pay (est.)</span>
            <strong data-testid="text-pay">{usd(s.payCents, true)}</strong>
            <small>Base {usd(s.baseCents, true)} · Comm. {usd(s.commissionCents, true)}</small>
          </div>
        </div>
      </section>

      <div className="pd-controls">
        <form method="get" action={window.location.pathname} aria-label="Single date">
          <label className="field">
            <span>Date</span>
            <input type="date" name="start" max={data.today} defaultValue={single ? q.start : ""} required data-testid="input-date"
              onChange={(e) => {
                if (e.currentTarget.validity.valid && e.currentTarget.value) e.currentTarget.form?.requestSubmit();
              }} />
          </label>
          <input type="hidden" name="end" value="" />
          <input type="hidden" name="trendDays" value={q.trendDays} />
          {q.employee && <input type="hidden" name="employee" value={q.employee} />}
          <button className="button button-primary button-sm" data-testid="button-apply-date">Show day</button>
        </form>
        <span className="sep" aria-hidden />
        <form method="get" action={window.location.pathname} aria-label="Date range and filters">
          <label className="field">
            <span>From</span>
            <input type="date" name="start" max={data.today} defaultValue={q.start} required data-testid="input-start" />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" name="end" max={data.today} defaultValue={q.end} required data-testid="input-end" />
          </label>
          <label className="field">
            <span>Employee</span>
            <select name="employee" defaultValue={q.employee ?? ""} data-testid="select-employee">
              <option value="">All</option>
              {data.employeeOptions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Trend</span>
            <select name="trendDays" defaultValue={String(q.trendDays)} data-testid="select-trend">
              <option value="7">Week</option>
              <option value="30">Month</option>
            </select>
          </label>
          <button className="button button-primary button-sm" data-testid="button-apply-range">Apply</button>
        </form>
      </div>

      <div className="pd-grid">
        <PerformanceTrend series={data.series} filtered={filtered} />
        <EmployeeTable employees={data.employees} />
      </div>
    </div>
  );
}
