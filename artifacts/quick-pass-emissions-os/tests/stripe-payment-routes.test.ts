import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  available: vi.fn(),
  start: vi.fn(),
  event: vi.fn(),
}));
vi.mock("@/modules/finance/stripe-payments", () => ({
  paymentLinkAvailable: mocks.available,
  startInvoicePayment: mocks.start,
  receiveStripePaymentEvent: mocks.event,
}));
import { GET, POST } from "@/app/api/invoices/pay/[token]/route";
import { POST as webhook } from "@/app/api/invoices/stripe-webhook/route";
const context = { params: Promise.resolve({ token: "fixture-token" }) };
describe("public invoice payment routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.available.mockResolvedValue(true);
    mocks.start.mockResolvedValue("https://invoice.stripe.com/i/fixture");
    mocks.event.mockResolvedValue("ignored");
  });
  it("email scanners see a page without creating a Stripe payment", async () => {
    const response = await GET(new Request("https://app.test/api/invoices/pay/fixture"), context);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Continue to secure payment");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "form-action 'self' https://invoice.stripe.com",
    );
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("opens Stripe only after the customer continues", async () => {
    const response = await POST(new Request("https://app.test", { method: "POST" }), context);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("https://invoice.stripe.com/i/fixture");
  });
  it("shows an unavailable page for paid, draft or archived links", async () => {
    mocks.available.mockResolvedValue(false);
    const response = await GET(new Request("https://app.test"), context);
    expect(response.status).toBe(410);
    expect(await response.text()).not.toContain("<form");
  });
  it("shows safe retry text without leaking provider errors", async () => {
    mocks.start.mockRejectedValue(new Error("private provider diagnostics"));
    const response = await POST(new Request("https://app.test", { method: "POST" }), context);
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(text).toContain("No payment was recorded");
    expect(text).not.toContain("private");
  });
  it("rejects missing webhook identity before asking Stripe", async () => {
    const response = await webhook(
      new Request("https://app.test", {
        method: "POST",
        body: JSON.stringify({ id: "evt_forged" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.event).not.toHaveBeenCalled();
  });
  it("passes only identifiers for server-side provider verification", async () => {
    const response = await webhook(
      new Request("https://app.test", {
        method: "POST",
        body: JSON.stringify({
          id: "evt_fixture",
          data: { object: { id: "in_fixture", status: "paid", amount_paid: 999999 } },
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.event).toHaveBeenCalledWith("evt_fixture", "in_fixture");
  });
});
