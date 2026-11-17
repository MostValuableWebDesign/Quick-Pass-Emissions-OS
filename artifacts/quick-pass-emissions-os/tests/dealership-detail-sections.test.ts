import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ detail: vi.fn() }));
vi.mock("@/lib/access", () => ({
  currentUser: async () => ({ id: "owner", role: "OWNER" }),
}));
vi.mock("@/lib/time", () => ({ businessDate: () => "2026-11-17" }));
vi.mock("@/modules/finance/service", () => ({ dealerDetail: mocks.detail }));
vi.mock("@/modules/finance/rules", () => ({
  receivable: () => ({ status: "Sent", remainingCents: 15000 }),
}));
vi.mock("@/components/record-link", () => ({
  RecordLink: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => createElement("a", { href, ...props }, children),
}));
vi.mock("@/components/shared", () => ({
  PageHeader: ({ title, children }: { title: string; children?: ReactNode }) =>
    createElement("header", null, createElement("h1", null, title), children),
  DemoNotice: () => null,
  Empty: ({ title, text }: { title: string; text: string }) =>
    createElement("div", null, title, text),
}));
vi.mock("@/components/action-form", () => ({
  ActionForm: ({ children, submit }: { children: ReactNode; submit: string }) =>
    createElement("form", null, children, createElement("button", null, submit)),
  Field: ({ label, children }: { label: string; children: ReactNode }) =>
    createElement("label", null, label, children),
}));
vi.mock("@/components/phase3", () => ({
  DemoNotice: () => null,
  RecordId: () => null,
  TextField: ({ label, name }: { label?: string; name: string }) =>
    createElement("label", null, label ?? name),
  Reason: ({ label }: { label: string }) => createElement("label", null, label),
  Money: ({ cents }: { cents: number }) =>
    createElement("span", null, `$${(cents / 100).toFixed(2)}`),
}));
vi.mock("@/components/finance", () => ({
  DateField: ({ label }: { label: string }) => createElement("label", null, label),
  AmountField: ({ label }: { label: string }) => createElement("label", null, label),
}));
vi.mock("@/components/dealership-fields", () => ({
  DealershipFields: () => createElement("div", null, "Account fields"),
}));
vi.mock("@/components/contact-phone-field", () => ({
  ContactPhoneField: ({ label }: { label: string }) => createElement("label", null, label),
}));
vi.mock("@/components/directory-add-dialog", () => ({
  DirectoryAddDialog: ({ title, children }: { title: string; children: ReactNode }) =>
    createElement("div", { "data-dialog": title }, createElement("button", null, title), children),
}));
vi.mock("@/components/dealer-vir-upload", () => ({
  DealerVirUpload: () => createElement("button", null, "Upload VIR PDFs"),
}));
vi.mock("@/app/phase4-actions", () => ({
  saveDealer: vi.fn(),
  saveContact: vi.fn(),
  authorizeTerms: vi.fn(),
  voidService: vi.fn(),
  createInvoice: vi.fn(),
}));

import Dealer from "@/app/(app)/dealerships/[id]/page";

const dealer = {
  id: "fixture-dealer",
  name: "Fixture Motors",
  active: true,
  version: 1,
  billingAddress: "100 Main Street",
  phone: "555-0100",
  email: "billing@example.test",
  notes: "",
  termsDays: 30,
  taxBps: 0,
  defaultRateCents: 1500,
  termsReference: "Service contract",
  outstandingCents: 15000,
  contacts: [
    {
      id: "fixture-contact",
      name: "Pat Billing",
      purpose: "Accounts payable",
      active: true,
      email: "pat@example.test",
      phone: "555-0101",
      source: "Verified",
      version: 1,
    },
  ],
  services: [
    {
      id: "fixture-service",
      date: "2026-11-01",
      description: "Emissions inspections",
      evidence: "VIR import",
      quantity: 1,
      unitCents: 1500,
      voidDate: null,
      invoice: null,
    },
  ],
  invoices: [
    {
      id: "fixture-invoice",
      number: "QP-2026-0001",
      state: "SENT",
      approvedAt: new Date("2026-11-01"),
      issueDate: "2026-11-01",
      dueDate: "2026-12-01",
      voidDate: null,
      totalCents: 15000,
      archivedAt: null,
      payments: [],
    },
  ],
  virRecords: [
    {
      id: "fixture-vir",
      date: "2026-11-01",
      certificate: "CERT-1",
      testNumber: "TEST-1",
      outcome: "PASS",
      billing: "BILL",
      serviceId: "fixture-service",
    },
  ],
};

async function page(section = "overview") {
  return Dealer({
    params: Promise.resolve({ id: dealer.id }),
    searchParams: Promise.resolve({ section }),
  });
}

describe("dealership detail sections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.detail.mockResolvedValue({
      dealer,
      unbilled: [
        {
          id: "fixture-service",
          date: "2026-11-01",
          description: "Emissions inspections",
          quantity: 1,
          unitCents: 1500,
        },
      ],
      demo: false,
    });
  });

  it("shows account summary by default and keeps section navigation available", async () => {
    const html = renderToStaticMarkup(await page());
    expect(html).toContain("Balance due");
    expect(html).toContain("Primary contact");
    expect(html).toContain("Pat Billing");
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain("Authorize dealership terms");
    expect(html).not.toContain("Create invoice from saved services");
  });

  it("shows contact cards and an add-contact action in the contacts section", async () => {
    const html = renderToStaticMarkup(await page("contacts"));
    expect(html).toContain("Accounts payable");
    expect(html).toContain("pat@example.test");
    expect(html).toContain("Add contact");
    expect(html).not.toContain("Authorized billing terms");
  });

  it("shows billing settings only in the billing section", async () => {
    const html = renderToStaticMarkup(await page("billing"));
    expect(html).toContain("Account &amp; billing details");
    expect(html).toContain("Authorized billing terms");
    expect(html).not.toContain("Uploaded VIR inspections");
  });

  it("shows VIR records only in the VIR section", async () => {
    const html = renderToStaticMarkup(await page("vir"));
    expect(html).toContain("Uploaded VIR inspections");
    expect(html).toContain("CERT-1");
    expect(html).not.toContain("Create invoice from saved services");
  });

  it("shows saved services and invoices in the services section", async () => {
    const html = renderToStaticMarkup(await page("services"));
    expect(html).toContain("Completed services");
    expect(html).toContain("Create invoice from saved services");
    expect(html).toContain("Select completed services to invoice");
    expect(html).toContain("Select all listed services");
    expect(html).toContain("QP-2026-0001");
    expect(html).not.toContain("Authorize dealership terms");
  });
});
