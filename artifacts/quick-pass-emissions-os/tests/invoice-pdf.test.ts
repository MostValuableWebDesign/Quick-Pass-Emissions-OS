import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createInvoicePdf } from "@/modules/finance/invoice-pdf";
import {
  invoiceIssuer,
  invoiceSnapshotSchema,
  type InvoicePdfDetails,
} from "@/modules/finance/invoice-document";
import { dealershipInvoiceBrands } from "@/modules/finance/dealership-invoice-branding";
import { invoiceDesignFixture } from "./fixtures/invoice-design";

async function pdfText(bytes: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  try {
    const document = await task.promise;
    const pages = [];
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      pages.push(content.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(" "));
    }
    return pages.join(" ");
  } finally {
    await task.destroy();
  }
}

const invoicePdfFixture: InvoicePdfDetails = {
  number: "INV-104",
  status: "APPROVED",
  issueDate: "2026-10-01",
  dueDate: "2026-10-20",
  snapshot: {
    name: "Fixture Motors",
    code: "INTERNAL",
    phone: "555-0100",
    billingAddress: "100 Fixture Avenue",
    termsDays: 19,
    termsReference: "Fixture terms",
    contacts: [
      { name: "Fixture Billing", email: "billing@example.test", phone: "", purpose: "Invoices" },
    ],
  },
  notes: "Thank you for your business.",
  demo: false,
  lines: [
    {
      date: "2026-10-01",
      description: "Emissions inspections",
      quantity: 5,
      unitCents: 2000,
      amountCents: 10000,
    },
  ],
  subtotalCents: 10000,
  taxBps: 0,
  taxCents: 0,
  totalCents: 10000,
  paidCents: 2000,
  remainingCents: 8000,
};

describe("invoice PDF generation", () => {
  it("creates a valid letter-size invoice document", async () => {
    const bytes = await createInvoicePdf(invoicePdfFixture);
    const document = await PDFDocument.load(bytes);
    expect(document.getTitle()).toContain("Invoice INV-104");
    expect(document.getPageCount()).toBe(1);
    expect(document.getPages()[0].getSize()).toEqual({ width: 612, height: 792 });
  });

  it("prints each inspection VIN in the invoice line details", async () => {
    const bytes = await createInvoicePdf({
      ...invoicePdfFixture,
      lines: [
        {
          ...invoicePdfFixture.lines[0],
          description:
            "Emissions inspections\nVehicle VINs:\nVIN: 1M8GDM9AXKP042788\nVIN: 1M8GDM9AXKP042789",
          quantity: 2,
        },
      ],
    });
    const text = await pdfText(bytes);
    expect(text).toContain("1M8GDM9AXKP042788");
    expect(text).toContain("1M8GDM9AXKP042789");
  });

  it("continues long VIN lists across pages without clipping invoice details", async () => {
    const vins = Array.from({ length: 90 }, (_, index) => String(index).padStart(17, "0"));
    const bytes = await createInvoicePdf({
      ...invoicePdfFixture,
      lines: [
        {
          ...invoicePdfFixture.lines[0],
          description: `Emissions inspections\nVehicle VINs:\n${vins.map((vin) => `VIN: ${vin}`).join("\n")}`,
          quantity: vins.length,
        },
      ],
    });
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThan(1);
    const text = await pdfText(bytes);
    expect(text).toContain(`VIN: ${vins[0]}`);
    expect(text).toContain(`VIN: ${vins.at(-1)}`);
  });

  it("embeds a clickable secure payment link when the invoice has an active balance", async () => {
    const url = `https://quickpassemissions.com/api/invoices/pay/${"a".repeat(72)}`;
    const document = await PDFDocument.load(
      await createInvoicePdf({ ...invoicePdfFixture, paymentUrl: url }),
    );
    const annotations = document.getPages()[0].node.Annots();
    expect(annotations).toBeInstanceOf(PDFArray);
    expect(annotations?.size()).toBe(1);
    const annotation = document.context.lookup(annotations!.get(0), PDFDict);
    const action = annotation.lookup(PDFName.of("A"), PDFDict);
    expect(action.lookup(PDFName.of("URI"), PDFString).decodeText()).toBe(url);
    expect(await pdfText(await document.save())).toContain("Pay this invoice securely online");
  });

  it("paginates long service tables and notes", async () => {
    const bytes = await createInvoicePdf({
      ...invoicePdfFixture,
      lines: Array.from({ length: 100 }, (_, index) => ({
        date: "2026-10-01",
        description: `Completed emissions inspection group ${index + 1}. Additional service description for billing review.`,
        quantity: 1,
        unitCents: 2000,
        amountCents: 2000,
      })),
      subtotalCents: 200000,
      totalCents: 200000,
      remainingCents: 198000,
      notes: "Retained billing notes. ".repeat(80),
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
  });

  it("reads historical snapshots without the newly added dealership phone field", () => {
    const historical = { ...invoicePdfFixture.snapshot, phone: undefined };
    expect(invoiceSnapshotSchema.parse(historical).phone).toBe("");
  });

  it.each(dealershipInvoiceBrands)(
    "embeds $displayName branding without changing billing details or totals",
    async (brand) => {
      const fixture = {
        ...invoiceDesignFixture(brand.displayName),
        // Use non-demo financial amounts to ensure customer styling cannot change calculations.
        status: "APPROVED",
        demo: false,
        paidCents: 10000,
        remainingCents: 40000,
      };
      const original = structuredClone(fixture);
      const bytes = await createInvoicePdf(fixture);
      expect(fixture).toEqual(original);
      const document = await PDFDocument.load(bytes);
      const images = document.context
        .enumerateIndirectObjects()
        .filter(
          ([, object]) =>
            object instanceof PDFRawStream &&
            object.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"),
        );
      expect(images.length).toBeGreaterThan(0);
      const text = await pdfText(bytes);
      for (const expected of [
        "QUICK PASS",
        invoiceIssuer.email,
        invoiceIssuer.website,
        brand.displayName,
        fixture.snapshot.billingAddress,
        "billing@example.test",
        "SAMPLE-104",
        "$500.00",
        "$100.00",
        "$400.00",
      ])
        expect(text.toUpperCase()).toContain(expected.toUpperCase());
      expect(document.getPages()[0].getSize()).toEqual({ width: 612, height: 792 });
    },
  );

  it("keeps a branded long invoice readable across pages with each service retained", async () => {
    const fixture = invoiceDesignFixture("Top Deals Automotive LLC");
    fixture.lines = Array.from({ length: 75 }, (_, index) => ({
      date: "2026-11-12",
      description: `Distinct inspection group ${index + 1}`,
      quantity: 1,
      unitCents: 2000,
      amountCents: 2000,
    }));
    fixture.subtotalCents = fixture.totalCents = 150000;
    fixture.snapshot.contacts = Array.from({ length: 8 }, (_, index) => ({
      name: `Billing contact ${index + 1}`,
      email: `contact${index + 1}@example.test`,
      phone: "",
      purpose: "Invoice administration",
    }));
    const bytes = await createInvoicePdf(fixture);
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThan(1);
    const text = await pdfText(bytes);
    expect(text).toContain("Distinct inspection group 1");
    expect(text).toContain("Distinct inspection group 75");
    expect(text).toContain("$1,500.00");
    expect(text.toUpperCase()).toContain("DRAFT");
  });
});
