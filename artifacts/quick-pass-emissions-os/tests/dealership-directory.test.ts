import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ overview: vi.fn() }));
vi.mock("@/lib/access", () => ({ currentUser: async () => ({ id: "owner", role: "OWNER" }) }));
vi.mock("@/modules/finance/service", () => ({ dealerOverview: mocks.overview }));
vi.mock("@/modules/finance/dealer-vir-service", () => ({
  dealerVirOptions: async () => [{ id: "fixture", name: "Fixture Motors" }],
}));
vi.mock("@/components/dealer-vir-upload", () => ({
  DealerVirUpload: () => createElement("button", null, "Upload VIR PDFs"),
}));
vi.mock("@/app/phase4-actions", () => ({ saveDealer: vi.fn() }));
vi.mock("@/components/directory-add-dialog", () => ({
  DirectoryAddDialog: ({ title, children }: { title: string; children: ReactNode }) =>
    createElement(
      "div",
      { "data-dialog": title },
      createElement("button", { className: "button button-primary directory-add-trigger" }, title),
      createElement("dialog", { className: "directory-add-dialog" }, children),
    ),
}));
vi.mock("@/components/record-link", () => ({
  RecordLink: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/components/action-form", () => ({
  ActionForm: ({ children }: { children: ReactNode }) => createElement("form", null, children),
  Field: ({ label, children }: { label: string; children: ReactNode }) =>
    createElement("label", null, label, children),
}));
import Dealers from "@/app/(app)/dealerships/page";

describe("dealership partner directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.overview.mockResolvedValue({
      demo: false,
      dealers: [
        {
          id: "fixture",
          name: "Fixture Motors",
          code: "INTERNAL-CODE",
          active: true,
          phone: "555-0100",
          termsDays: 14,
          contacts: [{ id: "billing", name: "Billing contact", email: "billing@example.test" }],
          outstandingCents: 22500,
          latestInvoice: { number: "QP-2026-0001", status: "Sent" },
        },
      ],
    });
  });

  it("shows searchable partner cards with billing status and shortcuts", async () => {
    const html = renderToStaticMarkup(await Dealers({ searchParams: Promise.resolve({}) }));
    expect(mocks.overview).toHaveBeenCalledWith("owner", "", "active");
    expect(html).toContain('class="button button-primary directory-add-trigger"');
    expect(html).toContain('name="phone"');
    expect(html).toContain('type="tel"');
    expect(html).toContain("Billing address");
    for (const removed of [
      "Unique dealership code",
      "Billing address / instructions",
      "Record status",
      "Change reason",
      "INTERNAL-CODE",
    ])
      expect(html).not.toContain(removed);
    expect(html).toContain("<h1>Dealerships</h1>");
    expect(html).toContain("Active partners");
    expect(html).toContain("Balance due");
    expect(html).toContain("QP-2026-0001");
    expect(html).toContain("Upload VIR PDFs");
    expect(html).toContain('href="tel:555-0100"');
    expect(html).toContain('href="mailto:billing@example.test"');
    expect(html).toContain('href="/dealerships/fixture?section=services#create-invoice"');
  });

  it("keeps archived partners available through the directory filter", async () => {
    await Dealers({ searchParams: Promise.resolve({ partners: "archived", q: "Fixture" }) });
    expect(mocks.overview).toHaveBeenCalledWith("owner", "Fixture", "archived");
  });
});
