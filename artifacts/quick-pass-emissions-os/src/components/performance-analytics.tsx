import type { performance } from "@/modules/station/performance";
import { Badge, usd } from "./phase5";
import { Empty } from "./shared";
import { Section } from "./station-ui";
type Performance = Awaited<ReturnType<typeof performance>>;
const decimal = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const hourLabel = (hour: number) => `${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`;
export function TestBreakdown({ data }: { data: Performance }) {
  const total = data.stationRecorded;
  return (
    <Section
      title="Test breakdown"
      note="Station-wide source outcomes. Pass, Fail and Abort do not automatically determine commission eligibility or payment."
    >
      {data.breakdown.length ? (
        <div className="card-body">
          {data.breakdown.map((r) => (
            <div className="performance-breakdown" key={r.outcome}>
              <div>
                <strong>{r.outcome}</strong>
                <span>
                  {r.confirmed} confirmed · {r.pending} pending
                </span>
              </div>
              <div className="performance-track">
                <span style={{ width: `${total ? (r.confirmed / total) * 100 : 0}%` }} />
              </div>
              <small>
                {total
                  ? `${decimal((r.confirmed / total) * 100)}% of confirmed records`
                  : "No confirmed records"}
              </small>
            </div>
          ))}
          <p className="muted">
            {total} confirmed records; {data.stationPending} pending identities excluded from
            percentages. Partial coverage does not establish the station&apos;s complete test total.
          </p>
        </div>
      ) : (
        <Empty
          title="No recorded outcomes"
          text="No report rows for this range; this does not prove zero tests."
        />
      )}
    </Section>
  );
}
export function DailyTrends({ data }: { data: Performance }) {
  const { trends, priorTrends: prior, comparison: comparison } = data;
  const max = Math.max(1, ...trends.days.map((d) => d.confirmed));
  return (
    <Section
      title="Daily trends"
      note="Station-wide confirmed report records by inclusive business date. Hatched rows have missing data; amber bars are incomplete."
    >
      <div className="card-body">
        <div className="performance-comparison">
          <div>
            <small>Selected period</small>
            <strong>
              {trends.start} — {trends.end}
            </strong>
            <span>
              {trends.coveredDays} / {trends.openDays} open days covered ·{" "}
              {decimal(trends.testsPerHour)} tests/open hour
            </span>
          </div>
          <div>
            <small>Preceding equal-length period</small>
            <strong>{prior ? `${prior.start} — ${prior.end}` : "Outside supported dates"}</strong>
            <span>
              {prior
                ? `${prior.coveredDays} / ${prior.openDays} open days covered · ${decimal(prior.testsPerHour)} tests/open hour`
                : "Comparison unavailable"}
            </span>
          </div>
        </div>
        {comparison.ready ? (
          <p className="performance-comparison-result">
            Confirmed count change: {comparison.countChange! > 0 ? "+" : ""}
            {comparison.countChange}. Rate change: {comparison.rateChange! > 0 ? "+" : ""}
            {decimal(comparison.rateChange)} tests/open hour
            {comparison.percentRateChange !== null
              ? ` (${comparison.percentRateChange > 0 ? "+" : ""}${decimal(comparison.percentRateChange)}%)`
              : "; percentage unavailable because the preceding rate is zero"}
            .
          </p>
        ) : (
          <p className="notice warning">Comparison unavailable</p>
        )}
        <p className="muted">{comparison.reason}</p>
        <div className="performance-daily-bars" aria-label="Daily confirmed test chart">
          {trends.days.map((d) => (
            <div className="performance-day" key={d.date}>
              <span>{d.date}</span>
              <div
                className={`performance-track${d.displayedCount === null ? " unknown" : ""}${!d.complete ? " partial" : ""}`}
              >
                <span style={{ width: `${(d.confirmed / max) * 100}%` }} />
              </div>
              <strong>{d.displayedCount ?? "—"}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Confirmed</th>
              <th>Pending</th>
              <th>Coverage</th>
              <th>Configured open hours</th>
              <th>Tests/open hour</th>
            </tr>
          </thead>
          <tbody>
            {trends.days.map((d) => (
              <tr key={d.date}>
                <td>{d.date}</td>
                <td>{d.displayedCount ?? "Unknown"}</td>
                <td>{d.pending}</td>
                <td>
                  <Badge tone={d.complete ? "green" : "amber"}>{d.status}</Badge>
                </td>
                <td>{d.minutes === null ? "Unknown" : decimal(d.minutes / 60)}</td>
                <td>{decimal(d.testsPerHour)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
export function HourlyTrends({ data }: { data: Performance }) {
  const max = Math.max(1, ...data.trends.hours.map((h) => h.confirmed));
  return (
    <Section
      title="Hourly trends"
      note="Station-wide counts grouped by the report's local clock hour across all selected dates. No hourly productivity or wage allocation is inferred."
    >
      <div className="card-body">
        <p className="muted">
          Reports have no offset: repeated fall-back hours are combined and no UTC instant is
          invented. Empty buckets are unknown until the full range and every source time are
          covered. Counts include the whole selected dates, not a live cutoff.
        </p>
        <div
          className="performance-hours"
          role="img"
          aria-label="Confirmed tests by source local hour; exact counts and missing-time records are in the table below"
        >
          {data.trends.hours.map((h) => (
            <div className="performance-hour" key={h.hour} aria-hidden="true">
              <strong>{h.displayedCount ?? "—"}</strong>
              <div className={`hour-track${h.displayedCount === null ? " unknown" : ""}`}>
                <span style={{ height: `${(h.confirmed / max) * 100}%` }} />
              </div>
              <small>{hourLabel(h.hour)}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Source local hour</th>
              <th>Confirmed recorded</th>
              <th>Pending</th>
            </tr>
          </thead>
          <tbody>
            {data.trends.hours.map((h) => (
              <tr key={h.hour}>
                <td>
                  {hourLabel(h.hour)} — {hourLabel((h.hour + 1) % 24)}
                </td>
                <td>{h.displayedCount ?? "Unknown"}</td>
                <td>{h.pending}</td>
              </tr>
            ))}
            <tr>
              <td>Time unavailable</td>
              <td>{data.trends.withoutTime.confirmed}</td>
              <td>{data.trends.withoutTime.pending}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Section>
  );
}
export function EmployeePerformance({ data }: { data: Performance }) {
  return (
    <Section
      title="Employee performance"
      note="Attributed station activity and payroll evidence are distinct. Daily thresholds are applied per employee/day; station tests never become approved payroll automatically."
    >
      {data.employeePerformance.length ? (
        <>
          <p className="card-body muted">
            Commission is a subtotal of recorded approved days, using frozen daily evidence inside
            approved periods. It is withheld when a recorded day lacks approval/policy. Missing
            dates are not inferred. Base/gross cover whole contained actual pay periods once;
            partial periods are not prorated. Full period details remain below.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Station confirmed / pending</th>
                  <th>Station eligible</th>
                  <th>Approved payroll test counts</th>
                  <th>Recorded-day commission</th>
                  <th>Contained-period base</th>
                  <th>Contained-period gross</th>
                  <th>Pay status / missing inputs</th>
                </tr>
              </thead>
              <tbody>
                {data.employeePerformance.map((r) => (
                  <tr key={r.employeeId}>
                    <td>
                      <strong>{r.name}</strong>
                    </td>
                    <td>
                      {r.confirmed} / {r.pending}
                    </td>
                    <td>
                      {r.eligible}
                      {r.unresolvedEligibility > 0 && (
                        <small>{r.unresolvedEligibility} eligibility unresolved</small>
                      )}
                    </td>
                    <td>
                      {r.approvedCounts ?? "No approved daily evidence"}
                      <small>
                        {r.recordedPayDays} recorded days · {r.unapprovedDays} unapproved
                      </small>
                    </td>
                    <td>
                      {r.commissionCents === null
                        ? "Incomplete / unavailable"
                        : usd(r.commissionCents)}
                      <small>{r.commissionBasis}</small>
                      {r.missingPolicyDays > 0 && (
                        <small>{r.missingPolicyDays} days missing commission policy</small>
                      )}
                    </td>
                    <td>{r.baseCents === null ? "Not allocated" : usd(r.baseCents)}</td>
                    <td>{r.grossCents === null ? "Not allocated" : usd(r.grossCents)}</td>
                    <td>
                      <Badge tone={r.status === "Approved payroll snapshots" ? "green" : "amber"}>
                        {r.status}
                      </Badge>
                      <small>
                        {r.approvedPeriods} / {r.periodCount} periods approved
                        {r.partialPeriods ? ` · ${r.partialPeriods} partial overlaps` : ""}
                      </small>
                      {r.missing.map((m) => (
                        <small key={m}>Missing: {m}</small>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.groups.some((g) => !g.employeeId) && (
            <p className="card-body notice warning">
              Unmapped inspector groups remain in Station groups; they are not assigned to an
              employee or used for employee pay.
            </p>
          )}
        </>
      ) : (
        <Empty
          title="No employees in this scope"
          text="Configure staff attribution and independently approved payroll inputs before comparing employee evidence."
        />
      )}
    </Section>
  );
}
