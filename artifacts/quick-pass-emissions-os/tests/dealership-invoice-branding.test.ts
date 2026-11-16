import { readFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvoiceCustomerBrand } from "@/components/invoice-customer-brand";
import {
  dealershipInvoiceBrand,
  dealershipInvoiceBrands,
} from "@/modules/finance/dealership-invoice-branding";

describe("dealership invoice branding", () => {
  it.each([
    ["Turn & Burn Motors", "turn-and-burn"],
    ["TURN AND BURN MOTORS, LLC", "turn-and-burn"],
    ["Conyers Nissan, Inc.", "conyers-nissan"],
    ["Nissan of Conyers", "conyers-nissan"],
    ["Byrider Conyers", "byrider-conyers"],
    ["J.D. Byrider Conyers", "byrider-conyers"],
    ["Apex Autos ATL, LLC", "apex-autos"],
    ["Top Deals Automotive LLC", "top-deals"],
  ])("matches the reviewed dealership name %s", (name, id) => {
    expect(dealershipInvoiceBrand(name)?.id).toBe(id);
  });

  it.each([
    "",
    "Other Motors",
    "Conyers Toyota",
    "Byrider Covington",
    "Not Apex Autos",
    "Top Deals Automotive competitor",
    "https://www.conyersnissan.com/",
  ])("does not guess a brand for %s", (name) => {
    expect(dealershipInvoiceBrand(name)).toBeNull();
  });

  it("uses unique, locally bundled PNG logos and fixed official-site links", async () => {
    expect(new Set(dealershipInvoiceBrands.map((brand) => brand.id)).size).toBe(5);
    for (const brand of dealershipInvoiceBrands) {
      expect(brand.website).toMatch(/^https:\/\//);
      expect(brand.logo).toMatch(/^\/images\/invoice-dealerships\/[a-z-]+\.png$/);
      const bytes = await readFile(path.join(process.cwd(), "public", brand.logo));
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(bytes.length).toBeLessThan(200_000);
      for (const color of [brand.accent, brand.heading, brand.tint, brand.logoBackground])
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(dealershipInvoiceBrands)(
    "uses the same $displayName identity on the invoice page",
    (brand) => {
      const html = renderToStaticMarkup(
        createElement(InvoiceCustomerBrand, {
          name: brand.displayName,
          billingAddress: "Owner-saved billing address",
          phone: "(555) 123-4567",
          contacts: [
            { name: "Billing", email: "billing@example.test", phone: "", purpose: "Invoices" },
          ],
        }),
      );
      expect(html).toContain(brand.logo);
      expect(html).toContain(brand.website);
      expect(html).toContain("Owner-saved billing address");
      expect(html).toContain("billing@example.test");
      expect(html).toContain("Issued by Quick Pass Emissions");
    },
  );

  it("keeps unknown dealership names and contacts without borrowing another dealership's logo", () => {
    const html = renderToStaticMarkup(
      createElement(InvoiceCustomerBrand, {
        name: "Other & Company",
        billingAddress: "Retained address",
        phone: "",
        contacts: [],
      }),
    );
    expect(html).toContain("Other &amp; Company");
    expect(html).not.toContain("img-dealership-logo");
    expect(html).not.toContain("conyersnissan.com");
  });
});
