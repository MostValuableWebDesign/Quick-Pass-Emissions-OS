"use client";

import { useActionState, useId, useState } from "react";
import { Download, Mail } from "lucide-react";
import {
  buildInvoiceEmail,
  invoiceBccEmail,
  type InvoiceEmailDetails,
} from "@/modules/finance/invoice-email";
import {
  sendInvoiceFromGmail,
  type InvoiceGmailSendState,
} from "@/app/invoice-email-actions";

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
  const [state, formAction, pending] = useActionState<InvoiceGmailSendState | null, FormData>(
    sendInvoiceFromGmail,
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
  const [confirmingSend, setConfirmingSend] = useState(false);
  const emailPreview = buildInvoiceEmail(invoice, {
    contactName,
    paymentInstructions,
    senderName,
    senderEmail,
    senderPhone,
  });
  const draftReady = !!(
    contactName.trim() &&
    paymentInstructions.trim() &&
    senderEmail.trim()
  );

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
            if (!confirmingSend) {
              event.preventDefault();
              setConfirmingSend(true);
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
            <label htmlFor={`${prefix}-payment`}>Payment instructions or payment link</label>
            <textarea
              id={`${prefix}-payment`}
              name="paymentInstructions"
              maxLength={500}
              required
              value={paymentInstructions}
              onChange={(event) => setPaymentInstructions(event.target.value)}
            />
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
          <p className="field wide muted">
            Blind copy on invoices: <strong>{invoiceBccEmail}</strong> (not visible to the dealership)
          </p>
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
                  : "Complete the contact name, payment instructions, and signature to preview your message."
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
              disabled={!draftReady || !recipient.trim() || pending || !!state?.ok || confirmingSend || !!state?.uncertain}
            >
              <Mail size={17} aria-hidden="true" />
              {pending ? "Sending…" : "Send invoice"}
            </button>
          </div>
          {confirmingSend && !state?.ok && !state?.uncertain && (
            <div className="field wide card card-body" role="group" aria-labelledby={`${prefix}-confirm`}>
              <h3 id={`${prefix}-confirm`}>Confirm invoice send</h3>
              <p>
                Send invoice <strong>{invoice.number}</strong> to <strong>{recipient}</strong>, with
                the PDF attached? This sends the email now
                {isDraft ? " and issues the invoice" : ""}. The app will record it as sent.
              </p>
              <p>
                Blind copy: <strong>{invoiceBccEmail}</strong> (hidden from the dealership)
              </p>
              <div className="form-footer">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setConfirmingSend(false)}
                >
                  Cancel
                </button>
                <button className="button" type="submit" disabled={pending}>
                  {pending ? "Sending…" : "Confirm and send invoice"}
                </button>
              </div>
            </div>
          )}
          {state && (
            <div
              className="field wide"
              role={state.ok ? "status" : "alert"}
              aria-live="polite"
            >
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
