import { randomUUID } from "node:crypto";
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
import { DealerVirUpload } from "@/components/dealer-vir-upload";
import { pendingDealerVirReview } from "@/modules/finance/dealer-vir-service";
import { invoiceLineDescription } from "@/modules/finance/invoice-document";
import * as actions from "@/app/phase4-actions";
import { checkInvoiceResend, resolveInvoiceResendNotSent } from "@/app/invoice-email-actions";
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
  const currentEmailContacts = [
    ...i.dealership.contacts.filter((contact) => contact.email.trim()),
    ...(i.dealership.email.trim() &&
    !i.dealership.contacts.some(
      (contact) => contact.email.toLowerCase() === i.dealership.email.toLowerCase(),
    )
      ? [
          {
            name: i.dealership.name,
            email: i.dealership.email,
            purpose: "Primary email",
          },
        ]
      : []),
  ];
  const sendContacts = currentEmailContacts.length ? currentEmailContacts : snap.contacts;
  const onlinePaymentLink = i.stripePaymentLink;
  const latestResend = i.emailResends[0];
  const resendUnresolved = latestResend && ["PREPARING", "UNCERTAIN"].includes(latestResend.state);
  const pendingVirReview =
    !i.archivedAt && i.state !== "VOIDED"
      ? await pendingDealerVirReview(actor.id, i.dealershipId)
      : null;
  return (
    <>
      <PageHeader
        title={`Invoice ${i.number}`}
        description={`${summary.status} · Issued ${i.issueDate}${i.sentDate ? ` · Sent ${i.sentDate}` : ""}`}
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
          {!i.archivedAt && i.state !== "VOIDED" && (
            <DealerVirUpload dealershipId={i.dealershipId} resumeUploadId={pendingVirReview?.id} />
          )}
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
                  <td style={{ whiteSpace: "pre-line" }}>
                    {invoiceLineDescription(l.description)}
                  </td>
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
      {i.state === "SENT" && !i.archivedAt && (
        <section className="card card-body space-top" aria-labelledby="stripe-payment-heading">
          <h2 id="stripe-payment-heading">Online payment</h2>
          <p className="muted">
            The invoice PDF includes a clickable payment link when one is active. Sending an invoice
            with a balance creates the invoice-specific link automatically.
          </p>
          {onlinePaymentLink?.state === "REVIEW" ? (
            <p className="notice warning">
              {onlinePaymentLink.reviewReason ??
                "Stripe confirmed a payment that needs review before it can be recorded."}
            </p>
          ) : summary.remainingCents === 0 ? (
            <p className="notice success">
              {onlinePaymentLink?.state === "PAID"
                ? "Stripe confirmed this invoice payment."
                : "This invoice has no unpaid balance."}
            </p>
          ) : (
            <>
              {i.stripePaymentToken && summary.remainingCents > 0 ? (
                <p>
                  <a
                    className="button"
                    href={`/api/invoices/pay/${i.stripePaymentToken}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open secure Stripe payment page
                  </a>
                  <span className="muted">
                    {" "}
                    · For <Money cents={summary.remainingCents} />
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
              {!i.stripePaymentToken && summary.remainingCents > 0 && (
                <ActionForm action={actions.createInvoicePaymentLink} submit="Create payment link">
                  <input type="hidden" name="invoiceId" value={i.id} />
                </ActionForm>
              )}
            </>
          )}
          {onlinePaymentLink?.stripeInvoiceId && (
            <ActionForm action={actions.refreshInvoicePayment} submit="Check Stripe payment status">
              <input type="hidden" name="invoiceId" value={i.id} />
            </ActionForm>
          )}
          {onlinePaymentLink && ["CREATING", "OPEN"].includes(onlinePaymentLink.state) && (
            <ActionForm
              action={actions.cancelInvoicePaymentLink}
              submit="Cancel online payment"
              confirmTitle="Cancel this online payment request?"
              confirmOnSubmit="The app will verify Stripe has not received payment, close any unpaid payment page, and disable the old email link. Your invoice and manual payment history will remain."
              confirmConfirmLabel="Cancel online payment"
            >
              <input type="hidden" name="invoiceId" value={i.id} />
            </ActionForm>
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
        contacts={sendContacts}
        sender={{ name: invoiceIssuer.name, email: invoiceIssuer.email }}
        isDraft={i.state === "DRAFT"}
        isResend={i.state === "SENT"}
        resendRequestId={i.state === "SENT" ? randomUUID() : undefined}
        eligible={
          !i.archivedAt &&
          !resendUnresolved &&
          (i.state === "SENT" ||
            ((i.state === "DRAFT" || i.state === "APPROVED") && emailBalanceCents > 0))
        }
        ineligibleMessage={
          i.archivedAt
            ? "This invoice is archived. Restore it before sending."
            : resendUnresolved
              ? "A previous resend needs to be checked before another email can be sent."
              : i.state === "SENT"
                ? "This sent invoice cannot be resent in its current state."
                : i.state === "VOIDED"
                  ? "Voided invoices cannot be sent."
                  : "This invoice has no unpaid balance."
        }
      />
      {latestResend && (
        <section className="card card-body space-top" aria-labelledby="invoice-resend-status">
          <h2 id="invoice-resend-status">Invoice resend history</h2>
          <p>
            {latestResend.state} · {latestResend.recipient} ·{" "}
            {formatDate(latestResend.sentAt ?? latestResend.createdAt)}
          </p>
          {resendUnresolved && (
            <>
              <p className="notice warning">
                Check Gmail Sent before starting another resend. An uncertain attempt is blocked
                from sending again until it is reconciled.
              </p>
              <ActionForm action={checkInvoiceResend} submit="Check Gmail Sent">
                <input type="hidden" name="invoiceId" value={i.id} />
                <input type="hidden" name="attemptId" value={latestResend.id} />
              </ActionForm>
              <ActionForm
                action={resolveInvoiceResendNotSent}
                submit="I checked Sent; allow another resend"
                confirmEyebrow="Invoice email"
                confirmTitle="Release this resend attempt?"
                confirmConfirmLabel="Confirm no email was sent"
                confirmCancelLabel="Keep it blocked"
                confirmOnSubmit="Only continue after checking the connected Gmail Sent folder and confirming this resend is not there. If the email was sent, releasing it could allow a duplicate."
              >
                <input type="hidden" name="invoiceId" value={i.id} />
                <input type="hidden" name="attemptId" value={latestResend.id} />
                <input type="hidden" name="confirmNoEmail" value="true" />
              </ActionForm>
            </>
          )}
        </section>
      )}
      {i.approvedAt && i.state !== "VOIDED" && summary.remainingCents > 0 && (
        <section className="card card-body space-top">
          <h2>Record received payment</h2>
          <p className="muted">
            Record cash, check or other confirmed receipts in chronological order. Any unpaid Stripe
            payment page is closed before the balance changes.
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
            {p.stripeInvoiceId && (
              <p className="muted">Confirmed by Stripe. Refunds are managed in Stripe.</p>
            )}
            {management &&
              p.amountCents > 0 &&
              !p.reversal &&
              !p.stripeInvoiceId &&
              i.state !== "VOIDED" && (
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
            {h.actor?.name ?? (h.action.includes("STRIPE") ? "Stripe" : "Former user")}
          </p>
        ))}
      </section>
    </>
  );
}
