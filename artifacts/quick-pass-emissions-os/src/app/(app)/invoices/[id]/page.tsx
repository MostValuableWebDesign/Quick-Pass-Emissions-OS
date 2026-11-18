import { notFound } from "next/navigation";
import { currentUser } from "@/lib/access";
import { businessDate, formatDate } from "@/lib/time";
import { invoiceDetail } from "@/modules/finance/service";
import { receivable } from "@/modules/finance/rules";
import { PageHeader } from "@/components/shared";
import { ActionForm } from "@/components/action-form";
import { DemoNotice, Money } from "@/components/phase3";
import { PaymentFields } from "@/components/finance";
import { InvoiceEmailComposer } from "@/components/invoice-email-composer";
import { invoiceIssuer, invoiceSnapshotSchema } from "@/modules/finance/invoice-document";
import { InvoiceCustomerBrand } from "@/components/invoice-customer-brand";
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
    emailBalanceCents =
      i.state === "DRAFT" ? Math.max(0, i.totalCents - summary.paidCents) : summary.remainingCents,
    management = true;
  const snap = invoiceSnapshotSchema.parse(i.snapshot);
  const paymentContact =
    snap.contacts.find((contact) => /billing|invoic|accounts? payable/i.test(contact.purpose)) ??
    snap.contacts.find((contact) => contact.email);
  const onlinePaymentLink = i.stripePaymentLink;
  const linkMatchesBalance =
    onlinePaymentLink?.state === "OPEN" &&
    !!onlinePaymentLink.hostedUrl &&
    onlinePaymentLink.amountCents === summary.remainingCents;
  return (
    <>
      <PageHeader
        title={`Invoice ${i.number}`}
        description={`${summary.status} · Issued ${i.issueDate} · Due ${i.dueDate}${i.sentDate ? ` · Sent ${i.sentDate}` : ""}`}
      />
      <DemoNotice demo={data.demo} />
      <section className="card card-body space-top" aria-labelledby="invoice-record-actions">
        <h2 id="invoice-record-actions">Invoice record</h2>
        <p className="muted">
          Archiving hides an invoice from the active list but keeps it in reports and history.
          Unsent draft services become available for billing again only if the draft is deleted.
        </p>
        {i.archivedAt ? (
          <>
            <p className="notice warning">
              Archived {formatDate(i.archivedAt)} · retained in history.
            </p>
            <ActionForm action={actions.setDealerInvoiceArchived} submit="Restore invoice">
              <input type="hidden" name="id" value={i.id} />
              <input type="hidden" name="version" value={i.version} />
              <input type="hidden" name="archived" value="false" />
            </ActionForm>
          </>
        ) : (
          <ActionForm
            action={actions.setDealerInvoiceArchived}
            submit="Archive invoice"
            confirmEyebrow="Invoice records"
            confirmTitle="Archive this invoice?"
            confirmConfirmLabel="Archive invoice"
            confirmCancelLabel="Keep active"
            confirmOnSubmit={`Archive invoice ${i.number}? It will leave the active list, but its payment history, service rows, and report totals will be retained. You can restore it later.`}
          >
            <input type="hidden" name="id" value={i.id} />
            <input type="hidden" name="version" value={i.version} />
            <input type="hidden" name="archived" value="true" />
          </ActionForm>
        )}
        {i.state === "DRAFT" &&
          !i.approvedAt &&
          !i.sentDate &&
          !i.deliveryReference &&
          i.payments.length === 0 && (
            <ActionForm
              action={actions.deleteDraftInvoice}
              submit="Delete draft invoice"
              confirmEyebrow="Permanent invoice deletion"
              confirmTitle="Delete this draft permanently?"
              confirmConfirmLabel="Delete permanently"
              confirmCancelLabel="Keep draft"
              confirmOnSubmit={`Permanently delete draft ${i.number}? It has no payments and has not been sent. Its service rows will be released for billing again. An audit record will remain; this cannot be undone.`}
            >
              <input type="hidden" name="id" value={i.id} />
              <input type="hidden" name="version" value={i.version} />
            </ActionForm>
          )}
      </section>
      <section className="card card-body">
        <h2>Billing snapshot</h2>
        <InvoiceCustomerBrand
          name={snap.name}
          billingAddress={snap.billingAddress}
          phone={snap.phone}
          contacts={snap.contacts}
        />
        <p>
          Terms: net {snap.termsDays} days · {snap.termsReference}
        </p>
        <p>{i.notes}</p>
        <p className="muted">This retained snapshot does not change when the account is edited.</p>
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
            <p className="muted">
              Drafts remain outside receivables until sent. Sending from this page sends the email
              and issues the invoice.
            </p>
          )}
        </div>
      </section>
      {i.state === "SENT" && !i.archivedAt && summary.remainingCents > 0 && (
        <section className="card card-body space-top" aria-labelledby="stripe-payment-heading">
          <h2 id="stripe-payment-heading">Online payment</h2>
          {onlinePaymentLink?.state === "REVIEW" ? (
            <p className="notice warning">
              {onlinePaymentLink.reviewReason ??
                "Stripe confirmed a payment that needs review before it can be recorded."}
            </p>
          ) : onlinePaymentLink?.state === "PAID" ? (
            <p className="notice success">Stripe confirmed this invoice payment.</p>
          ) : (
            <>
              {linkMatchesBalance ? (
                <p>
                  <a
                    className="button"
                    href={onlinePaymentLink.hostedUrl!}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open secure Stripe payment page
                  </a>
                  <span className="muted">
                    {" "}
                    · For <Money cents={onlinePaymentLink.amountCents} />
                  </span>
                </p>
              ) : (
                <p className="muted">
                  {onlinePaymentLink?.state === "CREATING"
                    ? "Stripe is preparing the payment page."
                    : onlinePaymentLink?.state === "OPEN"
                      ? "The balance changed; refresh the link to match the current amount due."
                      : "Create a Stripe-hosted payment page for the remaining balance."}
                </p>
              )}
              <ActionForm
                action={actions.createInvoicePaymentLink}
                submit={linkMatchesBalance ? "Refresh payment link" : "Create payment link"}
              >
                <input type="hidden" name="invoiceId" value={i.id} />
                <div className="field wide">
                  <label htmlFor="stripe-payment-email">Billing email for Stripe</label>
                  <input
                    id="stripe-payment-email"
                    name="customerEmail"
                    type="email"
                    maxLength={254}
                    required
                    defaultValue={paymentContact?.email ?? ""}
                  />
                </div>
              </ActionForm>
            </>
          )}
        </section>
      )}
      <InvoiceEmailComposer
        invoiceId={i.id}
        invoice={{
          number: i.number,
          dealershipName: snap.name,
          dueDate: i.dueDate,
          serviceDates: i.lines.map((line) => line.date),
          remainingCents: emailBalanceCents,
        }}
        contacts={snap.contacts}
        sender={{ name: invoiceIssuer.name, email: invoiceIssuer.email }}
        isDraft={i.state === "DRAFT"}
        eligible={
          !i.archivedAt && (i.state === "DRAFT" || i.state === "APPROVED") && emailBalanceCents > 0
        }
        ineligibleMessage={
          i.archivedAt
            ? "This invoice is archived. Restore it before sending."
            : i.state === "SENT"
              ? "This invoice has already been sent."
              : i.state === "VOIDED"
                ? "Voided invoices cannot be sent."
                : "This invoice has no unpaid balance."
        }
      />
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
