import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvoiceEmailComposer } from "@/components/invoice-email-composer";
import {
  buildInvoiceEmail,
  invoiceBccEmail,
  invoiceServicePeriod,
} from "@/modules/finance/invoice-email";
import { invoiceIssuer } from "@/modules/finance/invoice-document";

const invoice = {
  number: "INV-104",
  dealershipName: "Fixture & Sons Motors",
  dueDate: "2026-10-20",
  serviceDates: ["2026-10-03", "2026-10-01"],
  remainingCents: 12000,
};
const signature = {
  contactName: "Fixture Billing",
  paymentInstructions: "the payment instructions agreed with Quick Pass",
  senderName: "Fixture Manager",
  senderPhone: "555-0100",
  senderEmail: "manager@example.test",
};

describe("manual dealership invoice emails", () => {
  it("fills the user's message with the correct outstanding balance, period and signature", () => {
    const draft = buildInvoiceEmail(invoice, signature);
    expect(draft.subject).toBe("Quick Pass Emissions — Payment Due for Fixture & Sons Motors");
    for (const text of [
      "Hi Fixture Billing,",
      "Oct 1, 2026 to Oct 3, 2026",
      "INV-104",
      "Outstanding balance: $120.00",
      "Payment due date: Oct 20, 2026",
      signature.paymentInstructions,
      signature.senderName,
      signature.senderPhone,
      signature.senderEmail,
      invoiceIssuer.website,
      "If payment has already been sent, please reply with the payment date and reference number",
    ])
      expect(draft.body).toContain(text);
    expect(draft.body).not.toMatch(/\[[^\]]+\]/);
  });

  it("uses one business date for a single-day service period and omits an absent signature phone", () => {
    expect(invoiceServicePeriod(["2026-10-03", "2026-10-03"])).toBe("Oct 3, 2026");
    const draft = buildInvoiceEmail(invoice, { ...signature, senderPhone: "" });
    expect(draft.body).not.toContain("undefined");
    expect(draft.body).not.toContain("555-0100");
  });

  it("includes the company name once when no personal sender name is entered", () => {
    const draft = buildInvoiceEmail(invoice, {
      ...signature,
      senderName: "",
      senderPhone: "",
      senderEmail: invoiceIssuer.email,
    });
    expect(draft.body.match(/Quick Pass Emissions/g)).toHaveLength(1);
    expect(draft.body).toContain("quickpassemissions.com");
    expect(draft.body).toContain("qpemissions@gmail.com");
  });

  it("lets an unapproved draft send a Gmail invoice with a PDF attached", () => {
    const html = renderToStaticMarkup(
      createElement(InvoiceEmailComposer, {
        invoiceId: "fixture-invoice",
        invoice,
        isDraft: true,
        eligible: true,
        contacts: [{ name: "Fixture Billing", email: "billing@example.test" }],
        sender: { name: invoiceIssuer.name, email: invoiceIssuer.email },
      }),
    );
    expect(html).toContain('href="/api/invoices/fixture-invoice/pdf"');
    expect(html).toContain("Send invoice");
    expect(html).toContain("with the invoice PDF attached");
    expect(html).toContain("Sends directly from qpemissions@gmail.com");
    expect(html).toContain('value="billing@example.test"');
    expect(html).toContain("Payment instructions or payment link");
    expect(html).toContain("Sending issues this draft invoice.");
    expect(html).toContain('value="qpemissions@gmail.com"');
    expect(html).toContain(`Blind copy this invoice to <strong>${invoiceBccEmail}</strong>`);
    expect(html).toContain('name="includeBcc"');
    expect(html).toContain('checked=""');
    expect(html).toContain('readOnly=""');
  });

  it("does not offer payment-due email drafts for ineligible invoices", () => {
    const html = renderToStaticMarkup(
      createElement(InvoiceEmailComposer, {
        invoiceId: "fixture-invoice",
        invoice,
        eligible: false,
        contacts: [],
        sender: { name: signature.senderName, email: signature.senderEmail },
      }),
    );
    expect(html).toContain("Download invoice PDF");
    expect(html).not.toContain('type="submit"');
    expect(html).not.toContain("Recipient email");
  });

  it("requires choosing a contact rather than guessing among multiple non-billing recipients", () => {
    const html = renderToStaticMarkup(
      createElement(InvoiceEmailComposer, {
        invoiceId: "fixture-invoice",
        invoice,
        eligible: true,
        contacts: [
          { name: "Sales", email: "sales@example.test", purpose: "Sales" },
          { name: "Service", email: "service@example.test", purpose: "Service" },
        ],
        sender: { name: signature.senderName, email: signature.senderEmail },
      }),
    );
    expect(html.match(/<input[^>]*type="email"[^>]*value="([^"]*)"/)?.[1]).toBe("");
  });
});
