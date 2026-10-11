import { describe, expect, it } from "vitest";
import { parseCertificateOrders } from "../src/modules/certificates/order-history-source";
import { certificateOrderInsights } from "../src/modules/certificates/order-insights";
import { PortalSession } from "../src/modules/station/portal-client";
import { CERTIFICATE_ANALYZER, CERTIFICATE_STATION } from "../src/modules/certificates/portal-types";

const headers = ["Transaction ID", "Analyzer ID", "Start E-Cert Number", "End E-Cert Number",
  "Quantity", "Unit Price", "Amount", "Sale Date", "Payment Type", "Purchased By", "IP Address", "Analyzer Flag"];
function exported(quantity = "300", id = "123") {
  const cells = [id, CERTIFICATE_ANALYZER, "EC100", "EC399", quantity, "$20.00", "$6000.00",
    "10/03/2026 03:33 PM", "Card", "PRIVATE PURCHASER", "192.0.2.1", "Yes"];
  return `<table id="MainContent_gvMain"><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
    <tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr></table>`;
}
const order = (date: string, quantity = 300, analyzer = CERTIFICATE_ANALYZER) => ({
  transactionId: date, saleDate: date, quantity, analyzer, saleTime: "07:52 AM", analyzerFlag: "Yes",
});
const portal = { balance: 100, threshold: 30, checkedAt: null, station: CERTIFICATE_STATION, analyzer: CERTIFICATE_ANALYZER };

describe("original certificate order export", () => {
  it("keeps order evidence, but discards purchaser, payment details, certificate ranges and IP", () => {
    const records = parseCertificateOrders(exported(), 1);
    expect(records[0]).toMatchObject({ quantity: 300, saleDate: "2026-10-03", saleTime: "03:33 PM" });
    expect(JSON.stringify(records)).not.toMatch(/PRIVATE|192\.0\.2\.1|6000|EC100|Card/);
  });
  it("preserves negative and zero official transactions rather than losing report coverage", () => {
    expect(parseCertificateOrders(exported("-300"), 1)[0].quantity).toBe(-300);
    expect(parseCertificateOrders(exported("0"), 1)[0].quantity).toBe(0);
  });
  it("rejects incomplete exports, changed columns and invalid dates", () => {
    expect(() => parseCertificateOrders(exported(), 2)).toThrow();
    expect(() => parseCertificateOrders(exported().replace("Sale Date", "Different date"), 1)).toThrow();
    expect(() => parseCertificateOrders(exported().replace("10/03/2026", "02/30/2026"), 1)).toThrow();
  });
  it("does not grant order-history access to ordinary test-report sessions", async () => {
    const transport = async () => new Response("<html/>");
    await expect(new PortalSession(transport).request("/Purchasing/TAReport.aspx")).rejects.toThrow("unsupported");
    await expect(new PortalSession(transport, false, true).request("/Purchasing/TAReport.aspx")).resolves.toMatchObject({ html: "<html/>" });
    await expect(new PortalSession(transport, false, true).request("/Purchasing/Purchasing.aspx")).rejects.toThrow("unsupported");
  });
});
describe("order-based certificate planning", () => {
  it("uses the analyzer's order intervals and authoritative balance without opening stock", () => {
    const result = certificateOrderInsights([order("2026-10-03"), order("2026-10-09")], portal, "2026-10-10",
      { windowDays: 30, leadDays: 3, reorderPoint: 40 });
    expect(result).toMatchObject({ average: 50, reorderAt: 150, daysRemaining: 2, depletionDate: "2026-10-12", balance: 100, sampleMode: "recent" });
  });
  it("uses the latest saved order interval until the configured window has two order dates", () => {
    const result = certificateOrderInsights([
      order("2026-08-01"), order("2026-09-01"), order("2026-10-09"),
    ], portal, "2026-10-10", { windowDays: 30, leadDays: 3, reorderPoint: 40 });
    expect(result).toMatchObject({
      average: 300 / 38,
      sampleStart: "2026-09-01",
      sampleEnd: "2026-10-09",
      sampleDays: 38,
      sampleMode: "history",
    });
  });
  it("excludes other analyzers, future orders, zero/negative quantities and dates outside the window", () => {
    const result = certificateOrderInsights([
      order("2026-10-03"), order("2026-10-09"),
      order("2026-10-04", 5000, "OTHER"), order("2026-10-05", -9000),
      order("2026-10-06", 0), order("2026-10-11", 9000), order("2026-01-01", 9000),
    ], portal, "2026-10-10", null);
    expect(result.average).toBe(50);
    expect(result.reorderAt).toBe(30);
  });
  it("does not invent a usage rate from one order date or a depletion date without balance", () => {
    expect(certificateOrderInsights([order("2026-10-09")], portal, "2026-10-10", null).average).toBeNull();
    expect(certificateOrderInsights([order("2026-10-03"), order("2026-10-09")],
      { ...portal, balance: null }, "2026-10-10", null).depletionDate).toBeNull();
    expect(certificateOrderInsights([order("2026-10-03"), order("2026-10-09")],
      { ...portal, balance: 0 }, "2026-10-10", null).depletionDate).toBe("2026-10-10");
  });
});
