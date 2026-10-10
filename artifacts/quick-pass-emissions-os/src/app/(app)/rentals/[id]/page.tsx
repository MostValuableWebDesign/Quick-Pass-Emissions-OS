import { notFound } from "next/navigation";
import { currentUser } from "@/lib/access";
import { businessDate } from "@/lib/time";
import { rentalDetail } from "@/modules/rentals/service";
import { paymentSummary } from "@/modules/rentals/rules";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { RecordId, TextField, Reason, Money, DemoNotice } from "@/components/phase3";
import {
  createCharge,
  recordPayment,
  reversePayment,
  voidCharge,
  endAgreement,
} from "@/app/phase3-actions";
export default async function Rental({ params }: { params: Promise<{ id: string }> }) {
  const actor = await currentUser(),
    { id } = await params,
    data = await rentalDetail(actor.id, id),
    a = data.agreement;
  if (!a) notFound();
  const today = businessDate(),
    manager = ["OWNER", "ADMIN"].includes(actor.role);
  return (
    <>
      <PageHeader
        title={`${a.tenant} · ${a.bay.identifier}`}
        description={`Agreement ${a.reference} · ${a.status.toLowerCase()}`}
      />
      <DemoNotice demo={data.demo} />
      <section className="card card-body">
        <h2>Authorized terms</h2>
        <p>
          {a.startDate} → {a.endDate ?? "Open-ended"} · Monthly <Money cents={a.monthlyCents} /> ·
          Due day {a.dueDay}
        </p>
        <p>{a.contact}</p>
        <p>Maintenance responsibilities: {a.responsibilities}</p>
        <p className="muted">
          Payment records describe money received through an external channel. Amounts shown are
          entered records, not bank reconciliation or verified profit.
        </p>
      </section>
      {a.status !== "CANCELLED" && (
        <section className="card card-body space-top">
          <h2>Record a monthly rental charge</h2>
          <p className="muted">
            Full calendar months only. Due days 29–31 clamp to month end. Partial months, deposits,
            fees, and credits are handled in accounting. Duplicate months preserve the existing
            charge.
          </p>
          <ActionForm action={createCharge} submit="Record monthly rental charge">
            <input name="agreementId" type="hidden" value={a.id} />
            <Field label="Rental month">
              <input name="month" type="month" defaultValue={today.slice(0, 7)} required />
            </Field>
            <Reason />
          </ActionForm>
        </section>
      )}
      {a.charges.map((c) => {
        const summary = paymentSummary(c.amountCents, c.payments, c.dueDate, today, !!c.voidedAt);
        return (
          <section className="card card-body space-top" key={c.id}>
            <h2>
              {c.month} rental · {summary.status}
            </h2>
            <p>
              Due {c.dueDate} · Charge <Money cents={c.amountCents} /> · Received{" "}
              <Money cents={summary.paidCents} /> · Remaining{" "}
              <Money cents={c.voidedAt ? 0 : summary.remainingCents} />
            </p>
            {c.voidReason && <p>Void reason: {c.voidReason}</p>}
            {!c.voidedAt && summary.remainingCents > 0 && (
              <ActionForm action={recordPayment} submit="Record rental payment">
                <input name="chargeId" type="hidden" value={c.id} />
                <Field label="Payment amount · integer USD cents">
                  <input
                    name="amountCents"
                    type="number"
                    min="1"
                    max={summary.remainingCents}
                    required
                  />
                </Field>
                <Field label="Payment received date">
                  <input name="date" type="date" max={today} defaultValue={today} required />
                </Field>
                <TextField name="reference" label="Unique external payment reference" />
                <Reason label="Payment verification / reason" />
              </ActionForm>
            )}
            <h3>Payment history</h3>
            {c.payments.map((p) => (
              <div className="card card-body space-top" key={p.id}>
                <p>
                  {p.date} · <Money cents={p.amountCents} /> · {p.reference}
                </p>
                <p>
                  {p.reason}
                  {p.reversal ? " · Reversed" : ""}
                </p>
                {manager && p.amountCents > 0 && !p.reversal && (
                  <details>
                    <summary>Reverse this recorded payment</summary>
                    <ActionForm action={reversePayment} submit="Reverse rental payment">
                      <input name="id" type="hidden" value={p.id} />
                      <Field label="Reversal date">
                        <input
                          name="date"
                          type="date"
                          min={p.date}
                          max={today}
                          defaultValue={today}
                          required
                        />
                      </Field>
                      <TextField name="reference" label="Unique reversal reference" />
                      <Reason />
                    </ActionForm>
                  </details>
                )}
              </div>
            ))}
            {!c.payments.length && <p className="muted">No received payments recorded.</p>}
            {manager && !c.voidedAt && summary.paidCents === 0 && (
              <details className="space-top">
                <summary>Void unpaid charge</summary>
                <ActionForm action={voidCharge} submit="Void rental charge">
                  <input name="id" type="hidden" value={c.id} />
                  <Reason />
                </ActionForm>
              </details>
            )}
          </section>
        );
      })}
      {actor.role === "OWNER" && a.status === "ACTIVE" && (
        <details className="card card-body space-top">
          <summary>End or cancel this agreement</summary>
          <ActionForm action={endAgreement} submit="Close rental agreement">
            <RecordId id={a.id} version={a.version} />
            <Field label="Agreement closing action">
              <select name="decision">
                <option value="ENDED">End on confirmed date</option>
                <option value="CANCELLED">Cancel unused agreement</option>
              </select>
            </Field>
            <Field label="Confirmed end date">
              <input
                name="endDate"
                type="date"
                min={a.startDate}
                max={today}
                defaultValue={today}
                required
              />
            </Field>
            <Reason />
          </ActionForm>
        </details>
      )}
    </>
  );
}
