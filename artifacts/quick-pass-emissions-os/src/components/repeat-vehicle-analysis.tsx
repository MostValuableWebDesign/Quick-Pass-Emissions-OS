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
  const retention = report.retention && query;
  const noHistory = report.identifiedInspections === 0 && pending && !retention;
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00Z`));
  const start = report.retention?.start ?? report.start;
  const end = report.retention?.end ?? report.end;
  return (
    <section
      className="card card-body history-report"
      aria-label="Repeat vehicle history"
      data-testid="repeat-vehicle-history"
    >
      <div className="history-heading">
        <div>
          <h2>Vehicle history</h2>
        </div>
        <span className="muted">
          {dateLabel(start)}
          {start !== end && ` – ${dateLabel(end)}`}
        </span>
      </div>
      {noHistory ? (
        <p role="status">
          No vehicle history saved for these dates. Refresh panels to retrieve it.
        </p>
      ) : !retention ? (
        <>
          <div className="history-metrics">
            <NumberMetric
              label="Vehicles in saved reports"
              value={report.distinctVehicles}
              tip="Distinct VINs in the loaded reports. Return analysis is not yet available."
            />
          </div>
          <p className={pending ? "notice warning" : "muted"} role="status">
            {pending
              ? "Incomplete data · Some reports still need to be loaded or checked."
              : "Return analysis is not available for these dates."}
          </p>
        </>
      ) : null}
      {report.retention && query && (
        <VehicleRetentionMetrics report={report.retention} query={query} />
      )}
    </section>
  );
}
