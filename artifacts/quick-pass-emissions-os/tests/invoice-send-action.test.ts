import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  proxy: vi.fn(),
  detail: vi.fn(),
  record: vi.fn(),
  findSent: vi.fn(),
  revalidate: vi.fn(),
  paymentLink: vi.fn(),
  raw: vi.fn(),
  beginResend: vi.fn(),
  finishResend: vi.fn(),
  failResend: vi.fn(),
  findResend: vi.fn(),
}));
vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: class {
    proxy = mocks.proxy;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/access", () => ({ currentUser: async () => ({ id: "owner" }) }));
vi.mock("@/lib/time", () => ({ businessDate: () => "2026-11-17" }));
vi.mock("@/modules/finance/service", () => ({
  invoiceDetail: mocks.detail,
  recordGmailInvoiceSent: mocks.record,
  beginInvoiceResend: mocks.beginResend,
  finishInvoiceResend: mocks.finishResend,
  updateInvoiceResendFailure: mocks.failResend,
}));
vi.mock("@/modules/finance/invoice-document", () => ({
  invoiceIssuer: { email: "qpemissions@gmail.com" },
  invoiceSnapshotSchema: { parse: () => ({ name: "Fixture dealer" }) },
}));
vi.mock("@/modules/finance/invoice-pdf", () => ({
  createInvoicePdf: async () => new Uint8Array([1]),
}));
vi.mock("@/modules/finance/stripe-payments", () => ({
  prepareInvoicePaymentLink: mocks.paymentLink,
}));
vi.mock("@/modules/finance/invoice-gmail", () => ({
  findSentGmailMessage: mocks.findSent,
  findSentGmailResendMessage: mocks.findResend,
  invoiceGmailMessageId: () => "<qp-2026-0002@quickpassemissions.com>",
  invoiceGmailRawMessage: mocks.raw,
}));

import { sendInvoiceFromGmail } from "@/app/invoice-email-actions";

const invoice = {
  id: "fixture-invoice",
  dealershipId: "fixture-dealer",
  version: 0,
  number: "QP-2026-0002",
  state: "DRAFT",
  approvedAt: null,
  archivedAt: null,
  totalCents: 1500,
  issueDate: "2026-11-17",
  dueDate: "2026-12-17",
  voidDate: null,
  payments: [],
  lines: [{ date: "2026-11-17" }],
  snapshot: {},
};
const form = () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    invoiceId: invoice.id,
    recipient: "billing@example.com",
    contactName: "Billing",
    paymentInstructions: "Pay by check",
  }))
    data.set(key, value);
  return data;
};

