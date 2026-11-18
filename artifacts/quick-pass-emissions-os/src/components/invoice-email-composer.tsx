"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Download, Mail } from "lucide-react";
import {
  buildInvoiceEmail,
  invoiceBccEmail,
  type InvoiceEmailDetails,
} from "@/modules/finance/invoice-email";
import { sendInvoiceFromGmail, type InvoiceGmailSendState } from "@/app/invoice-email-actions";

export function InvoiceEmailComposer({
  invoiceId,
  invoice,
  contacts,
  sender,
  isDraft = false,
  eligible,
  ineligibleMessage,
}: {
  invoiceId: string;
  invoice: InvoiceEmailDetails;
  contacts: { name: string; email: string; purpose?: string }[];
  sender: { name: string; email: string };
  isDraft?: boolean;
  eligible: boolean;
  ineligibleMessage?: string;
}) {
  const prefix = useId();
  const confirmation = useRef<HTMLDialogElement>(null);
  const approvedSend = useRef(false);
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [state, formAction, pending] = useActionState<InvoiceGmailSendState | null, FormData>(
    async (previous, data) => {
      const result = await sendInvoiceFromGmail(previous, data);
      setConfirmingSend(false);
      return result;
    },
    null,
  );
  const emailContacts = contacts.filter((contact) => contact.email);
  const billingContacts = emailContacts.filter((contact) =>
    /billing|invoic|accounts? payable/i.test(contact.purpose ?? ""),
  );
  const defaultContact =
    emailContacts.length === 1
      ? emailContacts[0]
      : billingContacts.length === 1
        ? billingContacts[0]
        : undefined;
  const [recipient, setRecipient] = useState(defaultContact?.email ?? "");
  const [contactName, setContactName] = useState(defaultContact?.name ?? "");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [senderName, setSenderName] = useState(
    sender.name === "Quick Pass Emissions" ? "" : sender.name,
  );
  const senderEmail = sender.email;
  const [senderPhone, setSenderPhone] = useState("");
  const [includeBcc, setIncludeBcc] = useState(true);
  useEffect(() => {
    const dialog = confirmation.current;
    if (confirmingSend && dialog && !dialog.open) dialog.showModal();
    else if (!confirmingSend && dialog?.open) dialog.close();
  }, [confirmingSend]);
  const emailPreview = buildInvoiceEmail(invoice, {
    contactName,
    paymentInstructions,
    senderName,
    senderEmail,
    senderPhone,
  });
  const draftReady = !!(contactName.trim() && senderEmail.trim());

  return (
    <section className="card card-body space-top" aria-labelledby={`${prefix}-heading`}>
      <h2 id={`${prefix}-heading`}>Send invoice email</h2>
      <p>
        <a className="button" href={`/api/invoices/${encodeURIComponent(invoiceId)}/pdf`} download>
          <Download size={17} aria-hidden="true" /> Download invoice PDF
        </a>
      </p>
      {eligible ? (
        <form
          className="form-grid"
          action={formAction}
          onSubmit={(event) => {
            if (!approvedSend.current) {
              event.preventDefault();
              setConfirmingSend(true);
            } else {
              approvedSend.current = false;
            }
          }}
        >
          <input type="hidden" name="invoiceId" value={invoiceId} />
          {emailContacts.length > 0 && (
            <div className="field wide">
              <label htmlFor={`${prefix}-contact`}>Choose a billing contact</label>
              <select
                id={`${prefix}-contact`}
                value={
                  emailContacts.some((contact) => contact.email === recipient) ? recipient : ""
                }
                onChange={(event) => {
                  const contact = emailContacts.find((item) => item.email === event.target.value);
                  setRecipient(contact?.email ?? "");
                  setContactName(contact?.name ?? "");
                }}
              >
                <option value="">Other recipient</option>
                {emailContacts.map((contact, index) => (
                  <option key={`${contact.email}-${index}`} value={contact.email}>
                    {contact.name} · {contact.email}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor={`${prefix}-recipient`}>Recipient email</label>
            <input
              id={`${prefix}-recipient`}
              name="recipient"
              type="email"
              maxLength={254}
              required
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${prefix}-contact-name`}>Contact name</label>
            <input
              id={`${prefix}-contact-name`}
              name="contactName"
              maxLength={160}
              required
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
            />
          </div>
          <div className="field wide">
            <label htmlFor={`${prefix}-payment`}>Additional payment note (optional)</label>
            <textarea
              id={`${prefix}-payment`}
              name="paymentInstructions"
              maxLength={500}
              value={paymentInstructions}
              onChange={(event) => setPaymentInstructions(event.target.value)}
            />
            <small>A unique Stripe payment link for the remaining balance is added when sent.</small>
          </div>
          <div className="field">
            <label htmlFor={`${prefix}-sender-name`}>Your name (optional)</label>
            <input
              id={`${prefix}-sender-name`}
              name="senderName"
              maxLength={160}
              placeholder="Leave blank to use the business name"
              value={senderName}
              onChange={(event) => setSenderName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${prefix}-sender-email`}>Quick Pass email</label>
            <input
              id={`${prefix}-sender-email`}
              type="email"
              maxLength={254}
              required
              value={senderEmail}
              readOnly
            />
          </div>
          <label className="check-row wide">
            <input
              name="includeBcc"
              type="checkbox"
              checked={includeBcc}
              onChange={(event) => setIncludeBcc(event.currentTarget.checked)}
            />
            <span>
              Blind copy this invoice to <strong>{invoiceBccEmail}</strong>
              <small>Hidden from the dealership recipient.</small>
            </span>
          </label>
          <div className="field">
            <label htmlFor={`${prefix}-sender-phone`}>Phone in signature (optional)</label>
            <input
              id={`${prefix}-sender-phone`}
              name="senderPhone"
              type="tel"
              maxLength={50}
              value={senderPhone}
              onChange={(event) => setSenderPhone(event.target.value)}
            />
          </div>
          <div className="field wide">
            <label htmlFor={`${prefix}-subject`}>Subject</label>
            <input id={`${prefix}-subject`} readOnly value={emailPreview.subject} />
          </div>
          <details className="field wide">
            <summary>Preview invoice email</summary>
            <label className="sr-only" htmlFor={`${prefix}-body`}>
              Invoice email preview
            </label>
            <textarea
              id={`${prefix}-body`}
              readOnly
              value={
                draftReady
                  ? emailPreview.body
                  : "Complete the contact name and signature to preview your message."
              }
              rows={20}
            />
          </details>
          <div className="form-footer">
            <p className="muted">
              {isDraft && "Sending issues this draft invoice. "}
              Sends directly from qpemissions@gmail.com with the invoice PDF attached, then records
              the invoice as sent.
            </p>
            <button
              className="button"
              type="submit"
              disabled={
                !draftReady ||
                !recipient.trim() ||
                pending ||
                !!state?.ok ||
                confirmingSend ||
                !!state?.uncertain
              }
            >
              <Mail size={17} aria-hidden="true" />
              {pending ? "Sending…" : "Send invoice"}
            </button>
          </div>
          <dialog
            ref={confirmation}
            className="employee-removal-confirmation"
            role="alertdialog"
            aria-labelledby={`${prefix}-confirm`}
            aria-describedby={`${prefix}-confirm-description`}
            onCancel={(event) => {
              event.preventDefault();
              if (!pending) setConfirmingSend(false);
            }}
            onClose={() => setConfirmingSend(false)}
            onClick={(event) => {
              if (!pending && event.target === confirmation.current) setConfirmingSend(false);
            }}
          >
            <div className="card-body">
              <p className="employee-removal-eyebrow">Invoice email</p>
              <h2 id={`${prefix}-confirm`}>Send this invoice?</h2>
              <p id={`${prefix}-confirm-description`}>
                Send invoice <strong>{invoice.number}</strong> to <strong>{recipient}</strong>, with
                the PDF attached? This sends the email now
                {isDraft ? " and issues the invoice" : ""}. The app will record it as sent.
              </p>
              <p>
                {includeBcc ? (
                  <>
                    Blind copy: <strong>{invoiceBccEmail}</strong> (hidden from the dealership)
                  </>
                ) : (
                  "No blind copy will be sent."
                )}
              </p>
              <div className="form-footer">
                <button
                  className="button button-secondary"
                  type="button"
                  autoFocus
                  disabled={pending}
                  onClick={() => setConfirmingSend(false)}
                >
                  Cancel
                </button>
                <button
                  className="button"
                  type="submit"
                  disabled={pending}
                  onClick={() => {
                    approvedSend.current = true;
                  }}
                >
                  {pending ? "Sending…" : "Confirm and send invoice"}
                </button>
              </div>
            </div>
          </dialog>
          {state && (
            <div className="field wide" role={state.ok ? "status" : "alert"} aria-live="polite">
              <p>{state.message}</p>
            </div>
          )}
        </form>
      ) : (
        <p className="muted" role={state?.ok && state.sent ? "status" : undefined}>
          {state?.ok && state.sent
            ? state.message
            : (ineligibleMessage ?? "Invoice email is unavailable.")}
        </p>
      )}
    </section>
  );
}
