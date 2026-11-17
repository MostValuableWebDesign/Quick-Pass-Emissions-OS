import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import {
  invoiceGmailMessageId,
  invoiceGmailRawMessage,
} from "../src/modules/finance/invoice-gmail";
import { invoiceBccEmail } from "../src/modules/finance/invoice-email";

describe("invoice Gmail MIME message", () => {
  it("uses one stable message ID per invoice for duplicate-send checks", () => {
    expect(invoiceGmailMessageId("QP-2026-0001")).toBe(
      "<qp-2026-0001@quickpassemissions.com>",
    );
  });

  it("creates a base64url draft message with the PDF attached", () => {
    const raw = invoiceGmailRawMessage({
      to: "billing@example.com",
      subject: "Invoice QP-2026-0001",
      body: "Hello billing team",
      invoiceNumber: "QP-2026-0001",
      pdf: Buffer.from("%PDF-demo"),
    });
    const message = Buffer.from(raw, "base64url").toString("utf8");

    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(message).toContain("From: Quick Pass Emissions <qpemissions@gmail.com>");
    expect(message).toContain("To: billing@example.com");
    expect(message).toContain(`Bcc: ${invoiceBccEmail}`);
    expect(message).toContain("Message-ID: <qp-2026-0001@quickpassemissions.com>");
    expect(message).toContain('filename="Quick-Pass-QP-2026-0001.pdf"');
    expect(message).toContain(Buffer.from("Invoice QP-2026-0001").toString("base64"));
    expect(message).toContain(Buffer.from("Hello billing team").toString("base64"));
    expect(message).toContain(Buffer.from("%PDF-demo").toString("base64"));
  });

  it("rejects recipient header injection", () => {
    expect(() =>
      invoiceGmailRawMessage({
        to: "billing@example.com\r\nBcc: someone@example.com",
        subject: "Invoice",
        body: "Message",
        invoiceNumber: "QP-2026-0001",
        pdf: new Uint8Array([1]),
      }),
    ).toThrow("Enter one valid recipient email.");
  });
});
