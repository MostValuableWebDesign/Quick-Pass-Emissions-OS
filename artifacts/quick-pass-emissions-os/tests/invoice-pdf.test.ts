import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createInvoicePdf } from "@/modules/finance/invoice-pdf";
import { invoiceSnapshotSchema, type InvoicePdfDetails } from "@/modules/finance/invoice-document";

const invoicePdfFixture: InvoicePdfDetails = {
  number: "INV-104", status: "APPROVED", issueDate: "2026-10-01", dueDate: "2026-10-20",
  snapshot: {
    name: "Fixture Motors", code: "INTERNAL", phone: "555-0100", billingAddress: "100 Fixture Avenue",
    termsDays: 19, termsReference: "Fixture terms",
    contacts: [{ name: "Fixture Billing", email: "billing@example.test", phone: "", purpose: "Invoices" }],
  },
  notes: "Thank you for your business.",
  demo: false,
  lines: [{ date: "2026-10-01", description: "Emissions inspections", quantity: 5, unitCents: 2000, amountCents: 10000 }],
  subtotalCents: 10000, taxBps: 0, taxCents: 0, totalCents: 10000, paidCents: 2000, remainingCents: 8000,
};

describe("invoice PDF generation", () => {
  it("creates a valid letter-size invoice document", async () => {
    const bytes = await createInvoicePdf(invoicePdfFixture);
    const document = await PDFDocument.load(bytes);
    expect(document.getTitle()).toContain("Invoice INV-104");
    expect(document.getPageCount()).toBe(1);
    expect(document.getPages()[0].getSize()).toEqual({ width: 612, height: 792 });
  });

  it("paginates long service tables and notes", async () => {
    const bytes = await createInvoicePdf({
      ...invoicePdfFixture,
      lines: Array.from({ length: 100 }, (_, index) => ({
        date: "2026-10-01", description: `Completed emissions inspection group ${index + 1}. Additional service description for billing review.`,
        quantity: 1, unitCents: 2000, amountCents: 2000,
      })),
      subtotalCents: 200000, totalCents: 200000, remainingCents: 198000,
      notes: "Retained billing notes. ".repeat(80),
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
  });

  it("reads historical snapshots without the newly added dealership phone field", () => {
    const historical = { ...invoicePdfFixture.snapshot, phone: undefined };
    expect(invoiceSnapshotSchema.parse(historical).phone).toBe("");
  });
});
