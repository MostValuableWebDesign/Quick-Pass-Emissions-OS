import Link from "next/link";
import { currentUser } from "@/lib/access";
import { businessDate } from "@/lib/time";
import { financeReport, categories } from "@/modules/finance/service";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { DemoNotice, Money, RecordId, TextField, Reason } from "@/components/phase3";
import { AmountField, DateField, RangeForm, CompletenessNotice } from "@/components/finance";
import { recordEntry, reviewEntry } from "@/app/phase4-actions";
export default async function Finance({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const actor = await currentUser(),
    q = await searchParams,
    end = q.end ?? businessDate(),
    start = q.start ?? `${end.slice(0, 7)}-01`,
    data = await financeReport(actor.id, { start, end }),
    t = data.totals;
  return (
    <>
      <PageHeader
        title="Operational finance"
        description="Recorded USD receipts and expenses, with manual, reviewed, and estimated amounts kept visible."
      />
      <DemoNotice demo={data.demo} />
      <CompletenessNotice />
      <section className="card card-body">
        <RangeForm start={start} end={end} />
      </section>
      <div className="stats-grid space-top">
        {[
          ["Approved dealership billing", t.billed],
          ["Dealership receipts · net of reversals", t.dealerReceipts],
          ["Rental receipts · net of reversals", t.rentalReceipts],
          ["Dealership A/R · as of end date", t.outstanding],
          ["Other receipts · manual", t.manualRevenue],
          ["Other receipts · verified", t.verifiedRevenue],
          ["Expenses · manual", t.manualExpense],
          ["Expenses · verified", t.verifiedExpense],
          ["Estimated receipts · excluded from actuals", t.estimatedRevenue],
          ["Estimated expenses · excluded from actuals", t.estimatedExpense],
        ].map(([label, n]) => (
          <section className="card stat-card" key={label}>
            <p className="muted">{label}</p>
            <h2>
              <Money cents={n as number} />
            </h2>
          </section>
        ))}
      </div>
      <p className="muted">
        Billing is an obligation; receipts are payment records. Do not add billing to receipts.
        Other receipts and expenses are separate manual cash records. Payroll drafts, rental
        charges, certificate orders, and maintenance cost notes do not prove payment and are not
        automatically posted. Zero means no matching entries, not a confirmed zero business balance.
        Review state is current; dates filter the entered effective dates.
      </p>
      <section className="card card-body space-top">
        <h2>Record other receipt or expense</h2>
        <p className="muted">
          Use a source reference from your accounting record. Do not re-enter dealership or rental
          receipts already recorded in this app. Actual cash records need external evidence;
          estimates remain estimates. Corrections retain the original entry: void it and enter a
          replacement.
        </p>
        <ActionForm action={recordEntry} submit="Record finance entry">
          <Field label="Record direction">
            <select name="direction">
              <option value="REVENUE">Other revenue / receipt</option>
              <option value="EXPENSE">Expense / disbursement</option>
            </select>
          </Field>
          <Field label="Record basis">
            <select name="basis">
              <option value="MANUAL">Manual actual record · evidence supplied</option>
              <option value="ESTIMATE">Estimate · excluded from actuals</option>
            </select>
          </Field>
          <Field label="Finance category">
            <select name="category">
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c.replaceAll("_", " ").toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <DateField />
          <AmountField label="Record amount · integer USD cents" />
          <TextField name="reference" label="Unique external accounting reference" />
          <TextField name="description" label="Record description" />
          <TextField name="evidence" label="External evidence / estimate assumptions" area />
          <label className="check-row">
            <input name="separateRecord" type="checkbox" value="true" required />I checked that this
            is separate from the dealership and rental receipts already recorded here.
          </label>
        </ActionForm>
      </section>
      <section className="card space-top">
        <div className="card-heading">
          <h2>Finance records · selected dates ({data.entries.length})</h2>
          <Link href={`/finance/reports?start=${start}&end=${end}`}>Export records</Link>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date / reference</th>
                <th>Category / description</th>
                <th>Amount</th>
                <th>Provenance / review</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td>
                    {e.date}
                    <small>{e.reference}</small>
                  </td>
                  <td>
                    {e.direction.toLowerCase()} · {e.category.toLowerCase()}
                    <small>{e.description}</small>
                    <small>{e.evidence}</small>
                  </td>
                  <td>
                    <Money cents={e.amountCents} />
                  </td>
                  <td>
                    {e.voidDate
                      ? `Voided ${e.voidDate}`
                      : e.basis === "ESTIMATE"
                        ? "Estimate"
                        : e.verifiedAt
                          ? "Verified against supplied evidence"
                          : "Manual · not independently verified"}
                    {e.voidReason && <small>{e.voidReason}</small>}
                    {actor.role !== "BOOKKEEPER" && !e.voidDate && (
                      <details>
                        <summary>Review record</summary>
                        <ActionForm action={reviewEntry} submit="Review finance entry">
                          <RecordId id={e.id} version={e.version} />
                          <Field label="Finance review decision">
                            <select name="decision">
                              <option value="VERIFY">Verify manual record against evidence</option>
                              <option value="VOID">Void incorrect record</option>
                            </select>
                          </Field>
                          <Reason />
                        </ActionForm>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.entries.length && (
          <p className="card-body muted">
            No manual or estimated finance records in this date range.
          </p>
        )}
      </section>
    </>
  );
}