describe("confirmed Gmail invoice send", () => {
  it("uses the remaining balance on a partially paid resend without recording another payment", async () => {
    mocks.detail.mockResolvedValue({
      invoice: {
        ...invoice,
        state: "SENT",
        approvedAt: new Date(),
        payments: [{ amountCents: 500, date: "2026-11-17" }],
      },
      demo: false,
    });
    const requestId = "6ee9130f-05e8-4fe0-89dc-b675990ac918";
    mocks.beginResend.mockResolvedValue({
      status: "READY",
      attempt: { id: "attempt", requestId, createdAt: new Date() },
    });
    mocks.findResend.mockResolvedValue(null);
    const data = form();
    data.set("sendMode", "RESEND");
    data.set("resendRequestId", requestId);
    expect(await sendInvoiceFromGmail(null, data)).toMatchObject({ ok: true, sent: true });
    expect(mocks.raw).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("Outstanding balance: $10.00") }),
    );
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("resends the same sent invoice without issuing another invoice", async () => {
    mocks.detail.mockResolvedValue({
      invoice: { ...invoice, state: "SENT", approvedAt: new Date() },
      demo: false,
    });
    const requestId = "6ee9130f-05e8-4fe0-89dc-b675990ac918";
    mocks.beginResend.mockResolvedValue({
      status: "READY",
      attempt: { id: "attempt", requestId, createdAt: new Date() },
    });
    mocks.findResend.mockResolvedValue(null);
    const data = form();
    data.set("sendMode", "RESEND");
    data.set("resendRequestId", requestId);
    const result = await sendInvoiceFromGmail(null, data);
    expect(result.ok).toBe(true);
    expect(mocks.finishResend).toHaveBeenCalledWith("owner", {
      requestId,
      gmailMessageId: "confirmed-gmail-id",
    });
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.raw).toHaveBeenCalledWith(
      expect.objectContaining({ resendRequestId: requestId, invoiceNumber: invoice.number }),
    );
  });
  it("does not send another email when an earlier resend is uncertain", async () => {
    mocks.detail.mockResolvedValue({
      invoice: { ...invoice, state: "SENT", approvedAt: new Date() },
      demo: false,
    });
    const requestId = "6ee9130f-05e8-4fe0-89dc-b675990ac918";
    mocks.beginResend.mockResolvedValue({
      status: "RECONCILE",
      attempt: {
        id: "attempt",
        requestId,
        recipient: "billing@example.com",
        createdAt: new Date(),
      },
    });
    mocks.findResend.mockResolvedValue(null);
    const data = form();
    data.set("sendMode", "RESEND");
    data.set("resendRequestId", requestId);
    expect(await sendInvoiceFromGmail(null, data)).toMatchObject({ ok: false, uncertain: true });
    expect(mocks.proxy.mock.calls.some((call) => call[1].endsWith("/send"))).toBe(false);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.detail.mockResolvedValue({ invoice, demo: false });
    mocks.record.mockResolvedValue({ ...invoice, state: "SENT" });
    mocks.findSent.mockResolvedValue(null);
    mocks.paymentLink.mockResolvedValue({
      hostedUrl: "https://app.example.test/api/invoices/pay/test-token",
    });
    mocks.raw.mockReturnValue("encoded-message");
    mocks.proxy.mockImplementation(async (_service: string, path: string) =>
      Response.json(
        path.endsWith("/profile")
          ? { emailAddress: "qpemissions@gmail.com" }
          : path.includes("format=metadata")
            ? { payload: { headers: [{ name: "To", value: "billing@example.com" }] } }
            : { id: "confirmed-gmail-id" },
      ),
    );
  });

  it("records confirmed sends and refreshes both invoice and dealership views", async () => {
    const result = await sendInvoiceFromGmail(null, form());
    expect(result).toMatchObject({ ok: true, sent: true });
    expect(mocks.raw).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("https://app.example.test/api/invoices/pay/test-token"),
      }),
    );
    expect(mocks.record).toHaveBeenCalledWith("owner", {
      id: invoice.id,
      version: 0,
      date: "2026-11-17",
      reference: "GMAIL:confirmed-gmail-id",
    });
    for (const path of [
      "/invoices",
      `/invoices/${invoice.id}`,
      "/dealerships",
      "/dealerships/fixture-dealer",
    ])
      expect(mocks.revalidate).toHaveBeenCalledWith(path);
  });

  it("never sends Gmail if an exact-balance payment link cannot be prepared", async () => {
    mocks.paymentLink.mockRejectedValue(new Error("provider unavailable"));
    expect(await sendInvoiceFromGmail(null, form())).toMatchObject({ ok: false });
    expect(mocks.proxy.mock.calls.some((call) => call[1].endsWith("/messages/send"))).toBe(false);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("reconciles an existing sent email without sending another", async () => {
    mocks.findSent.mockResolvedValue("existing-message");
    expect(await sendInvoiceFromGmail(null, form())).toMatchObject({ ok: true, sent: true });
    expect(mocks.record).toHaveBeenCalledWith(
      "owner",
      expect.objectContaining({
        reference: "GMAIL:existing-message",
      }),
    );
    expect(mocks.proxy.mock.calls.some((call) => call[1].endsWith("/messages/send"))).toBe(false);
  });

  it("does not mark a rejected send as sent", async () => {
    mocks.proxy.mockImplementation(async (_service: string, path: string) =>
      path.endsWith("/profile")
        ? Response.json({ emailAddress: "qpemissions@gmail.com" })
        : new Response(null, { status: 400 }),
    );
    expect(await sendInvoiceFromGmail(null, form())).toMatchObject({ ok: false });
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("blocks retries when Gmail sent the email but status recording failed", async () => {
    mocks.record.mockRejectedValue(new Error("write unavailable"));
    expect(await sendInvoiceFromGmail(null, form())).toMatchObject({
      ok: false,
      sent: true,
      uncertain: true,
    });
  });
});
