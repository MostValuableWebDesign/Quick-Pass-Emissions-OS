import { RecordLink } from "@/components/record-link";
import { currentUser } from "@/lib/access";
import { businessDate } from "@/lib/time";
import { payrollOverview } from "@/modules/payroll/service";
import { approvalRoles } from "@/modules/phase2";
import { formatMoney } from "@/modules/payroll/calculations";
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
export default async function Payroll() {
  const actor = await currentUser();
  const data = await payrollOverview(actor.id);
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
        description="Prepare gross compensation from approved records. Owner-configured rates and personal daily counts are required."
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
      <div className="two-columns">
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
          {data.periods.map((p) => (
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
          {!data.periods.length && <p className="muted">No payroll periods recorded.</p>}
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
              period. Hourly rates use approved minutes; shifts do not prove worked time. Split
              periods at pay arrangement changes.
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
                </select>
              </Field>
              <Field label="Authorized amount · integer cents">
                <input name="amountCents" type="number" min="0" max="2000000000" required />
              </Field>
              <Field label="Pay authorization reason" wide>
                <textarea name="reason" maxLength={2000} required />
              </Field>
            </ActionForm>
          </section>
          <section className="card card-body">
            <h2>Authorize commission policy</h2>
            <p className="muted">
              Confirm eligibility and attribution with the owner. Commission = max(0, approved
              personal daily tests − threshold) × rate. There are no preconfigured business rates.
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
              <Field label="Commission authorization reason" wide>
                <textarea name="reason" maxLength={2000} required />
              </Field>
            </ActionForm>
          </section>
        </div>
      )}
      <section className="card space-top">
        <div className="card-heading">
          <h2>Daily counts · latest 100</h2>
        </div>
        <div className="table-scroll">
          <table>
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
      <section className="card card-body space-top">
        <h2>Authorized configuration history · latest 100 of each</h2>
        {data.arrangements.map((a) => (
          <p key={a.id}>
            {a.employee.user.name} · {a.effectiveDate} · {a.kind.toLowerCase()} ·{" "}
            {formatMoney(a.amountCents)}
            <small>{a.reason}</small>
          </p>
        ))}
        {data.policies.map((p) => (
          <p key={p.id}>
            {p.employee.user.name} · {p.effectiveDate} ·{" "}
            {p.eligible
              ? `${formatMoney(p.rateCents)} above ${p.threshold} personal tests/day`
              : "Not commission eligible"}
            <small>{p.reason}</small>
          </p>
        ))}
        {!data.arrangements.length && !data.policies.length && (
          <p className="muted">Owner configuration is required before calculations.</p>
        )}
      </section>
    </>
  );
}
