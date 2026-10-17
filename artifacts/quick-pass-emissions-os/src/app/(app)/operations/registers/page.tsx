import Link from "next/link";
import { currentUser } from "@/lib/access";
import { managerOverview } from "@/modules/manager/service";
import { financialRegister } from "@/modules/manager/registers";
import { managerAction } from "@/app/manager-actions";
import { ActionForm, Field } from "@/components/action-form";
import { PageHeader } from "@/components/shared";
import { WorkspaceTabs, Command, money } from "@/components/manager-workspace";
import "../workspace.css";
export default async function Registers({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = Math.max(1, Math.min(10000, Math.floor(Number((await searchParams).page)) || 1));
  const actor = await currentUser(),
    data = await managerOverview(actor.id);
  const register = await financialRegister(actor.id, page);
  return (
    <>
      <PageHeader
        title="Payment & deposit evidence"
        description="Internal evidence register · no bank connection or payment initiation"
      />
      <WorkspaceTabs />
      <div className="notice">
        Completing a responsibility never confirms payroll payment or a bank deposit. Keep evidence
        and reconciliation separate. Payroll entries refer to an existing independently approved
        gross draft; deductions and net-pay details belong in the evidence note. This register does
        not change collected revenue, account balances or approved payroll.
      </div>
      {actor.role === "OWNER" && (
        <section className="card card-body">
          <h2>Bank remote-deposit limit</h2>
          <ActionForm action={managerAction} submit="Save configured bank limit">
            <Command name="BANK_LIMIT" />
            <input type="hidden" name="version" value={data.bank?.version ?? 0} />
            <Field label="Bank-authorized maximum per remote deposit · USD">
              <input
                name="amount"
                inputMode="decimal"
                defaultValue={
                  data.bank?.remoteLimitCents ? String(data.bank.remoteLimitCents / 100) : ""
                }
                placeholder="Blank = unconfigured"
              />
            </Field>
          </ActionForm>
          <p>No amount is treated as a bank limit until an owner enters it.</p>
        </section>
      )}
      <section className="card card-body">
        <h2>Record external evidence</h2>
        <ActionForm action={managerAction} submit="Record external transaction">
          <Command name="FINANCIAL_EVIDENCE" />
          <Field label="Evidence type">
            <select name="kind">
              <option value="DEPOSIT">Check / deposit</option>
              {actor.role === "OWNER" && <option value="PAYROLL">Payroll payment</option>}
            </select>
          </Field>
          <Field label="Deposit/check identifier or approved payroll draft ID">
            <input name="sourceId" required maxLength={100} />
          </Field>
          <Field label="Amount · USD">
            <input name="amount" inputMode="decimal" required />
          </Field>
          <Field label="Transaction date">
            <input type="date" name="date" defaultValue={data.today} required />
          </Field>
          <Field label="Method">
            <select name="method">
              <option value="CHECK">Check awaiting deposit</option>
              <option value="REMOTE">Recorded remote deposit</option>
              <option value="BANK">Recorded bank deposit</option>
              <option value="OTHER">Other external payment evidence</option>
            </select>
          </Field>
          <Field label="Unique external reference">
            <input name="reference" required maxLength={160} />
          </Field>
          <Field label="Evidence, deductions / net pay details" wide>
            <textarea name="notes" required minLength={5} maxLength={2000} />
          </Field>
        </ActionForm>
        <p>
          To prevent duplicates, a payroll period can have one payment-confirmation record and a
          check/deposit identifier can be recorded once. Grass-cutting compensation must be verified
          in approved payroll, not paid again from a task.
        </p>
        <h3>Approved payroll drafts in latest 15 periods</h3>
        {data.payroll.flatMap((p) =>
          p.drafts
            .filter((d) => d.status === "APPROVED")
            .map((d) => (
              <p key={d.id}>
                <Link href={`/payroll/${p.id}`}>{p.label}</Link> · gross {money(d.totalCents)} ·
                draft ID <code>{d.id}</code>
              </p>
            )),
        )}
      </section>
      {[
        { title: "Payroll confirmation history", rows: register[0].rows },
        { title: "Checks & deposits", rows: register[1].rows },
      ].map((group) => (
        <section className="card card-body" key={group.title}>
          <h2>
            {group.title} · page {page} · 15 per page
          </h2>
          {group.rows.length ? (
            group.rows.map((r) => (
              <div className="manager-schedule-slot" key={r.id}>
                <strong>{r.reference}</strong> · {r.date} · {money(r.amountCents)} · {r.method}
                <p>{r.notes}</p>
                {r.kind === "DEPOSIT" && r.method === "CHECK" && !r.reconciledAt && (
                  <ActionForm action={managerAction} submit="Record external deposit">
                    <Command name="SUBMIT_DEPOSIT" />
                    <input type="hidden" name="id" value={r.id} />
                    <Field label="Deposit method">
                      <select name="method">
                        <option value="REMOTE">Remote deposit</option>
                        <option value="BANK">Bank deposit</option>
                      </select>
                    </Field>
                    <Field label="Deposit date">
                      <input type="date" name="date" defaultValue={data.today} required />
                    </Field>
                    <Field label="External deposit reference">
                      <input name="reference" required maxLength={160} />
                    </Field>
                    <Field label="Deposit evidence">
                      <input name="notes" required maxLength={160} />
                    </Field>
                  </ActionForm>
                )}
                <p>
                  {r.reconciledAt
                    ? "Confirmed: independently reconciled evidence"
                    : "Pending: recorded external evidence, not independently reconciled"}
                </p>
                {!r.reconciledAt && actor.role === "OWNER" && r.createdBy !== actor.id && (
                  <ActionForm action={managerAction} submit="Confirm independent reconciliation">
                    <Command name="RECONCILE" />
                    <input type="hidden" name="id" value={r.id} />
                    <Field label="Bank/payroll reconciliation evidence">
                      <input name="notes" required maxLength={160} />
                    </Field>
                  </ActionForm>
                )}
              </div>
            ))
          ) : (
            <p className="muted">
              Missing: no evidence recorded. This is not a confirmed zero balance.
            </p>
          )}
        </section>
      ))}
      <div className="pagination">
        {page > 1 && <Link href={`/operations/registers?page=${page - 1}`}>← Previous page</Link>}
        <span>Page {page}</span>
        {register.some((g) => g.count > page * 15) && (
          <Link href={`/operations/registers?page=${page + 1}`}>Next page →</Link>
        )}
      </div>
    </>
  );
}
