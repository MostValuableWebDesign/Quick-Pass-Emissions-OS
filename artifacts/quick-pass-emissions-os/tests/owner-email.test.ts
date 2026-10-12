import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ownerEmailConfig,
  ownerEmailSetupStatus,
  sendOwnerEmail,
} from "../src/lib/email/owner-summary";
import {
  estimatedOwnerEmailScheduleCost,
  ownerEmailCadenceExamples,
} from "../src/modules/automation/owner-email-costs";
import {
  escapeEmail,
  renderOwnerEmail,
  type DailySnapshot,
} from "../src/modules/automation/owner-email-render";
import { dueInstant } from "../src/lib/time";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const snapshot: DailySnapshot = {
  today: "2026-10-12",
  role: "OWNER",
  demo: false,
  tests: { performed: null, eligible: 0, awaitingReview: 2, approvedEmployeeCounts: 0 },
  revenue: {
    received: 1000,
    billed: 2000,
    retailEstimate: null,
    unpricedRetail: 2,
    otherEstimates: 300,
    verifiedManual: 400,
    unverifiedManual: 500,
  },
  pay: {
    baseCents: null,
    commissionCents: null,
    knownBaseCents: 0,
    knownCommissionCents: 0,
    grossCents: null,
    missing: [
      {
        id: "a",
        name: "<img src=x>",
        baseCents: null,
        commissionCents: null,
        missing: ["approved daily inputs"],
      },
    ],
    employees: 1,
  },
  attention: [
    {
      id: "a",
      severity: "urgent",
      title: "Dealer <script>",
      detail: "$10 overdue",
      href: "/invoices/a",
      date: "2026-10-10",
    },
  ],
  certificationDays: 30,
  unknownInventory: 1,
};
describe("Daily owner email transport and content", () => {
  it("keeps 6:30 PM local across winter and summer", () => {
    expect(dueInstant("2026-01-12", "18:30").toISOString()).toBe("2026-01-12T23:30:00.000Z");
    expect(dueInstant("2026-07-12", "18:30").toISOString()).toBe("2026-07-12T22:30:00.000Z");
  });
  it("preserves missing inputs, separates revenue categories and escapes stored content", () => {
    const r = renderOwnerEmail(
      snapshot,
      new Date("2026-10-12T22:30:00Z"),
      "https://app.example.test/report",
    );
    expect(r.text).toContain("Tests performed: Unavailable");
    expect(r.text).toContain("Gross pay: Unavailable");
    expect(r.text).toContain("Commission-eligible tests: Unavailable");
    expect(r.text).toContain("Dealer invoices billed: $20.00");
    expect(r.text).toContain("receipts recorded: $10.00");
    expect(r.text).toContain("do not add them together");
    expect(r.html).not.toContain("<script>");
    expect(r.html).not.toContain("<img src=x>");
    expect(r.html).toContain("&lt;img src=x&gt;");
    expect(escapeEmail("a&\"'<>")).toBe("a&amp;&quot;&#39;&lt;&gt;");
  });
  it("rejects incomplete sender configuration and unsafe app origins", () => {
    vi.stubEnv("RESEND_API_KEY", "fixture-key");
    vi.stubEnv("OWNER_SUMMARY_FROM_EMAIL", "reports@example.test");
    for (const url of [
      "",
      "http://example.test",
      "https://user:pass@example.test",
      "https://example.test/?token=x",
      "https://example.test/path",
    ]) {
      vi.stubEnv("OWNER_SUMMARY_APP_URL", url);
      expect(ownerEmailConfig()).toBeNull();
    }
    vi.stubEnv("OWNER_SUMMARY_APP_URL", "https://app.example.test");
    expect(ownerEmailConfig()?.appUrl).toBe("https://app.example.test");
  });
  it("shows safe setup status without exposing secrets or sender addresses", () => {
    vi.stubEnv("RESEND_API_KEY", "private-fixture-key");
    vi.stubEnv("OWNER_SUMMARY_FROM_EMAIL", "private-fixture@example.test");
    vi.stubEnv("OWNER_SUMMARY_APP_URL", "");
    const status = ownerEmailSetupStatus();
    expect(status).toEqual({
      providerKeySet: true,
      senderAddressFormatValid: true,
      publicHttpsUrlSet: false,
    });
    expect(JSON.stringify(status)).not.toContain("private-fixture");
  });
  it("calculates Replit's illustrative monthly schedule totals", () => {
    expect(ownerEmailCadenceExamples.map(({ runsPer30Days }) => runsPer30Days)).toEqual([
      8640, 2880, 720, 30,
    ]);
    expect(
      ownerEmailCadenceExamples.map(({ runsPer30Days }) =>
        estimatedOwnerEmailScheduleCost(runsPer30Days),
      ),
    ).toEqual([1383.4, 461.8, 116.2, 5.8]);
  });
  it("sends frozen content with a stable provider key and treats acceptance separately", async () => {
    const fetch = vi.fn().mockImplementation(async () => Response.json({ id: "provider-id" }));
    vi.stubGlobal("fetch", fetch);
    const delivery = {
      id: "delivery-1",
      fromEmail: "reports@example.test",
      toEmail: "owner@example.test",
      subject: "Summary",
      html: "<p>Frozen</p>",
      text: "Frozen",
    };
    expect(await sendOwnerEmail("fixture-key", delivery)).toBe("provider-id");
    await sendOwnerEmail("fixture-key", delivery);
    const requests = fetch.mock.calls.map((c) => c[1]);
    expect(requests[0].headers["Idempotency-Key"]).toBe("owner-summary/delivery-1");
    expect(requests[0].body).toBe(requests[1].body);
    expect(JSON.parse(requests[0].body).to).toEqual(["owner@example.test"]);
  });
  it("classifies timeout/rate limit/transient failures without exposing provider response data", async () => {
    const delivery = {
      id: "a",
      fromEmail: "reports@example.test",
      toEmail: "owner@example.test",
      subject: "a",
      html: "a",
      text: "a",
    };
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const status of [429, 500]) {
      fetch.mockResolvedValueOnce(new Response("private provider details", { status }));
      await expect(sendOwnerEmail("fixture-key", delivery)).rejects.toMatchObject({
        retryable: true,
      });
    }
    fetch.mockRejectedValueOnce(new Error("private details"));
    await expect(sendOwnerEmail("fixture-key", delivery)).rejects.toMatchObject({
      retryable: true,
    });
    fetch.mockResolvedValueOnce(new Response("private details", { status: 422 }));
    await expect(sendOwnerEmail("fixture-key", delivery)).rejects.toMatchObject({
      retryable: false,
    });
  });
});
