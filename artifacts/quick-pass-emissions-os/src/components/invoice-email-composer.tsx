"use client";

import { useId, useState } from "react";
import { Download, Mail } from "lucide-react";
import {
  buildInvoiceEmail,
  gmailInvoiceDraftUrl,
  type InvoiceEmailDetails,
} from "@/modules/finance/invoice-email";

export function InvoiceEmailComposer({
  invoiceId,
  invoice,
  contacts,
  sender,
  eligible,
}: {
  invoiceId: string;
  invoice: InvoiceEmailDetails;
  contacts: { name: string; email: string; purpose?: string }[];
  sender: { name: string; email: string };
  eligible: boolean;
}) {
  const prefix = useId();
  const emailContacts = contacts.filter((contact) => contact.email);
  const billingContacts = emailContacts.filter((contact) => /billing|invoic|accounts? payable/i.test(contact.purpose ?? ""));
  const defaultContact = emailContacts.length === 1 ? emailContacts[0] : billingContacts.length === 1 ? billingContacts[0] : undefined;
  const [recipient, setRecipient] = useState(defaultContact?.email ?? "");
  const [contactName, setContactName] = useState(defaultContact?.name ?? "");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [senderName, setSenderName] = useState(sender.name);
  const [senderEmail, setSenderEmail] = useState(sender.email);
  const [senderPhone, setSenderPhone] = useState("");
  const draft = buildInvoiceEmail(invoice, {
    contactName, paymentInstructions, senderName, senderEmail, senderPhone,
  });
  const draftReady = !!(contactName.trim() && paymentInstructions.trim() && senderName.trim() && senderEmail.trim());

  return (
    <section className="card card-body space-top" aria-labelledby={`${prefix}-heading`}>
      <h2 id={`${prefix}-heading`}>Invoice PDF & email</h2>
      <p>
        <a className="button" href={`/api/invoices/${encodeURIComponent(invoiceId)}/pdf`} download>
          <Download size={17} aria-hidden="true" /> Download invoice PDF
        </a>
      </p>
      {eligible ? (
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            window.open(gmailInvoiceDraftUrl(recipient, draft.subject, draft.body), "_blank", "noopener,noreferrer");
          }}
        >
          {emailContacts.length > 0 && (
            <div className="field wide">
              <label htmlFor={`${prefix}-contact`}>Choose a billing contact</label>
              <select
                id={`${prefix}-contact`}
                value={emailContacts.some((contact) => contact.email === recipient) ? recipient : ""}
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
            <input id={`${prefix}-recipient`} type="email" maxLength={254} required value={recipient} onChange={(event) => setRecipient(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${prefix}-contact-name`}>Contact name</label>
            <input id={`${prefix}-contact-name`} maxLength={160} required value={contactName} onChange={(event) => setContactName(event.target.value)} />
          </div>
          <div className="field wide">
            <label htmlFor={`${prefix}-payment`}>Payment instructions or payment link</label>
            <textarea id={`${prefix}-payment`} maxLength={500} required value={paymentInstructions} onChange={(event) => setPaymentInstructions(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${prefix}-sender-name`}>Your name</label>
            <input id={`${prefix}-sender-name`} maxLength={160} required value={senderName} onChange={(event) => setSenderName(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${prefix}-sender-email`}>Reply email in signature</label>
            <input id={`${prefix}-sender-email`} type="email" maxLength={254} required value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${prefix}-sender-phone`}>Phone in signature (optional)</label>
            <input id={`${prefix}-sender-phone`} type="tel" maxLength={50} value={senderPhone} onChange={(event) => setSenderPhone(event.target.value)} />
          </div>
          <div className="field wide">
            <label htmlFor={`${prefix}-subject`}>Subject</label>
            <input id={`${prefix}-subject`} readOnly value={draft.subject} />
          </div>
          <details className="field wide">
            <summary>Preview invoice email</summary>
            <label className="sr-only" htmlFor={`${prefix}-body`}>Invoice email preview</label>
            <textarea id={`${prefix}-body`} readOnly value={draftReady ? draft.body : "Complete the contact name, payment instructions, and signature to preview your message."} rows={20} />
          </details>
          <div className="form-footer">
            <p className="muted">
              Gmail is not connected. Attach the downloaded PDF before sending in Gmail.
              Opening a draft does not send email or mark this invoice as sent.
              Record delivery below only after you send it.
            </p>
            <button className="button" type="submit" disabled={!draftReady || !recipient.trim()}>
              <Mail size={17} aria-hidden="true" /> Open Gmail draft
            </button>
          </div>
        </form>
      ) : (
        <p className="muted">Payment-due emails are available for approved, non-voided invoices with an outstanding balance.</p>
      )}
    </section>
  );
}
