import type { InvoicePdfDetails } from "@/modules/finance/invoice-document";

/** Demonstration-only billing data; never uses or changes business records. */
export function invoiceDesignFixture(name: string): InvoicePdfDetails {
  return {
    number: "SAMPLE-104",
    status: "DRAFT",
    issueDate: "2026-11-16",
    dueDate: "2026-12-16",
    snapshot: {
      name,
      code: "DESIGN-PREVIEW",
      billingAddress: "Saved dealership billing address",
      phone: "",
      termsDays: 30,
      termsReference: "Demonstration terms only",
      contacts: [
        { name: "Accounts Payable", email: "billing@example.test", phone: "", purpose: "Invoices" },
      ],
    },
    notes: "Design sample only. Not a real invoice and not a request for payment.",
    demo: true,
    lines: [
      {
        date: "2026-11-12",
        description: "Emissions inspections",
        quantity: 8,
        unitCents: 2000,
        amountCents: 16000,
      },
      {
        date: "2026-11-13",
        description: "Emissions inspections",
        quantity: 12,
        unitCents: 2000,
        amountCents: 24000,
      },
      {
        date: "2026-11-14",
        description: "Emissions inspections",
        quantity: 5,
        unitCents: 2000,
        amountCents: 10000,
      },
    ],
    subtotalCents: 50000,
    taxBps: 0,
    taxCents: 0,
    totalCents: 50000,
    paidCents: 0,
    remainingCents: 0,
  };
}
