import { describe, expect, it, vi } from "vitest";
import type { ReplitConnectors } from "@replit/connectors-sdk";
import { Buffer } from "node:buffer";
import {
  invoiceGmailMessageId,
  invoiceGmailResendMessageId,
  invoiceGmailRawMessage,
  findSentGmailMessage,
  findSentGmailResendMessage,
} from "../src/modules/finance/invoice-gmail";
import { invoiceBccEmail } from "../src/modules/finance/invoice-email";

describe("invoice Gmail MIME message", () => {
  it("uses one stable message ID per invoice for duplicate-send checks", () => {
    expect(invoiceGmailMessageId("QP-2026-0001")).toBe("<qp-2026-0001@quickpassemissions.com>");
  });

  it("creates a base64url draft message with the PDF attached", () => {
    const raw = invoiceGmailRawMessage({
      to: "billing@example.com",
      subject: "Invoice QP-2026-0001",
      body: "Hello billing team",
      invoiceNumber: "QP-2026-0001",
      pdf: Buffer.from("%PDF-demo"),
      includeBcc: true,
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

  it("marks a resend with its unique attempt key and message ID", () => {
    const requestId = "6ee9130f-05e8-4fe0-89dc-b675990ac918";
    const message = Buffer.from(
      invoiceGmailRawMessage({
        to: "billing@example.com",
        subject: "Invoice copy",
        body: "Same invoice",
        invoiceNumber: "QP-2026-0001",
        pdf: Buffer.from("%PDF-demo"),
        includeBcc: false,
        resendRequestId: requestId,
      }),
      "base64url",
    ).toString("utf8");
    expect(message).toContain(`X-Quick-Pass-Resend-ID: ${requestId}`);
    expect(message).toContain(
      `Message-ID: ${invoiceGmailResendMessageId("QP-2026-0001", requestId)}`,
    );
    expect(message).toContain('filename="Quick-Pass-QP-2026-0001.pdf"');
    expect(message).not.toContain("Bcc:");
  });

  it("omits the blind-copy header when the sender opts out", () => {
    const raw = invoiceGmailRawMessage({
      to: "billing@example.com",
      subject: "Invoice QP-2026-0001",
      body: "Hello billing team",
      invoiceNumber: "QP-2026-0001",
      pdf: Buffer.from("%PDF-demo"),
      includeBcc: false,
    });
    const message = Buffer.from(raw, "base64url").toString("utf8");

    expect(message).toContain("To: billing@example.com");
    expect(message).not.toContain("Bcc:");
    expect(message).not.toContain(invoiceBccEmail);
  });

  it("rejects recipient header injection", () => {
    expect(() =>
      invoiceGmailRawMessage({
        to: "billing@example.com\r\nBcc: someone@example.com",
        subject: "Invoice",
        body: "Message",
        invoiceNumber: "QP-2026-0001",
        pdf: new Uint8Array([1]),
        includeBcc: false,
      }),
    ).toThrow("Enter one valid recipient email.");
  });
});

describe("sent invoice reconciliation", () => {
  const response = (value: unknown) => Response.json(value);
  const attachment = "Quick-Pass-QP-2026-0002.pdf";
  const messageId = invoiceGmailMessageId("QP-2026-0002");
  const connector = (proxy: ReturnType<typeof vi.fn>) => ({ proxy }) as unknown as ReplitConnectors;

  it("finds the sent PDF even when Gmail replaced the original message ID", async () => {
    const proxy = vi
      .fn()
      .mockResolvedValueOnce(response({ messages: [] }))
      .mockResolvedValueOnce(response({ messages: [{ id: "sent-message" }] }))
      .mockResolvedValueOnce(
        response({
          labelIds: ["SENT"],
          payload: { parts: [{ filename: attachment }] },
        }),
      );
    expect(await findSentGmailMessage(connector(proxy), messageId)).toBe("sent-message");
    expect(decodeURIComponent(proxy.mock.calls[1][1])).toContain(attachment);
  });

  it("does not mistake a different invoice or a draft email for a sent invoice", async () => {
    const proxy = vi
      .fn()
      .mockResolvedValueOnce(response({ messages: [] }))
      .mockResolvedValueOnce(response({ messages: [{ id: "other" }, { id: "draft" }] }))
      .mockResolvedValueOnce(
        response({
          labelIds: ["SENT"],
          payload: { filename: "Quick-Pass-QP-2026-0001.pdf" },
        }),
      )
      .mockResolvedValueOnce(
        response({
          labelIds: ["DRAFT"],
          payload: { filename: attachment },
        }),
      );
    expect(await findSentGmailMessage(connector(proxy), messageId)).toBeNull();
  });

  it("blocks another send when the attachment check cannot be completed", async () => {
    const proxy = vi
      .fn()
      .mockResolvedValueOnce(response({ messages: [] }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(findSentGmailMessage(connector(proxy), messageId)).rejects.toThrow(
      "Could not check",
    );
  });

  it("reconciles only the matching resend marker, recipient, and invoice attachment", async () => {
    const requestId = "6ee9130f-05e8-4fe0-89dc-b675990ac918";
    const createdAt = new Date("2026-11-18T10:00:00.000Z");
    const proxy = vi
      .fn()
      .mockResolvedValueOnce(response({ messages: [{ id: "resend-message" }] }))
      .mockResolvedValueOnce(
        response({
          labelIds: ["SENT"],
          payload: {
            headers: [
              { name: "X-Quick-Pass-Resend-ID", value: requestId },
              { name: "To", value: "Billing <billing@example.com>" },
            ],
            parts: [{ filename: attachment }],
          },
        }),
      );
    expect(
      await findSentGmailResendMessage(connector(proxy), {
        requestId,
        invoiceNumber: "QP-2026-0002",
        recipient: "billing@example.com",
        createdAt,
      }),
    ).toBe("resend-message");

    const mismatch = vi
      .fn()
      .mockResolvedValueOnce(response({ messages: [{ id: "wrong-recipient" }] }))
      .mockResolvedValueOnce(
        response({
          labelIds: ["SENT"],
          payload: {
            headers: [
              { name: "X-Quick-Pass-Resend-ID", value: requestId },
              { name: "To", value: "other@example.com" },
            ],
            parts: [{ filename: attachment }],
          },
        }),
      );
    expect(
      await findSentGmailResendMessage(connector(mismatch), {
        requestId,
        invoiceNumber: "QP-2026-0002",
        recipient: "billing@example.com",
        createdAt,
      }),
    ).toBeNull();
  });
});
