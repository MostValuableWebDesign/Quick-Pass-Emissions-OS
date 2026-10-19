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
          <span>First observed in available history</span>
          <strong data-testid="first-observed-count">{report.firstObserved}</strong>
        </div>
        <div>
          <span>Unknown classification / unmatched records</span>
          <strong>{report.unmatchedRecords + report.unknownStatusRecords}</strong>
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
        className={
          report.coverage.pending || report.coverage.partial || report.coverage.missingMonths
            ? "notice warning"
            : "muted"
        }
        role="status"
      >
        {report.coverage.label}
      </p>
      <p>
        Available VIR dates:{" "}
        {report.historyStart
          ? `${report.historyStart} – ${report.historyEnd}`
          : "No inspection history"}
        . {report.coverage.completed}/{report.coverage.windows} windows reconciled;{" "}
        {report.coverage.unverified} without source totals. Unverified station/months:{" "}
        {report.coverage.missingMonths}. Gaps remain unknown.
      </p>
      <p className="muted">
        {report.identifiableVehicles} distinct identifiable vehicles had completed, explicitly paid
        initial inspections. {report.unknownStatusRecords} records have unknown payment, retest, or
        completion status; {report.excludedRecords} records were excluded as unpaid, refunded, known
        retests, voided, cancelled, or incomplete.
      </p>
      <p className="muted">
        Extraction review: {report.coverage.unresolvedRecords} unresolved and{" "}
        {report.coverage.rejectedRecords} failed rows; {report.coverage.identityReview} identifier
        reviews in the available lookback scope are kept separate from confirmed identity matches.
      </p>
      {report.coverage.gaps.length > 0 && (
        <details>
          <summary>Unverified station/month coverage ({report.coverage.gaps.length})</summary>
          <p className="muted">
            Each listed month contains unretrieved dates or unfinished extraction. Missing months
            are not zero inspections.
          </p>
          <ul>
            {report.coverage.gaps.map((g) => (
              <li key={`${g.stationHash}:${g.start}`}>
                {g.start} – {g.end} · station {g.stationHash.slice(0, 8)}
              </li>
            ))}
          </ul>
        </details>
      )}
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
