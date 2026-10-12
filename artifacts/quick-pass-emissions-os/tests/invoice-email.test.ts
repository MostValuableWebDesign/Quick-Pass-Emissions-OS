import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvoiceEmailComposer } from "@/components/invoice-email-composer";
import { buildInvoiceEmail, gmailInvoiceDraftUrl, invoiceServicePeriod } from "@/modules/finance/invoice-email";

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
      "Hi Fixture Billing,", "Oct 1, 2026 to Oct 3, 2026", "INV-104",
      "Outstanding balance: $120.00", "Payment due date: Oct 20, 2026",
      signature.paymentInstructions, signature.senderName, signature.senderPhone, signature.senderEmail,
      "If payment has already been sent, please reply with the payment date and reference number",
    ]) expect(draft.body).toContain(text);
    expect(draft.body).not.toMatch(/\[[^\]]+\]/);
  });

  it("encodes all draft data as Gmail query values rather than extra recipients or parameters", () => {
    const draft = buildInvoiceEmail(invoice, { ...signature, paymentInstructions: "https://example.test/pay?a=1&b=2" });
    const url = new URL(gmailInvoiceDraftUrl("billing@example.test", draft.subject, draft.body));
    expect(url.origin).toBe("https://mail.google.com");
    expect(url.searchParams.get("to")).toBe("billing@example.test");
    expect(url.searchParams.get("su")).toBe(draft.subject);
    expect(url.searchParams.get("body")).toBe(draft.body);
    expect(url.searchParams.has("b")).toBe(false);
    expect(url.searchParams.has("attachment")).toBe(false);
  });

  it("uses one business date for a single-day service period and omits an absent signature phone", () => {
    expect(invoiceServicePeriod(["2026-10-03", "2026-10-03"])).toBe("Oct 3, 2026");
    const draft = buildInvoiceEmail(invoice, { ...signature, senderPhone: "" });
    expect(draft.body).not.toContain("undefined");
    expect(draft.body).not.toContain("555-0100");
  });

  it("shows a protected PDF download and manual attachment warning for approved invoices", () => {
    const html = renderToStaticMarkup(createElement(InvoiceEmailComposer, {
      invoiceId: "fixture-invoice", invoice, eligible: true,
      contacts: [{ name: "Fixture Billing", email: "billing@example.test" }],
      sender: { name: signature.senderName, email: signature.senderEmail },
    }));
    expect(html).toContain('href="/api/invoices/fixture-invoice/pdf"');
    expect(html).toContain("Open Gmail draft");
    expect(html).toContain("Attach the downloaded PDF");
    expect(html).toContain("does not send email or mark this invoice as sent");
    expect(html).toContain('value="billing@example.test"');
    expect(html).toContain("Payment instructions or payment link");
  });

  it("does not offer payment-due email drafts for ineligible invoices", () => {
    const html = renderToStaticMarkup(createElement(InvoiceEmailComposer, {
      invoiceId: "fixture-invoice", invoice, eligible: false, contacts: [],
      sender: { name: signature.senderName, email: signature.senderEmail },
    }));
    expect(html).toContain("Download invoice PDF");
    expect(html).not.toContain("Open Gmail draft");
    expect(html).not.toContain("Recipient email");
  });

  it("requires choosing a contact rather than guessing among multiple non-billing recipients", () => {
    const html = renderToStaticMarkup(createElement(InvoiceEmailComposer, {
      invoiceId: "fixture-invoice", invoice, eligible: true,
      contacts: [
        { name: "Sales", email: "sales@example.test", purpose: "Sales" },
        { name: "Service", email: "service@example.test", purpose: "Service" },
      ],
      sender: { name: signature.senderName, email: signature.senderEmail },
    }));
    expect(html.match(/<input[^>]*type="email"[^>]*value="([^"]*)"/)?.[1]).toBe("");
  });
});
