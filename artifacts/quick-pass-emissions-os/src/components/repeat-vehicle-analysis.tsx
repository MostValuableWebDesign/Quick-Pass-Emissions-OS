import type { RepeatVehicleAnalysis as Analysis } from "@/modules/station/repeat-vehicle-analysis";
import type { DashboardQuery } from "@/modules/station/dashboard-types";
import { VehicleRetentionMetrics } from "./vehicle-retention-metrics";
import "./inspection-history.css";

function NumberMetric({ label, value, tip }: { label: string; value: number; tip?: string }) {
  return (
    <div>
      <span title={tip}>
        {label}
        {tip && <span className="sr-only"> ({tip})</span>}
      </span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

export function RepeatVehicleAnalysis({
  report,
  pendingDates,
  incompleteDates,
  query,
}: {
  report: Analysis;
  pendingDates: number;
  incompleteDates: number;
  query?: DashboardQuery;
}) {
  const pending = pendingDates > 0 || incompleteDates > 0 || report.classificationUnknownDates > 0;
  const noHistory = report.identifiedInspections === 0 && pending;
  return (
    <section
      className="card card-body history-report"
      aria-label="Repeat vehicle history"
      data-testid="repeat-vehicle-history"
    >
      <div className="history-heading">
        <div>
          <p className="eyebrow">
            VEHICLE HISTORY · {query?.trendDays === "all" ? "ALL TIME" : "TREND TIMEFRAME"}
          </p>
          <h2>Repeat-vehicle analysis</h2>
        </div>
      </div>
      <p className="muted">
        {report.start} – {report.end} · all inspectors · based on loaded Performance reports
      </p>
      {noHistory ? (
        <p role="status">
          No vehicle history is loaded yet. Use Refresh panels above to retrieve the selected source
          history.
        </p>
      ) : (
        <>
          <div className="history-metrics">
            <NumberMetric
              label="Recorded repeat vehicles · includes retests"
              value={report.repeatVehicles}
              tip="Physical repeat inspections, including free retests. This is not a count of returning customers; qualifying retention below excludes free retests."
            />
            <NumberMetric label="Distinct VIN-matched vehicles" value={report.distinctVehicles} />
            <NumberMetric
              label="Repeat inspections"
              value={report.repeatVisits}
              tip="Recorded physical inspections beyond each vehicle's first, including retests. Distinct from the qualifying retention metrics below, which exclude free retests."
            />
          </div>
          <p className={pending ? "notice warning" : "muted"} role="status">
            {pending
              ? "Preliminary · Some source dates or rows are incomplete; totals may change after retrieval."
              : "Based on the loaded report history."}
          </p>
        </>
      )}
      {report.retention && query && (
        <VehicleRetentionMetrics report={report.retention} query={query} />
      )}
      <p className="muted">
        Vehicles are matched using privacy-protected VIN hashes; this does not identify customer
        names. The recorded-report summary includes retests. Returning-vehicle metrics exclude
        explicit free retests and same-VIN inspections within 30 calendar days of the previous
        inspection. Returns after 30 days can qualify; reports do not prove payment.
      </p>
    </section>
  );
}
