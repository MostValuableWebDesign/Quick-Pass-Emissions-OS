import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { sourceRefreshLabel } from "../src/lib/source-refresh";
import { DashboardRefresh } from "../src/components/dashboard-refresh";
import { SourceRefreshIndicator } from "../src/components/source-refresh-indicator";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/certificate-portal-actions", () => ({
  refreshCertificateBalanceAction: vi.fn(),
}));
vi.mock("@/modules/station/dashboard-actions", () => ({
  getPerformanceDashboardAction: vi.fn(),
}));

describe("dashboard source refresh labels", () => {
  it.each(["checking", "cached", "source", "partial", "failed", "blocked"] as const)(
    "renders the shared tab indicator for %s",
    (status) => {
      const html = renderToStaticMarkup(
        createElement(SourceRefreshIndicator, {
          status,
          source: "Georgia Dashboard",
          label: "Order history",
        }),
      );
      expect(html).toContain(`data-source-status="${status}"`);
      expect(html).toContain(sourceRefreshLabel(status, "Georgia Dashboard"));
      expect(html).toContain("Order history:");
    },
  );
  it("distinguishes saved, live, partial, failed and deferred source results", () => {
    expect(sourceRefreshLabel("cached", "Georgia I/M")).toContain("cached data");
    expect(sourceRefreshLabel("source", "Georgia I/M")).toContain("Pulled from Georgia I/M");
    expect(sourceRefreshLabel("partial", "Georgia I/M")).toContain("Partial update");
    expect(sourceRefreshLabel("failed", "Georgia I/M")).toContain("pull failed");
    expect(sourceRefreshLabel("blocked", "Georgia I/M")).toContain("deferred");
  });

  it("renders separate cached indicators for Performance and certificate panels on initial load", () => {
    const html = renderToStaticMarkup(
      createElement(DashboardRefresh, {
        today: "2026-10-12",
        canRefreshPerformance: true,
        canRefreshCertificates: true,
      }),
    );
    expect(html).toContain("Performance panels:");
    expect(html).toContain("Certificates remaining:");
    expect(html.match(/data-source-status="cached"/g)).toHaveLength(2);
    expect(html).toContain('role="status"');
  });
});
