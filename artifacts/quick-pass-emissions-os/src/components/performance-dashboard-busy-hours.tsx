import type { ReactNode } from "react";
import type { BusyHours } from "@/modules/station/dashboard-types";

export const clockHour = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;

export function PerformanceBusyHours({
  data,
  filtered,
  panelActions,
}: {
  data: BusyHours;
  filtered: boolean;
  panelActions?: ReactNode;
}) {
  return (
    <section className="pd-card" aria-label="Busy hours">
      <div className="pd-card-h">
        <div className="pd-card-title">
          <h2>Busy hours</h2>
          <p>{filtered ? "Selected employee" : "Station"} · selected dates · report clock hours</p>
          {panelActions}
        </div>
      </div>
      <div className="pd-panel-content">
        {!data.linked || (data.observedTests === 0 && !data.complete) ? (
          <div className="pd-panel-empty">
            <strong>{data.linked ? "No hourly data" : "Employee not linked"}</strong>
            <p>
              {data.linked
                ? "Load a report with inspection times to see busy hours. Missing times are not zero tests."
                : "Link this employee to a report inspector in Pay setup to see their hours."}
            </p>
          </div>
        ) : (
          <>
            <div className="pd-panel-metrics">
              <div>
                <span>Tests with times</span>
                <strong data-testid="text-busy-tests">{data.observedTests}</strong>
              </div>
              <div>
                <span>{data.complete ? "Busiest hour" : "Busiest observed hour"}</span>
                <strong data-testid="text-busy-peak">
                  {data.peakHours.length ? data.peakHours.map(clockHour).join(" · ") : "No tests"}
                </strong>
                {data.peakCount !== null && data.peakCount > 0 && (
                  <small>
                    {data.peakCount} tests{data.peakHours.length > 1 ? " in each tied hour" : ""}
                  </small>
                )}
              </div>
            </div>
            <ol className="pd-hour-chart" aria-label="Counted tests by report hour">
              {data.hours.map(({ hour, count }) => (
                <li
                  key={hour}
                  title={`${clockHour(hour)}: ${count === null ? "Unknown" : `${data.complete ? "" : "At least "}${count} tests`}`}
                >
                  <span className="sr-only">
                    {clockHour(hour)}:{" "}
                    {count === null
                      ? "Unknown"
                      : `${data.complete ? "" : "At least "}${count} tests`}
                  </span>
                  <div
                    className={`pd-hour-column ${count === null ? "unknown" : ""}`}
                    aria-hidden="true"
                  >
                    {count !== null && (
                      <span
                        style={{
                          height: `${data.peakCount ? (count / data.peakCount) * 100 : 0}%`,
                        }}
                      />
                    )}
                  </div>
                  <small aria-hidden="true">{hour % 6 === 0 ? clockHour(hour) : ""}</small>
                </li>
              ))}
            </ol>
          </>
        )}
        <p className="pd-panel-note">
          {data.timedDays}/{data.expectedDays} loaded days have complete timing.
          {data.untimedTests > 0 && ` ${data.untimedTests} counted tests have no usable time.`}
          {!data.complete && " Partial coverage; unobserved hours are unknown."} Free retests
          excluded. Loaded reports only; not a forecast.
        </p>
      </div>
    </section>
  );
}
