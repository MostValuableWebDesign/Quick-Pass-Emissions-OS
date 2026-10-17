"use client";

import "./performance-dashboard.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, RefreshCw, RotateCcw, Save } from "lucide-react";
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
  const [visibleEmployeeRows, setVisibleEmployeeRows] = useState(
    initial.employees.filter(
      (employee) => !initial.query.employee || employee.id === initial.query.employee,
    ).length,
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<SourceRefreshStatus>("cached");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const dateTrigger = useRef<HTMLButtonElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!datePickerOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !datePickerRef.current?.contains(event.target)) {
        setDatePickerOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [datePickerOpen]);

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
      </header>

      <section
        className="pd-toolbar"
        aria-label="Performance controls"
        data-testid="performance-toolbar"
      >
        <div className="pd-toolbar-main">
          <form
            method="get"
            action="/performance"
            className="pd-employee-focus"
            aria-label="Employee filter"
          >
            <input type="hidden" name="start" value={q.start} />
            <input type="hidden" name="end" value={q.end} />
            <input type="hidden" name="trendDays" value={q.trendDays} />
            <label>
              <select
                name="employee"
                value={q.employee ?? ""}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                data-testid="select-employee"
                aria-controls="performance-headline performance-panels"
                aria-label="Employee"
              >
                <option value="">All employees</option>
                {data.employeeOptions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          </form>
          <div className="pd-toolbar-actions">
            <button
              type="button"
              className="button button-outline button-sm pd-save-layout-button"
              aria-label="Save panel layout"
              aria-describedby="save-panel-layout-tooltip"
              onClick={panelLayout.retrySave}
              disabled={panelLayout.saveStatus === "saving"}
              data-testid="button-save-panel-layout"
            >
              <Save size={15} aria-hidden="true" />
              <span
                className="pd-save-layout-tooltip"
                id="save-panel-layout-tooltip"
                role="tooltip"
              >
                Save your current panel layout.
              </span>
            </button>
            <div
              className="pd-date-picker"
              ref={datePickerRef}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDatePickerOpen(false);
                  dateTrigger.current?.focus();
                }
              }}
            >
              <button
                type="button"
                ref={dateTrigger}
                className="button button-outline button-sm pd-date-trigger"
                aria-label="Reporting date range"
                aria-expanded={datePickerOpen}
                aria-controls="performance-date-popover"
                onClick={() => setDatePickerOpen((open) => !open)}
                data-testid="button-date-range"
              >
                <CalendarDays size={15} aria-hidden="true" />{" "}
                {q.start === q.end
                  ? longDate(q.start)
                  : `${longDate(q.start)} – ${longDate(q.end)}`}{" "}
                <span aria-hidden="true">⌄</span>
              </button>
              {datePickerOpen && (
                <div className="pd-date-popover" id="performance-date-popover">
                  <PerformanceCalendar
                    key={`${q.start}-${q.end}-${q.trendDays}`}
                    start={q.start}
                    end={q.end}
                    today={data.today}
                    employee={q.employee}
                    trendDays={q.trendDays}
                  />
                </div>
              )}
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
          </div>
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
      </section>

      {(message || data.error) && (
        <div className="notice warning" role="alert" style={{ margin: 0 }}>
          {message ?? data.error}
        </div>
      )}
      {!!data.reportIssues?.length && (
        <div className="notice warning" role="status" style={{ margin: 0 }}>
          {data.reportIssues.map((issue) => (
            <div key={issue.date}>
              {longDate(issue.date)}: skipped {issue.rows} of {num(issue.sourceRows)} report{" "}
              {issue.sourceRows === 1 ? "row" : "rows"} (
              {[
                issue.vehicle ? `${issue.vehicle} invalid or missing VIN` : null,
                issue.inspector ? `${issue.inspector} missing inspector` : null,
                issue.outcome ? `${issue.outcome} missing result` : null,
              ]
                .filter(Boolean)
                .join(", ")}
              ).
            </div>
          ))}
          Skipped rows are excluded from counts and 30-day retest matching. A later repeat of an
          excluded VIN may be counted as paid.
        </div>
      )}

      <section className="pd-hero" id="performance-headline" aria-label="Headline numbers">
        <div className="pd-today">
          <div className="lab" data-testid="text-headline-label">
            Cars tested
          </div>
          <strong className="pd-num" data-testid="text-cars">
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
            </>
          ) : (
            <small>
              {s.reportedTests != null
                ? `${num(s.reportedTests)} report rows loaded. ${
                    data.reportIssues?.length
                      ? "Paid totals pending report verification."
                      : "Paid car count pending 30-day retest history."
                  }`
                : loading
                  ? "Fetching selected counts..."
                  : "Selected counts not available yet."}
            </small>
          )}
        </div>
        <div className="pd-kpis pd-num">
          <div className="pd-kpi">
            <span className="lab">Retest count</span>
            <strong data-testid="text-retests">
              {s.cars === null ? "Pending" : num(s.freeRetests)}
            </strong>
            <small>Free VIN retests within 30 days</small>
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
            <PerformanceTrend
              series={data.series}
              filtered={filtered}
              panelActions={controls}
              trendDays={q.trendDays}
              endDate={q.end}
              startDate={q.start}
              employeeId={q.employee}
              today={data.today}
              employeeName={empName}
            />
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
              selectedEmployeeId={q.employee}
              scopeLabel={empName ?? "All employees"}
              panelActions={controls}
              onVisibleRowsChange={setVisibleEmployeeRows}
            />
          )
        }
      />
    </div>
  );
}
