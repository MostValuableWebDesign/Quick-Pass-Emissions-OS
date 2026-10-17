import { Temporal } from "@js-temporal/polyfill";
import { requireRole } from "@/lib/require-role";
import { businessDate } from "@/lib/time";
import { PageHeader } from "@/components/shared";
import { InspectionHistory } from "@/components/inspection-history";
import { ReturningVehicles } from "@/components/returning-vehicles";
import { listHistory } from "@/modules/station/history/service";
import { readReturningVehicles } from "@/modules/station/history/report";
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole(["OWNER"]),
    q = await searchParams,
    today = businessDate();
  const earliest = Temporal.PlainDate.from(today).subtract({ years: 2 }).toString();
  const initial = await listHistory(actor.id, typeof q.job === "string" ? q.job : undefined);
  const start = typeof q.start === "string" ? q.start : `${today.slice(0, 7)}-01`,
    end = typeof q.end === "string" ? q.end : today;
  const selected = q.station
    ? Array.isArray(q.station)
      ? q.station
      : [q.station]
    : initial.stations.slice(0, 1).map((s) => s.stationHash);
  let report, error;
  if (selected.length)
    try {
      report = await readReturningVehicles(actor.id, { start, end, stations: selected });
    } catch {
      error = "Choose valid dates in the last two years and authorized stations.";
    }
  return (
    <>
      <PageHeader
        title="Inspection history"
        description="Owner-controlled historical imports and returning-vehicle evidence. No paid scheduler or background worker."
      />
      <form
        method="get"
        className="card card-body history-report-filters"
        aria-label="Returning vehicle report filters"
      >
        {initial.selected && <input type="hidden" name="job" value={initial.selected.id} />}
        <label>
          From
          <input
            type="date"
            name="start"
            defaultValue={start}
            min={earliest}
            max={today}
            required
          />
        </label>
        <label>
          Through
          <input type="date" name="end" defaultValue={end} min={earliest} max={today} required />
        </label>
        <fieldset>
          <legend>Reporting stations</legend>
          {initial.stations.map((s) => (
            <label className="history-check" key={s.stationHash}>
              <input
                type="checkbox"
                name="station"
                value={s.stationHash}
                defaultChecked={selected.includes(s.stationHash)}
              />
              {s.name}
            </label>
          ))}
        </fieldset>
        <button className="button button-primary">Apply report filters</button>
      </form>
      {error && (
        <p className="notice warning" role="alert">
          {error}
        </p>
      )}
      {report && <ReturningVehicles report={report} />}
      <InspectionHistory initial={initial} today={today} earliest={earliest} />
    </>
  );
}
