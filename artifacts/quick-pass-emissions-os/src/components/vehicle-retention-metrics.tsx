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
const periods = (list: { start: string; end: string }[]) =>
  list.length
    ? list.map((p) => (p.start === p.end ? p.start : `${p.start} – ${p.end}`)).join(", ")
    : "None";

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
}: {
  id: string;
  label: string;
  value: string;
  sub?: string;
  tip: string;
  onOpen?: () => void;
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
          View vehicles
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
                      <td>{v.retest}</td>
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
  const years = report.annualCohorts;
  const [year, setYear] = useState<number | undefined>(years.at(-2)?.year ?? years.at(-1)?.year);
  const cohort = years.find((c) => c.year === year);
  const c = report.coverage,
    k = report.classifications;
  const open = (title: string, request: RetentionDetailRequest) => setDrill({ title, request });
  const period = (p: VehicleRetentionReport["selectedPeriod"]) =>
    `${n(p.returning)} of ${n(p.vehicles)} · ${n(p.firstObserved)} first observed in available history${
      p.priorNonqualifying
        ? ` · ${n(p.priorNonqualifying)} with only excluded or incomplete prior observations`
        : ""
    }`;

  return (
    <div className="vr" data-testid="vehicle-retention">
      <div className="vr-intro">
        <p className="eyebrow">QUALIFYING RETENTION · {report.scope.label}</p>
        <span
          className={c.label === "Partial coverage" ? "vr-badge warn" : "vr-badge"}
          data-testid="status-coverage"
        >
          {c.label}
        </span>
      </div>
      <p className="muted vr-scope">
        {report.start} – {report.end} · America/New_York.{" "}
        {report.scope.id
          ? report.scope.inspector
            ? "Selected inspector sets which vehicles count; "
            : "No source inspector is mapped to the selected employee; "
          : ""}
        totals follow the trend timeframe; earlier saved visits across all inspectors are used to
        identify returning vehicles. Vehicle retention, not customer identity.
      </p>
      <p className="muted vr-scope" data-testid="text-vin-coverage">
        Validated VIN identity: {n(c.vinMatchedRecords)} of {n(c.sourceRecords)} loaded inspections{" "}
        ({pct(c.identifierCoverage)}). Retention uses processed identities and can differ from the
        recorded-report summary above.
      </p>

      <div className="vr-grid">
        <Metric
          id="repeat-pct"
          label={
            query.trendDays === "all"
              ? "Repeat vehicles · all time"
              : "Repeat vehicles · trend timeframe"
          }
          value={pct(report.repeatPercentage)}
          sub={`${n(report.repeatVehicles)} of ${n(report.identifiableVehicles)} VIN-matched vehicles`}
          tip="Distinct VIN vehicles with at least two qualifying inspections within this trend timeframe, divided by its distinct identifiable VIN vehicles. The denominator also includes vehicles with only excluded observations. Qualifying visits are completed inspections not explicitly classified as retests."
          onOpen={() => open("Repeat vehicles", { metric: "repeat" })}
        />
        <Metric
          id="selected"
          label="Returning · trend timeframe"
          value={pct(report.selectedPeriod.rate)}
          sub={period(report.selectedPeriod)}
          tip={`${report.selectedPeriod.start} – ${report.selectedPeriod.end}. Returning means a qualifying inspection before the period began. First observed in available history does not mean a first-ever visit.`}
          onOpen={() => open("Returning in selected period", { metric: "selected" })}
        />
        <Metric
          id="month"
          label={`Returning · ${report.end.slice(0, 7)}`}
          value={pct(report.returningMonth.rate)}
          sub={period(report.returningMonth)}
          tip={`${report.returningMonth.start} – ${report.returningMonth.end}, within the selected trend timeframe. Earlier saved visits identify returning vehicles.`}
          onOpen={() => open(`Returning in ${report.end.slice(0, 7)}`, { metric: "month" })}
        />
        <Metric
          id="year"
          label={`Returning · ${report.end.slice(0, 4)}`}
          value={pct(report.returningYear.rate)}
          sub={period(report.returningYear)}
          tip={`${report.returningYear.start} – ${report.returningYear.end}, within the selected trend timeframe. Earlier saved visits identify returning vehicles.`}
          onOpen={() => open(`Returning in ${report.end.slice(0, 4)}`, { metric: "year" })}
        />
      </div>

      {k.unknownRetestIncluded > 0 && (
        <p
          className="notice warning vr-provisional"
          role="note"
          data-testid="text-provisional-retest"
        >
          Provisional: {n(k.unknownRetestIncluded)} completed VIN-matched visits with unknown retest
          status are included; known retests are excluded. Time between visits is never used to
          infer a retest, and payment status does not qualify a visit.
        </p>
      )}

      <div className="vr-split">
        <section className="vr-block" aria-labelledby="vr-cohort-h">
          <div className="vr-block-head">
            <h4 id="vr-cohort-h">
              Annual cohort return
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
                <span className="vr-badge">{cohort.label}</span>
                {cohort.partialCoverage && <span className="vr-badge warn">Partial coverage</span>}
              </p>
              <p className="muted">
                Follow-up window {cohort.followStart} – {cohort.followEnd ?? "not started"}
              </p>
              <button
                type="button"
                className="vr-link"
                onClick={() =>
                  open(`${cohort.year} cohort`, { metric: "cohort", year: cohort.year })
                }
                data-testid="button-drill-cohort"
              >
                View cohort vehicles
              </button>
            </>
          ) : (
            <p className="muted">Insufficient data</p>
          )}
        </section>

        <section className="vr-block" aria-labelledby="vr-int-h">
          <div className="vr-block-head">
            <h4 id="vr-int-h">
              Time between qualifying visits
              <Tip
                id="interval"
                text="Days between consecutive qualifying inspections of the same VIN. A short interval does not prove a retest."
              />
            </h4>
          </div>
          <strong className="vr-big" data-testid="value-median-interval">
            {report.medianIntervalDays === null
              ? "Insufficient data"
              : `${n(Math.round(report.medianIntervalDays))} days`}
          </strong>
          <p className="muted">Median across {n(report.intervalCount)} intervals</p>
          <dl className="vr-mini">
            <div>
              <dt>Qualifying inspections</dt>
              <dd data-testid="value-qualifying-inspections">{n(report.qualifyingInspections)}</dd>
            </div>
            <div>
              <dt>
                Qualifying repeats
                <Tip
                  id="qrepeat"
                  text="Qualifying inspections after a vehicle's first qualifying visit at this station. Each one is one interval, so this matches the interval count."
                />
              </dt>
              <dd data-testid="value-qualifying-repeats">{n(report.repeatInspections)}</dd>
            </div>
          </dl>
          <ul className="vr-bands">
            {report.intervals.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  disabled={!b.count}
                  onClick={() => open(b.label, { metric: "intervals", band: b.id })}
                  data-testid={`button-band-${b.id}`}
                >
                  <span>{b.label}</span>
                  <strong>{n(b.count)}</strong>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <details className="vr-details" data-testid="details-coverage">
        <summary>Coverage and data quality</summary>
        <dl className="vr-dl">
          <dt>Loaded dates</dt>
          <dd>
            {n(c.loadedDates)} of {n(c.totalDates)} ({c.start} – {c.end})
          </dd>
          <dt>Missing periods</dt>
          <dd>{periods(c.missingPeriods)}</dd>
          <dt>Incomplete periods</dt>
          <dd>{periods(c.incompletePeriods)}</dd>
          <dt>Unprocessed periods</dt>
          <dd>
            {c.unprocessedPeriods.length
              ? c.unprocessedPeriods
                  .map(
                    (p) =>
                      `${p.start} – ${p.end} (${p.status}${p.review ? `, ${p.review} review` : ""})`,
                  )
                  .join(", ")
              : "None"}
          </dd>
          <dt>VIN identification</dt>
          <dd>
            {pct(c.identifierCoverage)} · {n(c.vinMatchedRecords)} of {n(c.sourceRecords)} records
          </dd>
          <dt>Plate/state fallback</dt>
          <dd>
            {n(c.plateFallbackRecords)} records, {n(c.plateFallbackVehicles)} vehicles · excluded
            from VIN metrics
            {c.plateFallbackVehicles > 0 && (
              <button
                type="button"
                className="vr-link"
                onClick={() => open("Plate/state-only vehicles", { metric: "plate" })}
                data-testid="button-drill-plate"
              >
                View
              </button>
            )}
          </dd>
          <dt>Loaded visits needing review</dt>
          <dd>
            {n(c.reviewableVisits)} visits
            {c.reviewableVisits > 0 && (
              <button
                type="button"
                className="vr-link"
                onClick={() => open("Loaded visits needing review", { metric: "review" })}
                data-testid="button-drill-review"
              >
                View {n(c.reviewableVisits)}
              </button>
            )}
          </dd>
          <dt>Ambiguous / unmatched</dt>
          <dd>
            {n(c.ambiguousRecords)} ambiguous, {n(c.unmatchedRecords)} unmatched records
          </dd>
          <dt>Without retained identity</dt>
          <dd>{n(c.unrepresentedRecords)} known report rows</dd>
          <dt>Source processing review flags</dt>
          <dd>{n(c.recordsNeedingReview)} flags · not distinct vehicles or loaded visit records</dd>
          <dt>Duplicates excluded</dt>
          <dd>{n(c.duplicateRecordsExcluded)}</dd>
          <dt>Unknown retest</dt>
          <dd>{n(k.unknownRetestIncluded)} included provisionally</dd>
          <dt>Known retests</dt>
          <dd>{n(k.knownRetestsExcluded)} excluded</dd>
          <dt>Incomplete inspections</dt>
          <dd>{n(k.incompleteInspectionsExcluded)} excluded</dd>
          <dt>Unknown payment</dt>
          <dd>{n(k.unknownPayment)} records</dd>
        </dl>
        <p className="muted">
          Payment status is shown for context only; it does not decide qualification and is not
          proof money was collected. Missing periods are not zero inspections. Raw Performance rows
          that only carry an identifier hash, without a processed and validated VIR identity, are
          counted above as without retained identity and excluded from VIN metrics.
        </p>
      </details>

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
