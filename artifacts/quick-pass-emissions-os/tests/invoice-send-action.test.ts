import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  proxy: vi.fn(),
  detail: vi.fn(),
  record: vi.fn(),
  findSent: vi.fn(),
  revalidate: vi.fn(),
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
}));
vi.mock("@/modules/finance/invoice-document", () => ({
  invoiceIssuer: { email: "qpemissions@gmail.com" },
  invoiceSnapshotSchema: { parse: () => ({ name: "Fixture dealer" }) },
}));
vi.mock("@/modules/finance/invoice-pdf", () => ({
  createInvoicePdf: async () => new Uint8Array([1]),
}));
vi.mock("@/modules/finance/invoice-gmail", () => ({
  findSentGmailMessage: mocks.findSent,
  invoiceGmailMessageId: () => "<qp-2026-0002@quickpassemissions.com>",
  invoiceGmailRawMessage: () => "encoded-message",
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
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.detail.mockResolvedValue({ invoice, demo: false });
    mocks.record.mockResolvedValue({ ...invoice, state: "SENT" });
    mocks.findSent.mockResolvedValue(null);
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
