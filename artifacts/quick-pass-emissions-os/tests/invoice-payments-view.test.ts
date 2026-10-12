import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoices: vi.fn(),
  payments: vi.fn(),
}));
vi.mock("@/lib/access", () => ({ currentUser: async () => ({ id: "fixture-owner" }) }));
vi.mock("@/modules/finance/service", () => ({
  invoiceOverview: mocks.invoices,
  paymentOverview: mocks.payments,
}));
vi.mock("@/components/record-link", () => ({
  RecordLink: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/components/phase3", () => ({
  DemoNotice: () => null,
  Money: ({ cents }: { cents: number }) => createElement("span", { "data-cents": cents }, cents),
}));
vi.mock("@/components/shared", () => ({
  PageHeader: ({ title }: { title: string }) => createElement("h1", null, title),
}));
vi.mock("@/components/action-form", () => ({
  Field: ({ label, children }: { label: string; children: ReactNode }) =>
    createElement("label", null, label, children),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => createElement("button", null, children),
}));
import Invoices from "@/app/(app)/invoices/page";

describe("dealership billing views", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoices.mockResolvedValue({ invoices: [], demo: false });
    mocks.payments.mockResolvedValue({
      demo: false,
      payments: [
        {
          id: "payment",
          invoiceId: "invoice",
          invoice: { number: "INV-1", dealership: { name: "Fixture Motors" } },
          date: "2026-01-15",
          reference: "RECEIPT-1",
          amountCents: 10000,
          reversesId: null,
          reversal: { id: "reversal" },
        },
        {
          id: "reversal",
          invoiceId: "invoice",
          invoice: { number: "INV-1", dealership: { name: "Fixture Motors" } },
          date: "2026-01-16",
          reference: "REV-1",
          amountCents: 10000,
          reversesId: "payment",
          reversal: null,
        },
      ],
    });
  });

  it("opens searchable payment history and represents reversals separately", async () => {
    const page = await Invoices({ searchParams: Promise.resolve({ view: "payments", q: "Fixture" }) });
    const html = renderToStaticMarkup(page);
    expect(mocks.payments).toHaveBeenCalledWith("fixture-owner", "Fixture");
    expect(mocks.invoices).not.toHaveBeenCalled();
    expect(html).toContain("Dealership payments");
    expect(html).toContain('name="view" value="payments"');
    expect(html).toContain('href="/invoices/invoice"');
    expect(html).toContain("Reversed");
    expect(html).toContain("Reversal");
    expect(html).toContain('data-cents="-10000"');
    expect(html).toContain("Search payments");
  });

  it("keeps the existing invoice view as the default", async () => {
    const html = renderToStaticMarkup(await Invoices({ searchParams: Promise.resolve({ q: "dealer" }) }));
    expect(mocks.invoices).toHaveBeenCalledWith("fixture-owner", "dealer");
    expect(mocks.payments).not.toHaveBeenCalled();
    expect(html).toContain("Dealership invoices");
    expect(html).not.toContain('name="view"');
  });
});
