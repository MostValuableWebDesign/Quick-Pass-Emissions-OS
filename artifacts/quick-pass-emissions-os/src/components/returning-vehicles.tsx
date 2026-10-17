import type { ReturningVehicleReport } from "@/modules/station/history/report";
import "./inspection-history.css";
export function ReturningVehicles({ report }: { report: ReturningVehicleReport }) {
  const percent = (v: number | null) =>
    v === null ? "Insufficient data" : `${(v * 100).toFixed(1)}%`;
  return (
    <section className="card card-body history-report" aria-label="Returning vehicles">
      <div className="history-heading">
        <div>
          <p className="eyebrow">VEHICLE HISTORY</p>
          <h2>Returning-vehicle rate</h2>
        </div>
        <a
          className="button button-outline button-sm"
          href={`/performance/history?start=${report.start}&end=${report.end}`}
        >
          Historical import
        </a>
      </div>
      <p className="muted">
        {report.start} – {report.end} · America/New_York · selected station scope
      </p>
      <div className="history-metrics">
        <div>
          <span>Returning vehicles</span>
          <strong data-testid="returning-count">{report.returning}</strong>
        </div>
        <div>
          <span>First-observed vehicles</span>
          <strong data-testid="first-observed-count">{report.firstObserved}</strong>
        </div>
        <div>
          <span>Unknown/unmatched vehicle records</span>
          <strong>{report.unmatchedRecords}</strong>
        </div>
        <div>
          <span>Returning-vehicle rate</span>
          <strong data-testid="returning-rate">{percent(report.rate)}</strong>
        </div>
        <div>
          <span>Identification coverage · inspection records</span>
          <strong>{percent(report.identificationCoverage)}</strong>
        </div>
      </div>
      <p
        className={report.coverage.pending || report.coverage.partial ? "notice warning" : "muted"}
        role="status"
      >
        {report.coverage.label}
      </p>
      <p>
        Available imported dates:{" "}
        {report.historyStart
          ? `${report.historyStart} – ${report.historyEnd}`
          : "No inspection history"}
        . {report.coverage.completed}/{report.coverage.windows} windows reconciled;{" "}
        {report.coverage.unverified} without source totals. Gaps outside imported windows remain
        unknown.
      </p>
      <p className="muted">
        {report.identifiableVehicles} distinct identifiable vehicles had completed, explicitly paid
        non-free inspections. {report.unknownStatusRecords} records have unknown payment, retest, or
        completion status; {report.excludedRecords} records were excluded as unpaid, refunded, free
        retests, voided, cancelled, or incomplete.
      </p>
      <p className="muted">
        Import review: {report.coverage.unresolvedRecords} unresolved and{" "}
        {report.coverage.rejectedRecords} rejected rows in the available lookback scope are not
        included in canonical metrics.
      </p>
      <details>
        <summary>How this rate is calculated</summary>
        <p className="muted">
          Returning means a qualifying inspection before this period began, at any selected station.
          Repeat visits within this period count once and cannot make a first-observed vehicle
          returning. First observed in available history does not mean a first-ever visit.
        </p>
        <p className="muted">
          Unmatched records are excluded from the rate denominator and cannot be deduplicated into a
          reliable vehicle count. Identification coverage is {report.identifiedRecords}/
          {report.qualifyingRecords} qualifying inspection records. {report.plateMatchedRecords}{" "}
          records use lower-confidence, unambiguous plate/state matching; invalid VINs never fall
          back to plates.
        </p>
        <p className="muted">
          Reconciliation describes the exported scope. It does not prove the provider retains all
          older history. Employee focus, when selected in Performance, filters current-period
          attributed records; earlier visits are checked across the selected station scope.
        </p>
      </details>
    </section>
  );
}
