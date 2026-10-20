"use client";

import { useEffect, useRef, useState } from "react";
import type { DashboardQuery } from "@/modules/station/dashboard-types";
import type {
  RetentionDetailRequest,
  RetentionDetails,
  VehicleRetentionReport,
} from "@/modules/station/vehicle-retention";
import { getVehicleRetentionDetailsAction } from "@/modules/station/vehicle-retention-actions";
import "./vehicle-retention-metrics.css";

const pct = (v: number | null) => (v === null ? "Insufficient data" : `${(v * 100).toFixed(1)}%`);
const n = (v: number) => v.toLocaleString();
type Drill = { title: string; request: RetentionDetailRequest };

function Tip({ id, text }: { id: string; text: string }) {
  return (
    <span className="vr-tip">
      <button
        type="button"
        className="vr-tip-btn"
        aria-describedby={`vr-tip-${id}`}
        aria-label="Explain"
      >
        ?
      </button>
      <span role="tooltip" id={`vr-tip-${id}`} className="vr-tip-text">
        {text}
      </span>
    </span>
  );
}

function Metric({
  id,
  label,
  value,
  sub,
  tip,
  onOpen,
  linkLabel = "View vehicles",
}: {
  id: string;
  label: string;
  value: string;
  sub?: string;
  tip: string;
  onOpen?: () => void;
  linkLabel?: string;
}) {
  return (
    <div className="vr-metric" data-testid={`metric-${id}`}>
      <span className="vr-label">
        {label}
        <Tip id={id} text={tip} />
      </span>
      <strong data-testid={`value-${id}`}>{value}</strong>
      {sub && <small>{sub}</small>}
      {onOpen && (
        <button
          type="button"
          className="vr-link"
          onClick={onOpen}
          data-testid={`button-drill-${id}`}
        >
          {linkLabel}
        </button>
      )}
    </div>
  );
}

function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="vr-pager" aria-label="Pagination">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        data-testid="button-page-prev"
      >
        Previous
      </button>
      <span aria-live="polite">
        Page {page} of {pages}
      </span>
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        data-testid="button-page-next"
      >
        Next
      </button>
    </nav>
  );
}

