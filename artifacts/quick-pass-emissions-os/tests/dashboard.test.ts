import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "../src/app/(app)/dashboard/page";
import type { businessDashboard } from "../src/modules/dashboard/service";
const mocks = vi.hoisted(() => ({ dashboard: vi.fn() }));
vi.mock("@/modules/dashboard/service", () => ({ businessDashboard: mocks.dashboard }));
vi.mock("@/lib/access", () => ({ currentUser: async () => ({ id: "fixture" }) }));
vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a">) => createElement("a", props),
}));
vi.mock("@/components/record-link", () => ({
  RecordLink: (props: React.ComponentProps<"a">) => createElement("a", props),
}));
type Data = Awaited<ReturnType<typeof businessDashboard>>;
function fixture(): Data {
  return {
    today: "2026-10-10",
    role: "OWNER",
    demo: false,
    tests: { performed: null, eligible: 0, awaitingReview: 0, approvedEmployeeCounts: 0 },
    revenue: {
      received: 123,
      billed: 456,
      retailEstimate: null,
      unpricedRetail: 0,
      otherEstimates: 789,
      verifiedManual: 100,
      unverifiedManual: 0,
    },
    pay: {
      baseCents: null,
      commissionCents: null,
      knownBaseCents: 0,
      knownCommissionCents: 500,
      grossCents: null,
      employees: 1,
      missing: [
        {
          id: "employee",
          name: "Fixture staff",
          baseCents: null,
          commissionCents: null,
          missing: ["approved daily base-pay inputs", "approved test count"],
        },
      ],
    },
    attention: [],
    certificationDays: 30,
    unknownInventory: 1,
  };
}
async function render(data = fixture(), attentionPage = "1") {
  mocks.dashboard.mockResolvedValue(data);
  return renderToStaticMarkup(
    await Dashboard({ searchParams: Promise.resolve({ attentionPage }) }),
  );
}
beforeEach(() => mocks.dashboard.mockReset());
describe("Business dashboard presentation", () => {
  it("shows the snapshot, prominent unresolved attention and quick actions in that order with explicit financial labels", async () => {
    const html = await render();
    expect(html.indexOf("Today’s business snapshot")).toBeLessThan(html.indexOf("Needs attention"));
    expect(html.indexOf("Needs attention")).toBeLessThan(html.indexOf("Quick actions"));
    for (const text of [
      "Tests performed today",
      "Unavailable",
      "missing inputs",
      "Incomplete",
      "Base pay",
      "Commissions",
      "Received",
      "Billed",
      "Estimated",
      "$1.23",
      "$4.56",
      "$7.89",
      "do not add them together",
      "approved daily base-pay inputs",
      "No unresolved attention items",
      "missing stock or planning setup",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("Today’s responsibilities");
    expect(html).not.toContain("Recent activity");
  });
  it("offers ordinary management shortcuts and preserves the owner-only Performance boundary", async () => {
    const data = fixture();
    const owner = await render(data);
    for (const path of ["/vendors", "/payroll", "/performance"])
      expect(owner).toContain(`href="${path}"`);
    expect(owner).toContain('href="/certificates#portal"');
    data.role = "ADMIN";
    const manager = await render(data);
    expect(manager).not.toContain('href="/performance"');
    expect(manager).toContain("Open Performance · owner access");
    expect(manager).toContain("Call Service &amp; Support");
  });
  it("explains missing reports and approved pay rather than inventing zero tests or gross pay", async () => {
    const data = fixture();
    data.revenue.received = 0;
    const html = await render(data);
    expect(html).toContain("No reviewed station import for today");
    expect(html).toContain("No station import");
    expect(html).toContain("No payment receipts recorded today");
    expect(html).toContain("$0.00");
    expect(html).toContain("Performance pay estimates are separate");
    expect(html).toContain('href="/payroll">Review payroll inputs');
    expect(html).toContain("Incomplete");
  });
  it("paginates unresolved attention at 15 items and keeps the final item accessible", async () => {
    const data = fixture();
    data.attention = Array.from({ length: 16 }, (_, n) => ({
      id: String(n),
      title: `Unresolved item ${n + 1}`,
      detail: "Fixture",
      href: "/certificates",
      severity: "urgent",
      date: "2026-10-10",
    }));
    const first = await render(data);
    expect((first.match(/<ol[^>]*>(.*?)<\/ol>/)?.[1].match(/<li>/g) ?? []).length).toBe(15);
    expect(first).toContain("16 unresolved items");
    expect(first).toContain("attentionPage=2#attention-heading");
    expect(first).not.toContain("Unresolved item 16");
    const last = await render(data, "2");
    expect(last).toContain("Unresolved item 16");
    expect((last.match(/<ol[^>]*>(.*?)<\/ol>/)?.[1].match(/<li>/g) ?? []).length).toBe(1);
    expect(await render(data, "999")).toBe(last);
    expect(await render(data, "invalid")).toBe(first);
  });
});
