import { RecordLink } from "@/components/record-link";
import Link from "next/link";
import { currentUser } from "@/lib/access";
import { businessDate } from "@/lib/time";
import { payrollOverview } from "@/modules/payroll/service";
import { approvalRoles } from "@/modules/phase2";
import { dashboardInput, payrollDashboard } from "@/modules/payroll/dashboard";
import { PayrollSummary, PayrollHistory } from "@/components/payroll-summary";
import { PayrollPagination } from "@/components/payroll-pagination";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import {
  savePayArrangement,
  saveCommissionPolicy,
  saveEmission,
  importEmissionRows,
  correctEmission,
  approveEmission,
  createPayrollPeriod,
} from "@/app/phase2-actions";
export default async function Payroll({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    status?: string;
    periodId?: string;
    date?: string;
    weekStart?: string;
    employeesPage?: string;
    historyPage?: string;
    periodsPage?: string;
  }>;
}) {
  const actor = await currentUser();
  const params = await searchParams;
  const data = await payrollOverview(actor.id, params);
  const parsed = dashboardInput.safeParse(params);
  const dashboard = await payrollDashboard(actor.id, parsed.success ? parsed.data : {});
  const href = (key: string, page: number) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
    query.set(key, String(page));
    return `/payroll?${query}`;
  };
  const review = data.countReview;
  const reviewHref = (page: number) => href("page", page);
  const today = businessDate();
  const approver = approvalRoles.includes(actor.role);
  const employees = data.employees.map((e) => (
    <option key={e.id} value={e.id}>
      {e.user.name}
      {!e.user.active && " · inactive"}
    </option>
  ));
  return (
    <>
      <PageHeader
        title="Payroll & commissions"
        description="Employee daily and weekly base pay, approved commissions, pay adjustments and transaction history."
      />
      {data.employees.some((e) => e.demo) && (
        <div className="notice warning">
          DEMONSTRATION WORKSPACE · Illustrative payroll and stock records. These are not actual
          business records.
        </div>
      )}
      <p className="notice">
        Approval requires a different manager or owner. This workspace prepares payroll records;
        send approved exports to your established payroll processor.
      </p>
      {!parsed.success && (
        <p className="notice warning">
          Choose a valid pay overview date, week start and page. Showing the current week.
        </p>
      )}
      <PayrollSummary data={dashboard} owner={actor.role === "OWNER"} href={href} />
      <PayrollHistory
        data={dashboard}
        names={Object.fromEntries(data.employees.map((e) => [e.id, e.user.name]))}
        href={(page) => href("historyPage", page)}
      />
      <div className="two-columns space-top">
        <section className="card card-body">
          <h2>Payroll periods</h2>
          <ActionForm action={createPayrollPeriod} submit="Create payroll period">
            <Field label="Period label">
              <input name="label" maxLength={160} required />
            </Field>
            <Field label="Period start">
              <input type="date" name="startDate" required />
            </Field>
            <Field label="Period end · inclusive">
              <input type="date" name="endDate" required />
            </Field>
          </ActionForm>
          {dashboard.periods.map((p) => (
            <div className="list-row" key={p.id}>
              <RecordLink className="task-name" href={`/payroll/${p.id}`}>
                {p.label}
              </RecordLink>
              <span>
                {p.startDate} — {p.endDate}
              </span>
              <span className="badge neutral">{p.status.toLowerCase()}</span>
            </div>
          ))}
          <PayrollPagination
            label="Periods"
            paging={dashboard.periodsPaging}
            href={(page) => href("periodsPage", page)}
          />
          {!dashboard.periods.length && <p className="muted">No payroll periods recorded.</p>}
        </section>
        <section className="card card-body">
          <h2>Record personal daily tests</h2>
          <p className="muted">
            Enter one employee’s qualifying test count for one Eastern business date. Station totals
            must not be used as personal counts. Record zero explicitly for a completed day with no
            tests.
          </p>
          <ActionForm action={saveEmission} submit="Record test count">
            <Field label="Employee">
              <select name="employeeId" required>
                {employees}
              </select>
            </Field>
            <Field label="Test date">
              <input name="date" type="date" defaultValue={today} max={today} required />
            </Field>
            <Field label="Personal qualifying tests">
              <input name="count" type="number" min="0" max="100000" required />
            </Field>
            <Field label="Unique source reference">
              <input name="sourceRef" maxLength={160} required />
            </Field>
            <Field label="Source / entry reason" wide>
              <textarea name="reason" maxLength={2000} required />
            </Field>
          </ActionForm>
          <details className="space-top">
            <summary>Import count records</summary>
            <p className="muted">
              Paste a JSON array with employeeId, date, count, sourceRef and reason. Up to 1,000
              rows; the whole batch rolls back on conflict. Identical source retries are ignored.
              All imported rows still require approval.
            </p>
            <p className="muted">
              Employee IDs: {data.employees.map((e) => `${e.user.name}: ${e.id}`).join(" · ")}
            </p>
            <ActionForm action={importEmissionRows} submit="Import test counts">
              <Field label="Count records · JSON" wide>
                <textarea
                  name="rows"
                  maxLength={500000}
                  rows={6}
                  required
                  placeholder={
                    '[{"employeeId":"...","date":"2026-10-01","count":65,"sourceRef":"...","reason":"Verified personal report"}]'
                  }
                />
              </Field>
            </ActionForm>
          </details>
        </section>
      </div>
      {actor.role === "OWNER" && (
        <div className="two-columns space-top">
          <section className="card card-body">
            <h2>Authorize a pay arrangement</h2>
            <p className="muted">
              New dated versions retain history. Fixed amount applies once to an entire payroll
              period. Daily pay uses approved paid days; weekly pay uses complete seven-day periods.
              Hourly rates use approved minutes. Split periods at pay arrangement changes.
            </p>
            <ActionForm action={savePayArrangement} submit="Authorize pay arrangement">
              <Field label="Pay employee">
                <select name="employeeId" required>
                  {employees}
                </select>
              </Field>
              <Field label="Pay effective date">
                <input name="effectiveDate" type="date" required />
              </Field>
              <Field label="Compensation type">
                <select name="kind">
                  <option value="FIXED">Fixed amount per payroll period</option>
                  <option value="HOURLY">Hourly rate</option>
                  <option value="DAILY">Daily base pay</option>
                  <option value="WEEKLY">Weekly base pay</option>
                </select>
              </Field>
              <Field label="Authorized amount · integer cents">
                <input name="amountCents" type="number" min="0" max="2000000000" required />
              </Field>
              <Field label="Configured paid days per week · optional for equivalent rates">
                <input name="scheduledDaysPerWeek" type="number" min="1" max="7" />
              </Field>
              <Field label="Configured minutes per day · optional for hourly equivalent rates">
                <input name="scheduledMinutesPerDay" type="number" min="1" max="1440" />
              </Field>
              <p className="muted">
                Enter a new exact amount to increase or decrease base pay. Equivalent rates use only
                the schedule you configure; actual payroll requires independent input approval.
              </p>
              <Field label="Pay authorization reason" wide>
                <textarea name="reason" maxLength={2000} required />
              </Field>
            </ActionForm>
          </section>
          <section className="card card-body">
            <h2>Authorize commission policy</h2>
            <p className="muted">
              Confirm eligibility and attribution with the owner. Commission = max(0, approved
              personal daily tests − threshold) × rate. Optional volume boost adds an extra amount
              for each test above a higher threshold; earlier tests keep the base rate. New dated
              policies retain all prior rates.
            </p>
            <ActionForm action={saveCommissionPolicy} submit="Authorize commission policy">
              <input type="hidden" name="attribution" value="PERSONAL_APPROVED_DAILY" />
              <Field label="Commission employee">
                <select name="employeeId" required>
                  {employees}
                </select>
              </Field>
              <Field label="Commission effective date">
                <input name="effectiveDate" type="date" required />
              </Field>
              <Field label="Commission eligibility">
                <select name="eligible" required>
                  <option value="false">Not eligible</option>
                  <option value="true">Eligible · personal approved daily counts</option>
                </select>
              </Field>
              <Field label="Daily test threshold">
                <input name="threshold" type="number" min="0" max="100000" required />
              </Field>
              <Field label="Rate per additional test · cents">
                <input name="rateCents" type="number" min="0" max="2000000000" required />
              </Field>
              <Field label="Volume boost starts above tests/day · optional">
                <input name="volumeThreshold" type="number" min="0" max="100000" />
              </Field>
              <Field label="Extra commission per test above volume threshold · cents, optional">
                <input name="volumeIncreaseCents" type="number" min="0" max="2000000000" />
              </Field>
              <p className="muted">
                Fill both boost fields or leave both blank. Example formula: base commission +
                max(0, personal tests − volume threshold) × extra cents.
              </p>
              <Field label="Commission authorization reason" wide>
                <textarea name="reason" maxLength={2000} required />
              </Field>
            </ActionForm>
          </section>
        </div>
      )}
      <section className="card space-top">
        <div className="card-heading">
          <h2>Daily counts · review</h2>
        </div>
        <form action="/payroll" method="get" className="card-body filter-form">
          <input type="hidden" name="date" value={dashboard.filter.date} />
          <input type="hidden" name="weekStart" value={dashboard.filter.weekStart} />
          <Field label="Count approval filter">
            <select name="status" defaultValue={review.status}>
              <option value="ALL">All counts</option>
              <option value="PENDING">Awaiting approval</option>
            </select>
          </Field>
          <Field label="Count review period">
            <select name="periodId" defaultValue={review.periodId ?? ""}>
              <option value="">All dates</option>
              {data.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.startDate} — {p.endDate}
                </option>
              ))}
            </select>
          </Field>
          <button className="button button-primary" type="submit">
            Filter counts
          </button>
        </form>
        <nav aria-label="Count review pages" className="card-body">
          <span>
            {review.total} matching counts · Page {review.page} of {review.totalPages}
          </span>{" "}
          {review.page > 1 && <Link href={reviewHref(review.page - 1)}>Previous counts</Link>}{" "}
          {review.page < review.totalPages && (
            <Link href={reviewHref(review.page + 1)}>Next counts</Link>
          )}
          <small>15 counts per page</small>
        </nav>
        <div className="table-scroll">
          <table aria-label="Daily count review">
            <thead>
              <tr>
                <th>Date / employee</th>
                <th>Tests / source</th>
                <th>Approval</th>
                <th>Correction / review</th>
              </tr>
            </thead>
            <tbody>
              {data.counts.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.date}
                    <small>{c.employee.user.name}</small>
                  </td>
                  <td>
                    {c.count}
                    <small>{c.sourceRef}</small>
                  </td>
                  <td>
                    {c.approvedAt ? "Approved" : "Awaiting approval"}
                    <small>Version {c.version}</small>
                  </td>
                  <td>
                    {approver && !c.approvedAt && c.createdBy !== actor.id && (
                      <ActionForm
                        action={approveEmission}
                        submit="Approve count"
                        className="inline-form"
                      >
                        <input name="id" type="hidden" value={c.id} />
                        <input name="version" type="hidden" value={c.version} />
                      </ActionForm>
                    )}
                    <details>
                      <summary>Correct with reason</summary>
                      <ActionForm action={correctEmission} submit="Save count correction">
                        <input name="id" type="hidden" value={c.id} />
                        <input name="version" type="hidden" value={c.version} />
                        <Field label={`Corrected tests · ${c.employee.user.name} · ${c.date}`}>
                          <input
                            name="count"
                            type="number"
                            min="0"
                            max="100000"
                            defaultValue={c.count}
                            required
                          />
                        </Field>
                        <Field label="Correction reason">
                          <textarea name="reason" maxLength={2000} required />
                        </Field>
                      </ActionForm>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.counts.length && (
          <p className="card-body muted">No personal test counts recorded.</p>
        )}
      </section>
    </>
  );
}