function DetailPanel({
  query,
  drill,
  onClose,
}: {
  query: DashboardQuery;
  drill: Drill;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [vehicle, setVehicle] = useState<{ id: string; label: string } | null>(null);
  const [vPage, setVPage] = useState(1);
  const [state, setState] = useState<{
    key: string;
    error: string | null;
    data: RetentionDetails | null;
  }>({
    key: "",
    error: null,
    data: null,
  });
  const [retry, setRetry] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (gutter > 0) body.style.paddingRight = `${gutter}px`;
    headingRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0],
        last = items[items.length - 1];
      const active = document.activeElement;
      const inside = panelRef.current.contains(active);
      if (e.shiftKey && (!inside || active === first || active === headingRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
      returnFocus.current?.focus?.();
    };
  }, []);

  const reqKey = JSON.stringify([query, drill.request, page, vehicle?.id, vPage, retry]);
  useEffect(() => {
    let cancelled = false;
    const input: RetentionDetailRequest = vehicle
      ? { ...drill.request, vehicleId: vehicle.id, page: vPage }
      : { ...drill.request, page };
    getVehicleRetentionDetailsAction(query, input)
      .then((res) => {
        if (cancelled) return;
        setState(
          res.ok
            ? { key: reqKey, error: null, data: res.data }
            : { key: reqKey, error: res.message, data: null },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setState({
          key: reqKey,
          error: "Unable to load the saved vehicle history. No data was changed.",
          data: null,
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);

  const loading = state.key !== reqKey;
  const d = loading ? null : state.data;
  return (
    <div className="vr-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vr-detail-title"
        className="vr-panel"
        onClick={(e) => e.stopPropagation()}
        data-testid="dialog-retention-detail"
      >
        <div className="vr-panel-head">
          <div>
            <p className="eyebrow">{vehicle ? "VEHICLE VISITS" : "DRILL-DOWN"}</p>
            <h3 id="vr-detail-title" tabIndex={-1} ref={headingRef}>
              {vehicle ? vehicle.label : drill.title}
            </h3>
          </div>
          <button
            type="button"
            className="vr-close"
            onClick={onClose}
            aria-label="Close details"
            data-testid="button-close-detail"
          >
            Close
          </button>
        </div>
        {vehicle && (
          <button
            type="button"
            className="vr-link"
            onClick={() => {
              setVehicle(null);
              setVPage(1);
            }}
            data-testid="button-back-vehicles"
          >
            Back to {drill.title.toLowerCase()}
          </button>
        )}
        {loading && (
          <div className="vr-skeleton" role="status" aria-label="Loading saved history">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
        )}
        {!loading && state.error && (
          <div className="notice warning" role="alert">
            <p>{state.error}</p>
            <button
              type="button"
              onClick={() => setRetry((r) => r + 1)}
              data-testid="button-retry-detail"
            >
              Try again
            </button>
          </div>
        )}
        {!loading && d && d.total === 0 && (
          <p className="muted" role="status">
            No records in this group.
          </p>
        )}
        {!loading && d && d.total > 0 && d.kind === "vehicles" && (
          <>
            <p className="muted">{n(d.total)} vehicles · select one to see its saved visits</p>
            <ul className="vr-rows">
              {d.vehicles.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setVehicle({ id: v.id, label: v.label });
                      setVPage(1);
                    }}
                    data-testid={`row-vehicle-${v.id}`}
                  >
                    <span className="vr-row-main">
                      {v.label}
                      <em>{v.matchType}</em>
                    </span>
                    <span className="vr-row-meta">
                      First observed in available history {v.firstObserved} · last {v.lastObserved}{" "}
                      · {v.qualifyingVisits} qualifying
                      {v.returned !== undefined && (v.returned ? " · returned" : " · not returned")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Pager page={d.page} pages={d.pages} onPage={setPage} />
          </>
        )}
        {!loading && d && d.total > 0 && d.kind === "visits" && (
          <>
            <p className="muted">{n(d.total)} visits · dates in America/New_York</p>
            <div className="table-scroll">
              <table className="vr-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Inspector</th>
                    <th>Outcome</th>
                    <th>Payment</th>
                    <th>Retest</th>
                    <th>Status</th>
                    <th>Report</th>
                  </tr>
                </thead>
                <tbody>
                  {d.visits.map((v) => (
                    <tr key={v.id} data-testid={`row-visit-${v.id}`}>
                      <td>
                        {v.date}
                        {v.time ? ` ${v.time}` : ""}
                        {v.intervalDays !== undefined && (
                          <small>
                            {v.intervalDays} days after {v.previousDate}
                          </small>
                        )}
                      </td>
                      <td>{v.inspector}</td>
                      <td>{v.outcome}</td>
                      <td>{v.payment}</td>
                      <td>
                        {v.freeRetestByDateRule ? (
                          <span title={`Source classification: ${v.retest}`}>
                            Free retest · 30-day rule
                          </span>
                        ) : (
                          v.retest
                        )}
                      </td>
                      <td>
                        {v.completion}
                        {v.qualifying ? <small>Qualifying</small> : <small>Not qualifying</small>}
                      </td>
                      <td>
                        {v.sourceUrl ? (
                          <a
                            href={v.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            data-testid={`link-source-${v.id}`}
                          >
                            Saved source report
                          </a>
                        ) : (
                          <span className="muted">Not available</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={d.page} pages={d.pages} onPage={vehicle ? setVPage : setPage} />
          </>
        )}
      </div>
    </div>
  );
}

export function VehicleRetentionMetrics({
  report,
  query,
}: {
  report: VehicleRetentionReport;
  query: DashboardQuery;
}) {
  const [drill, setDrill] = useState<Drill | null>(null);
  const years = report.annualCohorts.filter((c) => c.rate !== null);
  const [selectedYear, setYear] = useState<number | undefined>();
  const year = years.some((c) => c.year === selectedYear) ? selectedYear : years.at(-1)?.year;
  const cohort = years.find((c) => c.year === year);
  const c = report.coverage,
    k = report.classifications;
  const open = (title: string, request: RetentionDetailRequest) => setDrill({ title, request });
  const allTime = query.trendDays === "all";
  const rate = allTime ? report.repeatPercentage : report.selectedPeriod.rate;
  const returning = allTime ? report.repeatVehicles : report.selectedPeriod.returning;
  const vehicles = allTime ? report.identifiableVehicles : report.selectedPeriod.vehicles;

  return (
    <div className="vr" data-testid="vehicle-retention">
      <div className="vr-intro">
        <span className="muted">{report.scope.label}</span>
        <span
          className={c.label === "Partial coverage" ? "vr-badge warn" : "vr-badge"}
          data-testid="status-coverage"
        >
          {c.label === "Partial coverage" ? "Incomplete data" : "Saved reports"}
        </span>
      </div>
      {report.scope.id && !report.scope.inspector && (
        <p className="notice warning">No report inspector is linked to this employee.</p>
      )}

      <div className="vr-grid">
        <Metric
          id={allTime ? "repeat-pct" : "selected"}
          label="Returning vehicles"
          value={pct(rate)}
          sub={`${n(returning)} of ${n(vehicles)} vehicles${allTime ? "" : " · seen before these dates"}`}
          tip={
            allTime
              ? "VIN-matched vehicles with two or more qualifying visits in saved history. Free retests are excluded."
              : "Vehicles with a qualifying visit before these dates that came back during this period. Free retests are excluded."
          }
          onOpen={() => open("Returning vehicles", { metric: allTime ? "repeat" : "selected" })}
        />
        <Metric
          id="return-visits"
          label="Return visits"
          value={c.vinMatchedRecords ? n(report.repeatInspections) : "Insufficient data"}
          sub="During these dates"
          tip="Qualifying visits after a vehicle's first qualifying inspection. One vehicle may have several return visits; free retests are excluded."
          onOpen={() => open("Return visits", { metric: "intervals" })}
          linkLabel="View visits"
        />
        <Metric
          id="median-interval"
          label="Typical return time"
          value={
            report.medianIntervalDays === null
              ? "Insufficient data"
              : `${n(Math.round(report.medianIntervalDays))} days`
          }
          sub="Median between visits"
          tip="The middle value of the days between qualifying visits for the same VIN. Free retests are excluded."
        />
      </div>

      <p className="muted vr-policy">Free retests within 30 days excluded · Payment not verified</p>
      {k.unknownRetestIncluded > 0 && (
        <p
          className="notice warning vr-provisional"
          role="note"
          data-testid="text-provisional-retest"
        >
          Preliminary · Some test classifications are unverified. The 30-day free-retest rule still
          applies.
        </p>
      )}

      <div className="vr-split">
        {cohort && (
          <section className="vr-block" aria-labelledby="vr-cohort-h">
            <div className="vr-block-head">
              <h4 id="vr-cohort-h">
                Returned the following year
                <Tip
                  id="cohort"
                  text="Vehicles inspected in the cohort year that came back for a qualifying inspection during the following calendar year."
                />
              </h4>
              {years.length > 0 && (
                <select
                  aria-label="Cohort year"
                  value={year ?? ""}
                  onChange={(e) => setYear(Number(e.target.value))}
                  data-testid="select-cohort-year"
                >
                  {years.map((y) => (
                    <option key={y.year} value={y.year}>
                      {y.year}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {cohort ? (
              <>
                <strong className="vr-big" data-testid="value-cohort-rate">
                  {pct(cohort.rate)}
                </strong>
                <p className="muted">
                  {n(cohort.returned)} of {n(cohort.cohort)} returned in {cohort.year + 1}
                  <span className="vr-badge">
                    {cohort.label === "Full following year" ? "Full year" : cohort.label}
                  </span>
                  {cohort.partialCoverage && <span className="vr-badge warn">Incomplete data</span>}
                </p>
                <button
                  type="button"
                  className="vr-link"
                  onClick={() =>
                    open(`${cohort.year} cohort`, { metric: "cohort", year: cohort.year })
                  }
                  data-testid="button-drill-cohort"
                >
                  View vehicles
                </button>
              </>
            ) : (
              <p className="muted">Insufficient data</p>
            )}
          </section>
        )}

        <section className="vr-block" aria-labelledby="vr-int-h">
          <div className="vr-block-head">
            <h4 id="vr-int-h">
              When vehicles come back
              <Tip
                id="interval"
                text="Days between consecutive qualifying inspections of the same VIN. Free retests, including same-VIN inspections within 30 calendar days, are excluded."
              />
            </h4>
          </div>
          {report.intervalCount > 0 ? (
            <ul className="vr-bands">
              {report.intervals.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    disabled={!b.count}
                    onClick={() => open(b.label, { metric: "intervals", band: b.id })}
                    data-testid={`button-band-${b.id}`}
                  >
                    <span>{b.label.replace(" · around annual", "")}</span>
                    <strong>{n(b.count)}</strong>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              {c.vinMatchedRecords
                ? "No qualifying return visits in these dates."
                : "No return-time data available."}
            </p>
          )}
        </section>
      </div>

      <div className="vr-data-status muted" data-testid="text-vin-coverage">
        <span>
          {n(c.loadedDates)} / {n(c.totalDates)} dates loaded
        </span>
        <span>VIN match: {pct(c.identifierCoverage)}</span>
        {c.plateFallbackVehicles > 0 && (
          <button
            type="button"
            className="vr-link"
            onClick={() => open("Plate-only vehicles", { metric: "plate" })}
            data-testid="button-drill-plate"
          >
            {n(c.plateFallbackVehicles)} plate-only vehicles excluded
          </button>
        )}
        {c.reviewableVisits > 0 && (
          <button
            type="button"
            className="vr-link"
            onClick={() => open("Inspections needing review", { metric: "review" })}
            data-testid="button-drill-review"
          >
            {n(c.reviewableVisits)} inspections need review
          </button>
        )}
      </div>

      {drill && (
        <DetailPanel
          key={JSON.stringify(drill.request)}
          query={query}
          drill={drill}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}
