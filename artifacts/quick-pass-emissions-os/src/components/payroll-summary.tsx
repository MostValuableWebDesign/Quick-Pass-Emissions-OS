import { RecordLink } from "./record-link";
import { Field } from "./action-form";
import { PayrollPagination } from "./payroll-pagination";
import { formatMoney } from "@/modules/payroll/calculations";
import type { payrollDashboard } from "@/modules/payroll/dashboard";
type Dashboard = Awaited<ReturnType<typeof payrollDashboard>>;
const money = (n: number | null) => (n === null ? "Unavailable" : formatMoney(n));
export function PayrollSummary({
  data,
  href,
}: {
  data: Dashboard;
  href: (key: string, page: number) => string;
}) {
  return (
    <section className="card space-top" aria-label="Employee pay overview">
      <div className="card-heading">
        <h2>Employee pay overview</h2>
      </div>
      <form action="/payroll" method="get" className="card-body filter-form">
        <Field label="Pay overview date">
          <input name="date" type="date" defaultValue={data.filter.date} required />
        </Field>
        <input name="weekStart" type="hidden" value={data.filter.weekStart} />
        <button className="button button-primary" type="submit">
          View pay week
        </button>
      </form>
      <p className="card-body muted">
        Day: {data.filter.date} · Week: {data.week.start} — {data.week.end}
      </p>
      <PayrollPagination
        label="Employees"
        paging={data.employeesPaging}
        href={(page) => href("employeesPage", page)}
      />
      <div className="table-scroll">
        <table aria-label="Employee pay summary">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Base pay · daily / weekly</th>
              <th>Recorded commission · daily / weekly</th>
              <th>Average daily recorded commission</th>
              <th>Commission rate</th>
            </tr>
          </thead>
          <tbody>
            {data.employees.map((e) => (
              <tr key={e.id}>
                <td>
                  <RecordLink href={`/employees/${e.id}`}>{e.name}</RecordLink>
                  {!e.active && <small>Inactive</small>}
                </td>
                <td>
                  <strong>
                    {money(e.base.daily)} / {money(e.base.weekly)}
                  </strong>
                  {e.arrangement && (
                    <small>
                      {formatMoney(e.arrangement.amountCents)} · {e.arrangement.kind.toLowerCase()} ·
                      from {e.arrangement.effectiveDate}
                    </small>
                  )}
                  {e.arrangement?.scheduledDaysPerWeek && (
                    <small>
                      {e.arrangement.scheduledDaysPerWeek} days/week
                      {e.arrangement.scheduledMinutesPerDay
                        ? ` · ${e.arrangement.scheduledMinutesPerDay} minutes/day`
                        : ""}
                    </small>
                  )}
                </td>
                <td>
                  {money(e.commission.daily)} / {money(e.commission.weekly)}
                </td>
                <td>
                  {money(e.commission.average)}
                  {e.commission.average !== null && (
                    <small>Across {e.commission.approvedDays} recorded days this week</small>
                  )}
                </td>
                <td>
                  {e.policy ? (
                    e.policy.eligible ? (
                      <>
                        {formatMoney(e.policy.rateCents)} / test above {e.policy.threshold}
                        {e.policy.volumeThreshold !== null && (
                          <small>
                            Above {e.policy.volumeThreshold} tests/day: add{" "}
                            {formatMoney(e.policy.volumeIncreaseCents!)} per further test
                          </small>
                        )}
                      </>
                    ) : (
                      "Not eligible"
                    )
                  ) : (
                    "Unavailable"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.employees.length && (
        <p className="card-body muted">No employees to display.</p>
      )}
    </section>
  );
}
export function PayrollHistory({
  data,
  names,
  href,
}: {
  data: Dashboard;
  names: Record<string, string>;
  href: (page: number) => string;
}) {
  return (
    <section className="card space-top" aria-label="Pay transaction history">
      <div className="card-heading">
        <h2>Pay transaction history</h2>
      </div>
      <p className="card-body muted">
        Every saved pay/commission change, count entry/correction, approval and payroll action
        retains its dated audit record. Approved payroll is a preparation record; it does not
        confirm money was paid.
      </p>
      <PayrollPagination label="Transactions" paging={data.historyPaging} href={href} />
      <div className="table-scroll">
        <table aria-label="Pay transactions">
          <thead>
            <tr>
              <th>Recorded / by</th>
              <th>Transaction</th>
              <th>Employee / effective date</th>
              <th>Record</th>
            </tr>
          </thead>
          <tbody>
            {data.history.map((h) => {
              const details =
                h.details && typeof h.details === "object" && !Array.isArray(h.details)
                  ? h.details
                  : {};
              const after =
                details.after && typeof details.after === "object" && !Array.isArray(details.after)
                  ? details.after
                  : {};
              const employeeId =
                typeof details.employeeId === "string"
                  ? details.employeeId
                  : typeof after.employeeId === "string"
                    ? after.employeeId
                    : null;
              const employee = employeeId ? (names[employeeId] ?? employeeId) : "See record";
              const amount =
                typeof details.amountCents === "number"
                  ? details.amountCents
                  : typeof details.rateCents === "number"
                    ? details.rateCents
                    : typeof details.totalCents === "number"
                      ? details.totalCents
                      : null;
              return (
                <tr key={h.id}>
                  <td>
                    {h.createdAt.toLocaleString("en-US", { timeZone: "America/New_York" })} ET
                    <small>{h.actor?.name ?? "System"}</small>
                  </td>
                  <td>{h.action.toLowerCase().replaceAll("_", " ")}</td>
                  <td>
                    {employee}
                    <small>
                      {typeof details.effectiveDate === "string"
                        ? details.effectiveDate
                        : typeof details.date === "string"
                          ? details.date
                          : ""}
                    </small>
                  </td>
                  <td>
                    {amount !== null && (
                      <strong>
                        {formatMoney(amount)}
                        {typeof details.totalCents === "number"
                          ? " gross"
                          : typeof details.rateCents === "number"
                            ? " / qualifying test"
                            : typeof details.kind === "string"
                              ? ` · ${details.kind.toLowerCase()}`
                              : ""}
                      </strong>
                    )}
                    {typeof details.periodId === "string" && (
                      <small>
                        <RecordLink href={`/payroll/${details.periodId}`}>
                          View payroll period
                        </RecordLink>
                      </small>
                    )}
                    {typeof details.reason === "string" ? (
                      <p>{details.reason}</p>
                    ) : typeof after.reason === "string" ? (
                      <p>{after.reason}</p>
                    ) : null}
                    <details>
                      <summary>View transaction record</summary>
                      <pre className="audit-details">{JSON.stringify(h.details, null, 2)}</pre>
                      <small>Record ID: {h.entityId}</small>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!data.history.length && <p className="card-body muted">No pay transactions recorded.</p>}
    </section>
  );
}
