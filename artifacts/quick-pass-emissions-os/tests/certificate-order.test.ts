import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";
import Overview from "../src/app/(app)/overview/page";
import { assertCompleteReport } from "../scripts/e2e-safety.mjs";
import {
  CertificateOrderLink,
  CERTIFICATE_ORDER_URL,
} from "../src/components/certificate-order-link";

vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a">) => createElement("a", props),
}));
vi.mock("@/lib/require-role", () => ({
  requireRole: async () => ({ id: "fixture-owner", role: "OWNER" }),
}));
const overview = vi.hoisted(() => ({
  inventory: [] as Array<Record<string, string | boolean | number | null>>,
}));
vi.mock("@/modules/automation/service", () => ({
  ownerOverview: async () => ({
    generatedAt: "2026-10-10T12:00:00Z",
    today: "2026-10-10",
    items: [],
    inventory: overview.inventory,
    limits: "Disposable rendered overview",
  }),
}));

describe("manual certificate portal navigation", () => {
  it("keeps the dedicated four-role browser suite and its completion gate aligned", () => {
    const runner = readFileSync("scripts/browser-regression.ts", "utf8");
    expect(runner).toMatch(/E2E_CERTIFICATES_ONLY === "1"\s*\? 4/);
    const config = readFileSync("playwright.config.ts", "utf8");
    expect(config).toMatch(/E2E_CERTIFICATES_ONLY === "1"\s*\? \["certificate-order\.spec\.ts"\]/);
    const report = { stats: { expected: 4, unexpected: 0, skipped: 0, flaky: 0 }, errors: [] };
    expect(() => assertCompleteReport(report, 4)).not.toThrow();
    expect(() => assertCompleteReport(report, 9)).toThrow();
    expect(() =>
      assertCompleteReport({ ...report, stats: { ...report.stats, skipped: 1 } }, 4),
    ).toThrow();
  });
  for (const [key, state, balance, low, visible] of [
    ["certificates", "ZERO_USAGE", 50, true, true],
    ["certificates", "INSUFFICIENT_HISTORY", 50, true, true],
    ["certificates", "ESTIMATE", 500, false, false],
    ["certificates", "UNKNOWN_STOCK", null, true, false],
    ["certificates", "UNCONFIGURED", 50, true, false],
    ["chemical-fixture", "ESTIMATE", 50, true, false],
  ] as const) {
    it(`offers live ordering only for genuine certificate low stock: ${key}/${state}`, async () => {
      overview.inventory = [
        {
          key,
          name: key,
          state,
          balance,
          low,
          configured: false,
          unit: "ITEM",
          threshold: 100,
          observationStart: "2026-10-04",
          observationEnd: "2026-10-10",
          coverageDays: 7,
          recordedConsumption: 0,
        },
      ];
      const html = renderToStaticMarkup(await Overview());
      expect(html.includes('href="/certificates#portal"')).toBe(visible);
    });
  }
  for (const role of ["OWNER", "ADMIN", "BOOKKEEPER", "EMPLOYEE"] as Role[]) {
    it(`retains inventory and management-alert boundaries for ${role}`, () => {
      const render = (alert: boolean) =>
        renderToStaticMarkup(createElement(CertificateOrderLink, { role, alert }));
      expect(render(false).includes("Order Certificates")).toBe(role !== "EMPLOYEE");
      expect(render(true).includes("Order Certificates")).toBe(
        role === "OWNER" || role === "ADMIN",
      );
    });
  }
  it("opens the internal manual portal with browser fallback guidance", () => {
    const html = renderToStaticMarkup(
      createElement(CertificateOrderLink, { role: "OWNER", alert: true }),
    );
    expect(CERTIFICATE_ORDER_URL).toBe("https://gadashboard.com/Purchasing/Purchasing.aspx");
    expect(html).toContain(
      'href="/certificates#portal"',
    );
    expect(html).toContain("You control sign-in and ordering");
    expect(html).toContain('href="/certificates#purchase-history"');
    expect(html).not.toMatch(/<form|<iframe|<script|onclick=|formaction=/i);
  });
  it("keeps existing workflows and adds no mutation, credentials or popup script", () => {
    const component = readFileSync("src/components/certificate-order-link.tsx", "utf8");
    expect(component).not.toMatch(/onClick|window\.open|fetch\(|use server|process\.env|password/i);
    const inventory = readFileSync("src/app/(app)/certificates/page.tsx", "utf8");
    for (const action of [
      "createPurchaseRequest",
      "reviewPurchaseRequest",
      "recordCertificateOrder",
      "receiveCertificatePurchase",
    ])
      expect(inventory).toContain(`action={${action}}`);
    expect(inventory).toContain('id="purchase-history"');
    expect(inventory).toContain('id="purchase-request"');
    expect(inventory).toContain('id="records"');
    expect(inventory).toContain("You do not need a request or approval here before buying");
    expect(inventory).toContain("CertificatePortalBrowser");
    const dashboard = readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");
    expect(dashboard).toContain(
      "certificates.stock && certificates.settings && certificates.estimate?.low",
    );
    const overview = readFileSync("src/app/(app)/overview/page.tsx", "utf8");
    expect(overview).toContain('i.key === "certificates"');
    expect(overview).toContain('i.state !== "UNKNOWN_STOCK"');
    expect(overview).toContain('i.state !== "UNCONFIGURED"');
  });
});
