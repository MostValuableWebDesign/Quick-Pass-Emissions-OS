import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), detail: vi.fn(), pdf: vi.fn() }));
vi.mock("@/lib/access", () => ({ currentUser: mocks.actor }));
vi.mock("@/modules/finance/service", () => ({ invoiceDetail: mocks.detail }));
vi.mock("@/modules/finance/invoice-pdf", () => ({ createInvoicePdf: mocks.pdf }));
vi.mock("@/modules/phase4", () => ({
  BusinessError: class extends Error {},
  requireRule: (allowed: unknown, message: string) => { if (!allowed) throw new Error(message); },
}));
import { BusinessError } from "@/modules/phase4";
import { GET } from "@/app/api/invoices/[id]/pdf/route";

const request = () => GET(new Request("http://localhost/api/invoices/fixture/pdf"), {
  params: Promise.resolve({ id: "fixture" }),
});
const fixture = () => ({
  id: "fixture", number: "INV-104", state: "APPROVED", approvedAt: new Date("2026-10-01T12:00:00Z"),
  issueDate: "2026-10-01", dueDate: "2026-10-20", voidDate: null, notes: "",
  subtotalCents: 10000, taxBps: 0, taxCents: 0, totalCents: 10000,
  snapshot: { name: "Fixture Motors", billingAddress: "Fixture address", termsDays: 19, termsReference: "Fixture terms", contacts: [] },
  lines: [{ date: "2026-10-01", description: "Testing", quantity: 5, unitCents: 2000, amountCents: 10000 }],
  payments: [
    { amountCents: 2000, date: "2026-10-02" },
    { amountCents: -2000, date: "2026-10-03" },
    { amountCents: 1000, date: "2026-10-04" },
  ],
});

describe("private invoice PDF download", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T14:00:00Z"));
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ id: "owner" });
    mocks.detail.mockResolvedValue({ invoice: fixture(), demo: false });
    mocks.pdf.mockResolvedValue(new TextEncoder().encode("%PDF-1.7 fixture"));
  });
  afterEach(() => vi.useRealTimers());

  it("uses the authorized invoice read and existing net-payment rules without changing delivery state", async () => {
    const response = await request();
    expect(mocks.detail).toHaveBeenCalledWith("owner", "fixture");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toContain("Quick-Pass-INV-104.pdf");
    expect(mocks.pdf).toHaveBeenCalledWith(expect.objectContaining({
      state: "APPROVED", paidCents: 1000, remainingCents: 9000,
      snapshot: expect.objectContaining({ name: "Fixture Motors", phone: "" }),
    }));
  });

  it("keeps unauthenticated redirects outside the PDF error handler", async () => {
    const loginRedirect = new Error("NEXT_REDIRECT");
    mocks.actor.mockRejectedValue(loginRedirect);
    await expect(request()).rejects.toBe(loginRedirect);
    expect(mocks.detail).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
  });

  it("does not generate or disclose an invoice when authorization fails", async () => {
    mocks.detail.mockRejectedValue(new BusinessError("Not authorized."));
    const response = await request();
    expect(response.status).toBe(403);
    expect(mocks.pdf).not.toHaveBeenCalled();
  });

  it("returns a private not-found response for missing invoices", async () => {
    mocks.detail.mockResolvedValue({ invoice: null, demo: false });
    const response = await request();
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("reports PDF failures without exposing billing details or changing the invoice", async () => {
    mocks.pdf.mockRejectedValue(new Error("Private billing details"));
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Unable to generate this invoice PDF. Your invoice has not been changed.");
  });
});
