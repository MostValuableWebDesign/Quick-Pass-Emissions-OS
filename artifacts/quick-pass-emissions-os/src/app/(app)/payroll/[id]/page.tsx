import Link from "next/link";
import { z } from "zod";
import { requiredInteger } from "@/lib/validation";
import { pageInfo } from "@/modules/payroll/dashboard";
import { PayrollPagination } from "@/components/payroll-pagination";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/access";
import { payrollDetail, payrollOverview } from "@/modules/payroll/service";
import { approvalRoles } from "@/modules/phase2";
import { formatMoney } from "@/modules/payroll/calculations";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import {
  savePayInput,
  approvePayInput,
  generatePayrollDraft,
  reviewPayrollDraft,
  cancelPayrollPeriod,
} from "@/app/phase2-actions";
function InputFields({ minutes, paidDays }: { minutes?: number; paidDays?: number | null } = {}) {
  return (
    <>
      <Field label="Approved worked minutes · 0 for fixed pay">
        <input name="minutes" type="number" min="0" defaultValue={minutes} required />
      </Field>
      <Field label="Approved paid days · daily pay only">
        <input
          name="paidDays"
          type="number"
          min="0"
          max="366"
          defaultValue={paidDays ?? undefined}
        />
      </Field>
      <Field label="I verified all personal counts for this period, including zero-test days">
        <input type="checkbox" name="emissionsComplete" value="true" required />
      </Field>
      <Field label="Source / correction reason" wide>
        <textarea name="reason" maxLength={2000} required />
      </Field>
    </>
  );
}
export default async function PayrollPeriodPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    inputsPage?: string;
    draftsPage?: string;
    linesPage?: string;
    from?: string;
  }>;
}) {
  const actor = await currentUser();
  const period = await payrollDetail(actor.id, (await params).id);
  if (!period) notFound();
  const overview = await payrollOverview(actor.id);
  const query = await searchParams;
  const parsedPages = z
    .object({
      inputsPage: requiredInteger(1, 1000000000).default(1),
      draftsPage: requiredInteger(1, 1000000000).default(1),
      linesPage: requiredInteger(1, 1000000000).default(1),
    })
    .safeParse(query);
  const pages = parsedPages.success
    ? parsedPages.data
    : { inputsPage: 1, draftsPage: 1, linesPage: 1 };
  const inputPaging = pageInfo(period.inputs.length, pages.inputsPage);
  const draftPaging = pageInfo(period.drafts.length, pages.draftsPage);
  const href = (key: string, page: number) => {
    const updated = new URLSearchParams(
      Object.entries(query).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
    updated.set(key, String(page));
    return `/payroll/${period.id}?${updated}`;
  };
  const frozen = period.status !== "OPEN" || period.drafts.some((d) => d.status === "DRAFT");
  const available = overview.employees.filter(
    (e) => !period.inputs.some((i) => i.employeeId === e.id),
  );
  return (
    <>
      <PageHeader
        title={period.label}
        description={`${period.startDate} — ${period.endDate} · ${period.status.toLowerCase()}`}
      />
      {overview.employees.some((e) => e.demo) && (
        <div className="notice warning">
          DEMONSTRATION WORKSPACE · Illustrative payroll and stock records. These are not actual
          business records.
        </div>
      )}
      <p className="notice">
        Verify the employee roster and approved personal counts before generating a draft. Active
        employees with an effective pay arrangement and employees with period counts must be
        included. A completed-period attestation is required; missing test days are not inferred
        from schedules. Daily compensation requires approved paid days; weekly compensation requires
        a period of seven days or a whole number of weeks. Enter zero minutes for non-hourly
        compensation.
      </p>
      <p>
        <Link href={`/payroll?periodId=${period.id}&status=PENDING`}>
          Review pending counts for this period
        </Link>
        {" · "}
        <Link href={`/payroll?periodId=${period.id}&status=ALL`}>
          Review all counts for this period
        </Link>
      </p>
      <section className="card card-body">
        <h2>Payroll inputs</h2>
        <PayrollPagination
          label="Inputs"
          paging={inputPaging}
          href={(page) => href("inputsPage", page)}
        />
        {period.inputs.slice((inputPaging.page - 1) * 15, inputPaging.page * 15).map((i) => (
          <section className="space-top" key={i.id}>
            <h3>{i.employee.user.name}</h3>
            <p>
              {i.minutes} worked minutes ·{" "}
              {i.paidDays === null ? "Paid days not provided" : `${i.paidDays} paid days`} ·{" "}
              {i.approvedAt ? "Approved" : "Awaiting approval"} · Version {i.version}
            </p>
            <p className="muted">{i.reason}</p>
            {!frozen && (
              <>
                <details>
                  <summary>Correct payroll input</summary>
                  <ActionForm action={savePayInput} submit="Save input correction">
                    <input name="periodId" type="hidden" value={period.id} />
                    <input name="employeeId" type="hidden" value={i.employeeId} />
                    <input name="version" type="hidden" value={i.version} />
                    <InputFields minutes={i.minutes} paidDays={i.paidDays} />
                  </ActionForm>
                </details>
                {approvalRoles.includes(actor.role) &&
                  !i.approvedAt &&
                  i.createdBy !== actor.id && (
                    <ActionForm
                      action={approvePayInput}
                      submit="Approve payroll input"
                      className="inline-form"
                    >
                      <input name="id" type="hidden" value={i.id} />
                      <input name="version" type="hidden" value={i.version} />
                    </ActionForm>
                  )}
              </>
            )}
          </section>
        ))}
        {!period.inputs.length && <p className="muted">No payroll inputs recorded.</p>}
        {!frozen && available.length > 0 && (
          <details className="space-top" open>
            <summary>Add employee to this period</summary>
            <ActionForm action={savePayInput} submit="Record payroll input">
              <input name="periodId" type="hidden" value={period.id} />
              <input name="version" type="hidden" value="0" />
              <Field label="Payroll employee">
                <select name="employeeId" required>
                  {available.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.user.name}
                      {!e.user.active && " · inactive"}
                    </option>
                  ))}
                </select>
              </Field>
              <InputFields />
            </ActionForm>
          </details>
        )}
        {!frozen && (
          <>
            <div className="space-top">
              <ActionForm action={generatePayrollDraft} submit="Generate payroll draft">
                <input name="periodId" type="hidden" value={period.id} />
              </ActionForm>
            </div>
            <details className="space-top">
              <summary>Cancel mistaken period</summary>
              <ActionForm action={cancelPayrollPeriod} submit="Cancel payroll period">
                <input name="id" type="hidden" value={period.id} />
                <Field label="Period cancellation reason">
                  <textarea name="reason" required maxLength={2000} />
                </Field>
              </ActionForm>
            </details>
          </>
        )}
      </section>
      <PayrollPagination
        label="Drafts"
        paging={draftPaging}
        href={(page) => href("draftsPage", page)}
      />
      {period.drafts.slice((draftPaging.page - 1) * 15, draftPaging.page * 15).map((d) => (
        <section className="card card-body space-top" key={d.id}>
          <h2>
            Draft revision {d.revision} · {d.status.toLowerCase()}
          </h2>
          <p>
            Gross preparation total: <strong>{formatMoney(d.totalCents)}</strong>
          </p>
          <PayrollPagination
            label={`Revision ${d.revision} lines`}
            paging={pageInfo(d.lines.length, pages.linesPage)}
            href={(page) => href("linesPage", page)}
          />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Base</th>
                  <th>Commission</th>
                  <th>Gross</th>
                  <th>Calculation record</th>
                </tr>
              </thead>
              <tbody>
                {d.lines
                  .slice(
                    (pageInfo(d.lines.length, pages.linesPage).page - 1) * 15,
                    pageInfo(d.lines.length, pages.linesPage).page * 15,
                  )
                  .map((l) => (
                    <tr key={l.id}>
                      <td>{l.employeeName}</td>
                      <td>{formatMoney(l.baseCents)}</td>
                      <td>{formatMoney(l.commissionCents)}</td>
                      <td>{formatMoney(l.totalCents)}</td>
                      <td>
                        <details>
                          <summary>View historical inputs</summary>
                          <pre className="audit-details">{JSON.stringify(l.snapshot, null, 2)}</pre>
                        </details>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {d.reviewReason && <p className="muted">Review: {d.reviewReason}</p>}
          {d.status === "DRAFT" &&
            approvalRoles.includes(actor.role) &&
            d.preparedBy !== actor.id && (
              <ActionForm action={reviewPayrollDraft} submit="Submit payroll review">
                <input name="id" type="hidden" value={d.id} />
                <Field label="Payroll decision">
                  <select name="decision">
                    <option value="RETURNED">Return for corrections</option>
                    <option value="APPROVED">Approve and lock payroll</option>
                  </select>
                </Field>
                <Field label="Payroll review reason">
                  <textarea name="reason" maxLength={2000} required />
                </Field>
              </ActionForm>
            )}
          {d.status === "APPROVED" && (
            <Link className="button button-outline" href={`/api/payroll/${d.id}/export`}>
              Download approved payroll CSV
            </Link>
          )}
        </section>
      ))}
    </>
  );
}
