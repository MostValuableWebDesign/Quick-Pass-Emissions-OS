import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "../src/app/(app)/dashboard/page";
import type { businessDashboard } from "../src/modules/dashboard/service";
const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  performance: vi.fn(),
  certificates: vi.fn(),
}));
vi.mock("@/modules/dashboard/service", () => ({ businessDashboard: mocks.dashboard }));
vi.mock("@/modules/station/dashboard-service", () => ({ readDashboard: mocks.performance }));
vi.mock("@/modules/certificates/portal", () => ({
  readCertificatePortalStatus: mocks.certificates,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));
vi.mock("@/lib/access", () => ({
  currentUser: async () => ({ id: "fixture", role: "OWNER" }),
}));
vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a">) => createElement("a", props),
}));
vi.mock("@/components/record-link", () => ({
  RecordLink: (props: React.ComponentProps<"a">) => createElement("a", props),
}));
vi.mock("@/components/dashboard-refresh", () => ({
  DashboardRefresh: () =>
    createElement(
      "button",
      { type: "button", "data-testid": "button-dashboard-refresh" },
      "Refresh panels",
    ),
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
function performanceFixture() {
  return {
    summary: {
      cars: 21,
      freeRetests: 2,
      revenueCents: 42_000,
      payCents: 39_000,
      baseCents: 33_000,
      commissionCents: 6_000,
    },
    staleDates: [],
  };
}
function certificateFixture(balance: number | null = 28) {
  return {
    station: "GA102539",
    analyzer: "HT111411",
    balance,
    checkedAt: balance === null ? null : "2026-10-10T12:55:00.000Z",
    threshold: 30,
  };
}
async function render(data = fixture(), attentionPage = "1") {
  mocks.dashboard.mockResolvedValue(data);
  return renderToStaticMarkup(
    await Dashboard({ searchParams: Promise.resolve({ attentionPage }) }),
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T13:00:00.000Z"));
  mocks.dashboard.mockReset();
  mocks.performance.mockReset().mockResolvedValue(performanceFixture());
  mocks.certificates.mockReset().mockResolvedValue(certificateFixture());
});
afterEach(() => vi.useRealTimers());
describe("Business dashboard presentation", () => {
  it("places the live date and time in the right-side dashboard heading tools", async () => {
    const html = await render();
    expect(html).toMatch(/class="dashboard-heading-tools">.*class="dashboard-live-clock"/s);
    expect(html).not.toMatch(/<p class="muted"><span class="dashboard-live-clock"/);
  });

  it("places the refresh control on the business snapshot heading row", async () => {
    const html = await render();
    expect(html).toMatch(
      /class="dashboard-section-heading">.*Today’s business snapshot.*button-dashboard-refresh/s,
    );
  });

  it("shows the snapshot, prominent unresolved attention and quick actions in that order with explicit financial labels", async () => {
    const html = await render();
    expect(html.indexOf("Today’s business snapshot")).toBeLessThan(html.indexOf("Needs attention"));
    expect(html.indexOf("Needs attention")).toBeLessThan(html.indexOf("Quick actions"));
    for (const text of [
      "Tests performed today",
      "21",
      "Paid cars",
      "Revenue today",
      "$420.00",
      "Employee gross pay so far",
      "$390.00",
      "Estimated base pay",
      "$330.00",
      "Estimated commission",
      "$60.00",
      "Certificates remaining",
      "28",
      "Low · reorder threshold 30",
      "HT111411",
      "missing inputs",
      "No unresolved attention items",
      "missing stock or planning setup",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("Today’s responsibilities");
    expect(html).not.toContain("Recent activity");
    expect(html).not.toContain("same daily count as the Performance report.");
    expect(html).not.toContain(
      "Same counted tests and free-retest rules as the Performance report.",
    );
    expect(html).not.toContain(
      "Performance pay-plan estimate; approved payroll is tracked separately",
    );
    expect(html).not.toContain("Portal balance");
    expect(html).toContain('data-testid="button-dashboard-refresh"');
  });
  it("shows timestamps on dashboard panels but not quick actions", async () => {
    const html = await render();
    expect((html.match(/class="dashboard-panel-updated"/g) ?? []).length).toBe(4);
    expect(html).toContain('dateTime="2026-10-10T13:00:00.000Z"');
    expect(html).toContain("Last updated");
    expect(html).toContain("EDT");
    const quickActions = html.slice(html.indexOf("Quick actions"));
    expect(quickActions).not.toContain("dashboard-panel-updated");
    expect(quickActions).not.toContain("Last updated");
    const needsAttention = html.slice(
      html.indexOf('class="card business-attention"'),
      html.indexOf('id="quick-actions-heading"'),
    );
    expect(needsAttention).not.toContain("dashboard-panel-updated");
    expect(needsAttention).not.toContain("Last updated");
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
    mocks.performance.mockResolvedValue(null);
    mocks.certificates.mockResolvedValue(certificateFixture(null));
    const html = await render(data);
    expect(html).toContain("Performance data is unavailable.");
    expect(html).toContain("Certificates remaining");
    expect(html).not.toContain("Checked ");
    expect(html).not.toContain("No verified portal count yet.");
    expect(html).not.toContain("$0.00");
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
