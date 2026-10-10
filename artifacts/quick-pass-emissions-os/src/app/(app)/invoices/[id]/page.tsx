import { notFound } from "next/navigation";
import { currentUser } from "@/lib/access";
import { businessDate, formatDate } from "@/lib/time";
import { invoiceDetail } from "@/modules/finance/service";
import { receivable } from "@/modules/finance/rules";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { DemoNotice, RecordId, Money } from "@/components/phase3";
import { PaymentFields, ReviewFields } from "@/components/finance";
import * as actions from "@/app/phase4-actions";
export default async function Invoice({ params }: { params: Promise<{ id: string }> }) {
  const actor = await currentUser(),
    data = await invoiceDetail(actor.id, (await params).id),
    i = data.invoice;
  if (!i) notFound();
  const summary = receivable(
      { ...i, state: i.approvedAt ? i.state : "DRAFT" },
      i.payments,
      businessDate(),
    ),
    management = true;
  const snap = i.snapshot as {
    name: string;
    code: string;
    billingAddress: string;
    termsDays: number;
    termsReference: string;
    contacts: { name: string; email: string; phone: string; purpose: string }[];
  };
  return (
    <>
      <PageHeader
        title={`Invoice ${i.number}`}
        description={`${summary.status} · Issued ${i.issueDate} · Due ${i.dueDate}`}
      />
      <DemoNotice demo={data.demo} />
      <section className="card card-body">
        <h2>Billing snapshot</h2>
        <h3>
          {snap.name} · {snap.code}
        </h3>
        <p>{snap.billingAddress}</p>
        {snap.contacts.map((c, n) => (
          <p key={n}>
            {c.name} · {c.purpose} · {c.email || c.phone}
          </p>
        ))}
        <p>
          Terms: net {snap.termsDays} days · {snap.termsReference}
        </p>
        <p>{i.notes}</p>
        <p className="muted">
          This retained snapshot does not change when the account is edited. Invoice PDF and email
          delivery are not configured.
        </p>
        {i.deliveryReference && (
          <p>
            External delivery: {i.sentDate} · {i.deliveryReference}
          </p>
        )}
        {i.voidDate && (
          <p className="notice warning">
            Voided {i.voidDate} · {i.voidReason}
          </p>
        )}
      </section>
      <section className="card space-top">
        <div className="card-heading">
          <h2>Invoice line items</h2>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Service date</th>
                <th>Description</th>
                <th>Quantity</th>
                <th>Unit rate</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {i.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.date}</td>
                  <td>{l.description}</td>
                  <td>{l.quantity}</td>
                  <td>
                    <Money cents={l.unitCents} />
                  </td>
                  <td>
                    <Money cents={l.amountCents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-body">
          <p>
            Subtotal: <Money cents={i.subtotalCents} /> · Tax ({i.taxBps} basis points):{" "}
            <Money cents={i.taxCents} />
          </p>
          <h3>
            Total: <Money cents={i.totalCents} />
          </h3>
          <p>
            Received net payments: <Money cents={summary.paidCents} /> · Outstanding:{" "}
            <Money cents={summary.remainingCents} />
          </p>
          {i.state === "DRAFT" && (
            <p className="muted">Drafts are excluded from receivables until approved.</p>
          )}
        </div>
      </section>
      {management && i.state !== "VOIDED" && (
        <section className="card card-body space-top">
          <h2>Review & delivery record</h2>
          <p className="muted">
            Approval requires a different owner or manager. Mark sent only after actual external
            delivery. This action records delivery and does not send an invoice. To correct an
            invoice, reverse any payments, void it, then create a replacement from the retained
            services.
          </p>
          <ActionForm action={actions.reviewInvoice} submit="Record invoice decision">
            <RecordId id={i.id} version={i.version} />
            <Field label="Invoice decision">
              <select name="decision">
                <option value="APPROVE">Approve draft</option>
                <option value="SENT">Record externally sent</option>
                <option value="VOID">Void invoice</option>
              </select>
            </Field>
            <ReviewFields />
          </ActionForm>
        </section>
      )}
      {i.approvedAt && i.state !== "VOIDED" && summary.remainingCents > 0 && (
        <section className="card card-body space-top">
          <h2>Record received payment</h2>
          <p className="muted">
            Record confirmed external receipts in chronological order. No bank or payment processor
            is connected.
          </p>
          <ActionForm action={actions.recordDealerPayment} submit="Record dealership payment">
            <input type="hidden" name="invoiceId" value={i.id} />
            <PaymentFields />
          </ActionForm>
        </section>
      )}
      <section className="card card-body space-top">
        <h2>Payment history</h2>
        {!i.payments.length && <p>No receipts recorded.</p>}
        {i.payments.map((p) => (
          <div className="history-item" key={p.id}>
            <p>
              {p.date} · <Money cents={p.amountCents} /> · {p.reference}
            </p>
            <p>
              {p.evidence}
              {p.reversesId ? " · Full reversal" : ""}
            </p>
            {management && p.amountCents > 0 && !p.reversal && i.state !== "VOIDED" && (
              <details>
                <summary>Reverse this receipt</summary>
                <ActionForm
                  action={actions.reverseDealerPayment}
                  submit="Reverse dealership payment"
                >
                  <input type="hidden" name="id" value={p.id} />
                  <PaymentFields reversal />
                </ActionForm>
              </details>
            )}
          </div>
        ))}
      </section>
      <section className="card card-body space-top">
        <h2>Invoice history</h2>
        {data.history.map((h) => (
          <p key={h.id}>
            {formatDate(h.createdAt)} · {h.action.replaceAll("_", " ").toLowerCase()} ·{" "}
            {h.actor?.name ?? "Former user"}
          </p>
        ))}
      </section>
    </>
  );
}
