"use client";

import "./performance-dashboard.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, SlidersHorizontal } from "lucide-react";
import type { DashboardData, DashboardState } from "@/modules/station/dashboard-types";
import { getPerformanceDashboardAction } from "@/modules/station/dashboard-actions";
import { PerformanceTrend } from "./performance-dashboard-trend";
import { EmployeeTable } from "./performance-dashboard-employees";
import { PerformanceCalendar } from "./performance-calendar";
import { PayPlanDialog } from "./performance-dashboard-pay";
import { instant, longDate, num, usd, inspectionTime } from "./performance-dashboard-format";
import { PerformanceDashboardPanels, usePerformanceDashboardLayout } from "./performance-dashboard-panels";
import type { DashboardPanelId } from "./performance-dashboard-layout";

export function PerformanceDashboard({ initial }: { initial: DashboardData }) {
  const router = useRouter();
  const [data, setData] = useState<DashboardData>(initial);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);
  const { start, end, trendDays, employee } = initial.query;
  const q = useMemo(() => ({ start, end, trendDays, employee }), [start, end, trendDays, employee]);
  const panelLayout = usePerformanceDashboardLayout();

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
  const single = q.start === q.end;
  const partial = s.coveredDays < s.expectedDays;
  const filtered = !!q.employee;
  const empName = data.employeeOptions.find((e) => e.id === q.employee)?.name;
  const pct = (n: number) => (s.cars ? `${(n / s.cars) * 100}%` : "0%");

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
          <button type="button" className="button button-outline" onClick={panelLayout.reset} data-testid="button-reset-panel-layout">
            Reset panels
          </button>
        </div>
      </header>

      {(message || data.error) && (
        <div className="notice warning" role="alert" style={{ margin: 0 }}>
          {message ?? data.error}
        </div>
      )}

      <section className="pd-hero" aria-label="Headline numbers">
        <div className="pd-today">
          <div className="lab" data-testid="text-headline-period">
            {single ? longDate(q.start) : `${longDate(q.start)} to ${longDate(q.end)}`} · {filtered ? empName : "STATION"}
          </div>
          <strong className="pd-num" data-testid="text-today-total">{num(s.cars)}</strong>
          {s.cars !== null ? (
            <>
              <div className="pd-split" aria-hidden>
                <span style={{ width: pct(s.passed), background: "#47c99d" }} />
                <span style={{ width: pct(s.failed), background: "#e5a24d" }} />
                <span style={{ width: pct(s.aborted + s.other), background: "#6f8b94" }} />
              </div>
              <div className="pd-legend pd-num">
                <span><i style={{ background: "#47c99d" }} />Pass {s.passed}</span>
                <span><i style={{ background: "#e5a24d" }} />Fail {s.failed}</span>
                <span><i style={{ background: "#6f8b94" }} />Abort {s.aborted}</span>
                {s.other > 0 && <span><i style={{ background: "#6f8b94" }} />Other {s.other}</span>}
              </div>
              <small style={{ display: "block", marginTop: 10 }}>
                {usd(s.revenueCents, true)} estimated revenue · selected {single ? "day" : "range"}
              </small>
            </>
          ) : (
            <small>{loading ? "Fetching selected counts..." : "Selected counts not available yet."}</small>
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
          <div className="pd-kpi" title="Mean gap between consecutive same-employee tests within each day. Includes daytime pauses; report timestamps have minute precision, not measured inspection durations.">
            <span className="lab">Avg. inspection interval (est.)</span>
            <strong data-testid="text-inspection-interval">{inspectionTime(s.inspectionCadence.averageMinutes)}</strong>
            <small>{s.inspectionCadence.intervals} intervals · {s.inspectionCadence.coveredDays}/{s.expectedDays} timing days · includes pauses</small>
          </div>
          <div className="pd-kpi">
            <span className="lab">Staff pay (est.)</span>
            <strong data-testid="text-pay">{usd(s.payCents, true)}</strong>
            <small>Base {usd(s.baseCents, true)} · Comm. {usd(s.commissionCents, true)}</small>
          </div>
        </div>
      </section>

      <div className="pd-controls">
        <PerformanceCalendar
          key={`${q.start}-${q.end}`}
          start={q.start}
          end={q.end}
          today={data.today}
          trendDays={q.trendDays}
          employee={q.employee}
          employeeOptions={data.employeeOptions}
        />
      </div>

      <PerformanceDashboardPanels
        layout={panelLayout.layout}
        onMove={panelLayout.move}
        onResize={panelLayout.resize}
        onDrop={(id: DashboardPanelId, target: DashboardPanelId) => {
          const targetIndex = panelLayout.layout.findIndex((panel) => panel.id === target);
          panelLayout.move(id, targetIndex);
        }}
        renderPanel={(id, controls) => id === "trend" ? (
          <PerformanceTrend series={data.series} filtered={filtered} panelActions={controls} />
        ) : (
          <EmployeeTable employees={data.employees} profiles={data.payPlan.profiles} panelActions={controls} />
        )}
      />
    </div>
  );
}
