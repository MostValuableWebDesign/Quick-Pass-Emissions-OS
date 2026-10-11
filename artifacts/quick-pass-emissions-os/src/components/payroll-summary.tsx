import { RecordLink } from "./record-link";
import { ActionForm, Field } from "./action-form";
import { PayrollPagination } from "./payroll-pagination";
import { adjustCompensation } from "@/app/phase2-actions";
import { formatMoney } from "@/modules/payroll/calculations";
import type { payrollDashboard } from "@/modules/payroll/dashboard";
type Dashboard = Awaited<ReturnType<typeof payrollDashboard>>;
const money = (n: number | null) => (n === null ? "Unavailable" : formatMoney(n));
export function PayrollSummary({
  data,
  owner,
  href,
}: {
  data: Dashboard;
  owner: boolean;
  href: (key: string, page: number) => string;
}) {
  return (
    <section className="card space-top" aria-label="Employee pay overview">
      <div className="card-heading">
        <h2>Employee pay overview</h2>
      </div>
      <form action="/payroll" method="get" className="card-body">
        <Field label="Pay overview date">
          <input name="date" type="date" defaultValue={data.filter.date} required />
        </Field>
        <Field label="Payroll display week starts">
          <select name="weekStart" defaultValue={data.filter.weekStart}>
            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
              (day, i) => (
                <option key={day} value={i + 1}>
                  {day}
                </option>
              ),
            )}
          </select>
        </Field>
        <button className="button" type="submit">
          View pay week
        </button>
      </form>
      <p className="card-body muted">
        Daily: {data.filter.date} · Week: {data.week.start} — {data.week.end}. Base amounts below
        are configured rates/equivalents, not proof of hours worked or payment. Weekly commission is
        the subtotal of approved daily records in this week; averages include approved zero days and
        exclude missing or pending days. No records means unavailable.
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
              <th>Commission · daily / weekly</th>
              <th>Average commission / approved day</th>
              <th>Commission rate</th>
              <th>Latest approved payroll</th>
              {owner && <th>Adjust pay</th>}
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
                  <small>
                    {e.arrangement
                      ? `${formatMoney(e.arrangement.amountCents)} · ${e.arrangement.kind.toLowerCase()} · from ${e.arrangement.effectiveDate}`
                      : "Owner configuration required"}
                  </small>
                  {e.arrangement?.scheduledDaysPerWeek && (
                    <small>
                      {e.arrangement.scheduledDaysPerWeek} configured days/week
                      {e.arrangement.scheduledMinutesPerDay
                        ? ` · ${e.arrangement.scheduledMinutesPerDay} minutes/day`
                        : ""}
                    </small>
                  )}
                  {e.arrangement?.kind === "FIXED" && (
                    <small>
                      Fixed amount covers its entire payroll period; daily/weekly equivalents are
                      unavailable.
                    </small>
                  )}
                </td>
                <td>
                  {money(e.commission.daily)} / {money(e.commission.weekly)}
                  <small>
                    {e.commission.approvedDays} approved day(s) · {e.commission.pendingDays}{" "}
                    awaiting approval
                  </small>
                  {e.commission.missingPolicies > 0 && (
                    <small>
                      Missing/unsupported policy for {e.commission.missingPolicies} approved day(s)
                    </small>
                  )}
                </td>
                <td>
                  {money(e.commission.average)}
                  <small>Across {e.commission.approvedDays} approved day(s) this week</small>
                </td>
                <td>
                  {e.policy ? (
                    e.policy.eligible ? (
                      <>
                        {formatMoney(e.policy.rateCents)} / test above {e.policy.threshold}
                        <small>
                          {e.policy.volumeThreshold !== null
                            ? `Above ${e.policy.volumeThreshold} tests/day: add ${formatMoney(e.policy.volumeIncreaseCents!)} per further test`
                            : "No volume boost configured"}
                        </small>
                      </>
                    ) : (
                      "Not eligible"
                    )
                  ) : (
                    "Owner configuration required"
                  )}
                </td>
                <td>
                  {e.approvedPayroll ? (
                    <>
                      <strong>{formatMoney(e.approvedPayroll.totalCents)} gross</strong>
                      <small>
                        Base {formatMoney(e.approvedPayroll.baseCents)} · Commission{" "}
                        {formatMoney(e.approvedPayroll.commissionCents)}
                      </small>
                      <RecordLink href={`/payroll/${e.approvedPayroll.draft.period.id}`}>
                        {e.approvedPayroll.draft.period.label}
                      </RecordLink>
                      <small>
                        {e.approvedPayroll.draft.period.startDate} —{" "}
                        {e.approvedPayroll.draft.period.endDate}
                      </small>
                    </>
                  ) : (
                    "No approved payroll"
                  )}
                </td>
                {owner && (
                  <td>
                    <details>
                      <summary>Adjust {e.name}</summary>
                      {(
                        [
                          { target: "BASE", previous: e.arrangement },
                          { target: "COMMISSION", previous: e.policy },
                        ] as const
                      ).map(
                        ({ target, previous }) =>
                          previous && (
                            <ActionForm
                              key={target}
                              action={adjustCompensation}
                              submit={`Apply ${target.toLowerCase()} percentage adjustment`}
                            >
                              <input name="employeeId" type="hidden" value={e.id} />
                              <input name="expectedId" type="hidden" value={previous.id} />
                              <input name="target" type="hidden" value={target} />
                              <Field
                                label={`${target === "BASE" ? "Base pay" : "Commission rate"} adjustment`}
                              >
                                <select name="direction">
                                  <option value="INCREASE">Increase</option>
                                  <option value="DECREASE">Decrease</option>
                                </select>
                              </Field>
                              <Field label="Percentage · 10 means 10%">
                                <input
                                  name="percent"
                                  type="number"
                                  min="0.01"
                                  max="10000"
                                  step="0.01"
                                  required
                                />
                              </Field>
                              <Field label="Adjustment effective date">
                                <input
                                  name="effectiveDate"
                                  type="date"
                                  min={previous.effectiveDate}
                                  required
                                />
                              </Field>
                              <Field label="Adjustment reason">
                                <textarea name="reason" maxLength={2000} required />
                              </Field>
                              {target === "COMMISSION" && (
                                <p className="muted">
                                  Changes the base per-test commission rate. The volume boost and
                                  threshold stay as configured. Set exact rates and boosts below.
                                </p>
                              )}
                            </ActionForm>
                          ),
                      )}
                      {!e.arrangement && !e.policy && (
                        <p>Authorize the first pay arrangement and commission policy below.</p>
                      )}
                    </details>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.employees.length && (
        <p className="card-body muted">Create staff records to configure their pay.</p>
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
