"use client";

import "./performance-dashboard.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import type { DashboardData, DashboardState } from "@/modules/station/dashboard-types";
import { getPerformanceDashboardAction } from "@/modules/station/dashboard-actions";
import type { DashboardLayout } from "./performance-dashboard-layout";
import { PerformanceBusyHours } from "./performance-dashboard-busy-hours";
import { PerformanceCommissionProgress } from "./performance-dashboard-commission-progress";
import { PerformanceTrend } from "./performance-dashboard-trend";
import { EmployeeTable } from "./performance-dashboard-employees";
import { PerformanceCalendar } from "./performance-calendar";
import { instant, longDate, num, usd, inspectionTime } from "./performance-dashboard-format";
import {
  PerformanceDashboardPanels,
  usePerformanceDashboardLayout,
} from "./performance-dashboard-panels";
import type { DashboardPanelId } from "./performance-dashboard-layout";
import type { SourceRefreshStatus } from "@/lib/source-refresh";
import { SourceRefreshIndicator } from "./source-refresh-indicator";

export function PerformanceDashboard({
  initial,
  initialLayout,
  layoutAccountId,
}: {
  initial: DashboardData;
  initialLayout: DashboardLayout | null;
  layoutAccountId: string;
}) {
  const [data, setData] = useState<DashboardData>(initial);
  const [visibleEmployeeRows, setVisibleEmployeeRows] = useState(initial.employees.length);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<SourceRefreshStatus>("cached");
  const busy = useRef(false);
  const { start, end, trendDays, employee } = initial.query;
  const q = useMemo(() => ({ start, end, trendDays, employee }), [start, end, trendDays, employee]);
  const panelLayout = usePerformanceDashboardLayout(initialLayout, layoutAccountId);

  const load = useCallback(
    async (refresh: boolean) => {
      if (busy.current) return;
      busy.current = true;
      setLoading(true);
      setSourceStatus("checking");
      try {
        const res: DashboardState = await getPerformanceDashboardAction(q, refresh);
        if (res.data) setData(res.data);
        setSourceStatus(res.data?.sourceStatus ?? (res.ok === false ? "failed" : "cached"));
        setMessage(
          res.ok === false || !res.data
            ? (res.message ?? "Could not reach the station portal.")
            : null,
        );
      } catch {
        setSourceStatus("failed");
        setMessage("Could not reach the station portal. Showing last saved numbers.");
      } finally {
        busy.current = false;
        setLoading(false);
      }
    },
    [q],
  );

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) void load(false);
    });
    return () => {
      mounted = false;
    };
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
              <span className="pd-chip" role="status">
                <span className="pd-dot live" />
                Updating
              </span>
            ) : (
              <span className="pd-chip">Synced {instant(data.syncedAt)}</span>
            )}
            {partial && (
              <span className="pd-chip warn" title={data.missingDates.join(", ")}>
                Partial: {s.coveredDays}/{s.expectedDays} days
              </span>
            )}
            {data.staleDates.length > 0 && (
              <span className="pd-chip warn">{data.staleDates.length} stale</span>
            )}
            {data.retestMissingDates.length > 0 && (
              <span className="pd-chip warn" title={data.retestMissingDates.join(", ")}>
                VIN history · {data.retestMissingDates.length} days pending
              </span>
            )}
          </div>
        </div>
        <div className="pd-actions">
          <div className="dashboard-refresh-wrap">
            <button
              type="button"
              className="button dashboard-refresh-button"
              onClick={() => load(true)}
              disabled={loading}
              data-testid="button-refresh"
            >
              <RefreshCw
                size={15}
                aria-hidden="true"
                className={loading ? "dashboard-refresh-icon--busy" : undefined}
              />{" "}
              {loading ? "Refreshing…" : "Refresh panels"}
            </button>
            <SourceRefreshIndicator status={sourceStatus} source="Georgia I/M" />
          </div>
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
            {single ? longDate(q.start) : `${longDate(q.start)} to ${longDate(q.end)}`} ·{" "}
            {filtered ? empName : "STATION"}
          </div>
          <strong className="pd-num" data-testid="text-today-total">
            {num(s.cars)}
          </strong>
          {s.cars !== null ? (
            <>
              <div className="pd-split" aria-hidden>
                <span style={{ width: pct(s.passed), background: "var(--chart-green)" }} />
                <span style={{ width: pct(s.failed), background: "var(--pd-amber)" }} />
                <span
                  style={{ width: pct(s.aborted + s.other), background: "var(--chart-neutral)" }}
                />
              </div>
              <div className="pd-legend pd-num">
                <span>
                  <i style={{ background: "var(--chart-green)" }} />
                  Pass {s.passed}
                </span>
                <span>
                  <i style={{ background: "var(--pd-amber)" }} />
                  Fail {s.failed}
                </span>
                <span>
                  <i style={{ background: "var(--chart-neutral)" }} />
                  Abort {s.aborted}
                </span>
                {s.other > 0 && (
                  <span>
                    <i style={{ background: "var(--chart-neutral)" }} />
                    Other {s.other}
                  </span>
                )}
              </div>
              <small style={{ display: "block", marginTop: 10 }}>
                {usd(s.revenueCents, true)} estimated revenue · selected {single ? "day" : "range"}
                {s.freeRetests > 0 && ` · ${s.freeRetests} free retests excluded`}
              </small>
            </>
          ) : (
            <small>
              {loading ? "Fetching selected counts..." : "Selected counts not available yet."}
            </small>
          )}
        </div>
        <div className="pd-kpis pd-num">
          <div className="pd-kpi">
            <span className="lab">Cars tested</span>
            <strong data-testid="text-cars">{num(s.cars)}</strong>
            <small>
              {s.cars === null
                ? "Count unavailable"
                : `${s.passed} pass · ${s.failed} fail · ${s.aborted} abort${s.other > 0 ? ` · ${s.other} other` : ""}`}
            </small>
          </div>
          <div className="pd-kpi accent">
            <span className="lab">Revenue (est.)</span>
            <strong data-testid="text-revenue">{usd(s.revenueCents, true)}</strong>
            <small>$20 per paid pass or fail · 30-day retests free</small>
          </div>
          <div
            className="pd-kpi"
            title="Median consecutive-test gap, paired separately for each employee and day. Free retests included; not measured inspection duration."
          >
            <span className="lab">Avg Test Time</span>
            <strong data-testid="text-inspection-interval">
              {inspectionTime(s.inspectionCadence.medianMinutes)}
            </strong>
            {s.inspectionCadence.coveredDays < s.expectedDays && (
              <small>
                Partial timing: {s.inspectionCadence.coveredDays}/{s.expectedDays} days fully timed
              </small>
            )}
          </div>
          <div className="pd-kpi">
            <span className="lab">Staff pay (est.)</span>
            <strong data-testid="text-pay">{usd(s.payCents, true)}</strong>
            <small>
              Base {usd(s.baseCents, true)} · Comm. {usd(s.commissionCents, true)}
            </small>
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

      <div className="pd-panel-layout-toolbar">
        <div
          className="pd-panel-layout-status"
          role="status"
          aria-live="polite"
          data-testid="performance-layout-save-status"
        >
          {panelLayout.saveStatus === "saving"
            ? "Saving layout to your account…"
            : panelLayout.saveStatus === "saved"
              ? "Layout saved to your account"
              : panelLayout.saveStatus === "error"
                ? "Could not sync the layout to your account."
                : "Layout changes save to your account automatically"}
        </div>
        {panelLayout.saveStatus === "error" && (
          <button
            type="button"
            className="button button-outline button-sm"
            onClick={panelLayout.retrySave}
            data-testid="button-retry-panel-layout-save"
          >
            Retry save
          </button>
        )}
        <button
          type="button"
          className="button button-outline button-sm"
          onClick={panelLayout.reset}
          data-testid="button-reset-panel-layout"
        >
          <RotateCcw size={14} aria-hidden="true" /> Reset panels
        </button>
      </div>
      <PerformanceDashboardPanels
        layout={panelLayout.layout}
        employeeRowCount={visibleEmployeeRows}
        onMove={panelLayout.move}
        onResize={panelLayout.resize}
        onDrop={(id: DashboardPanelId, target: DashboardPanelId) => {
          const targetIndex = panelLayout.layout.findIndex((panel) => panel.id === target);
          panelLayout.move(id, targetIndex);
        }}
        renderPanel={(id, controls) =>
          id === "trend" ? (
            <PerformanceTrend series={data.series} filtered={filtered} panelActions={controls} />
          ) : id === "busy-hours" ? (
            <PerformanceBusyHours
              data={data.busyHours}
              filtered={filtered}
              panelActions={controls}
            />
          ) : id === "commission-progress" ? (
            <PerformanceCommissionProgress
              key={`${q.start}:${q.end}:${q.employee ?? "station"}`}
              data={data.commissionProgress}
              selectedCommissionCents={s.commissionCents}
              filtered={filtered}
              panelActions={controls}
            />
          ) : (
            <EmployeeTable
              employees={data.employees}
              profiles={data.payPlan.profiles}
              overallCadence={s.inspectionCadence}
              panelActions={controls}
              onVisibleRowsChange={setVisibleEmployeeRows}
            />
          )
        }
      />
    </div>
  );
}
