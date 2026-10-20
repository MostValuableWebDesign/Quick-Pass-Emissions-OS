import type { RepeatVehicleAnalysis as Analysis } from "@/modules/station/repeat-vehicle-analysis";
import "./inspection-history.css";

function NumberMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

export function RepeatVehicleAnalysis({
  report,
  pendingDates,
  incompleteDates,
}: {
  report: Analysis;
  pendingDates: number;
  incompleteDates: number;
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
          <p className="eyebrow">VEHICLE HISTORY · ALL TIME</p>
          <h2>Repeat-vehicle analysis</h2>
        </div>
      </div>
      <p className="muted">
        {report.start} – {report.end} · all inspectors · based on loaded Performance reports
      </p>
      {noHistory ? (
        <p role="status">
          No vehicle history is loaded yet. Use Refresh panels above to retrieve the All Time source
          history.
        </p>
      ) : (
        <>
          <div className="history-metrics">
            <NumberMetric label="Vehicles tested more than once" value={report.repeatVehicles} />
            <NumberMetric label="Distinct VIN-matched vehicles" value={report.distinctVehicles} />
            <NumberMetric label="Repeat inspections" value={report.repeatVisits} />
          </div>
          <p className={pending ? "notice warning" : "muted"} role="status">
            {pending
              ? "Preliminary · Some source dates or rows are incomplete; totals may change after retrieval."
              : "Based on the loaded report history."}
          </p>
        </>
      )}
      <p className="muted">
        Vehicles are matched using privacy-protected VIN hashes; this does not identify customer
        names. Repeat classification follows the 30-day free-retest rule.
      </p>
    </section>
  );
}
