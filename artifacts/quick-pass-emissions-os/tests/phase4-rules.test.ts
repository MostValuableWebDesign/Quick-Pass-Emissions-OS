import { describe, it, expect } from "vitest";
import { invoiceTotals, receivable, csv, reportRange } from "../src/modules/finance/rules";
describe("Phase 4 exact finance rules", () => {
  it("rounds tax half up on subtotal and bounds integer arithmetic", () => {
    expect(
      invoiceTotals(
        [
          { quantity: 3, unitCents: 101 },
          { quantity: 1, unitCents: 97 },
        ],
        125,
      ),
    ).toEqual({ amounts: [303, 97], subtotalCents: 400, taxCents: 5, totalCents: 405 });
    expect(invoiceTotals([{ quantity: 1, unitCents: 1 }], 5000).totalCents).toBe(2);
    for (const [quantity, unitCents] of [
      [0, 1],
      [1.5, 100],
      [100000, 2000000000],
    ])
      expect(() => invoiceTotals([{ quantity, unitCents }], 0)).toThrow();
    expect(() => invoiceTotals([{ quantity: 1, unitCents: 2000000000 }], 1)).toThrow("bounds");
  });
  const invoice = {
    state: "APPROVED",
    totalCents: 10000,
    dueDate: "2026-01-01",
    issueDate: "2025-12-01",
    voidDate: null,
  };
  it("uses effective payment/reversal dates and live overdue buckets", () => {
    const payments = [
      { amountCents: 4000, date: "2026-01-03" },
      { amountCents: -4000, date: "2026-02-01" },
    ];
    expect(receivable(invoice, payments, "2026-01-01")).toMatchObject({
      status: "Approved",
      remainingCents: 10000,
      bucket: "Current",
    });
    expect(receivable(invoice, payments, "2026-01-31")).toMatchObject({
      status: "Overdue",
      paidCents: 4000,
      remainingCents: 6000,
      days: 30,
      bucket: "1–30 days",
    });
    expect(receivable(invoice, payments, "2026-02-01")).toMatchObject({
      remainingCents: 10000,
      bucket: "31–60 days",
    });
    for (const [date, bucket] of [
      ["2026-03-02", "31–60 days"],
      ["2026-03-03", "61–90 days"],
      ["2026-04-02", "91+ days"],
    ])
      expect(receivable(invoice, [], date).bucket).toBe(bucket);
  });
  it("excludes drafts and effective voids; paid and partial status are derived", () => {
    expect(receivable({ ...invoice, state: "DRAFT" }, [], "2026-02-01")).toMatchObject({
      recognized: false,
      status: "Draft",
      remainingCents: 0,
    });
    expect(
      receivable({ ...invoice, state: "VOIDED", voidDate: "2026-02-01" }, [], "2026-01-31")
        .remainingCents,
    ).toBe(10000);
    expect(
      receivable({ ...invoice, state: "VOIDED", voidDate: "2026-02-01" }, [], "2026-02-01").status,
    ).toBe("Voided");
    expect(receivable(invoice, [{ amountCents: 1, date: "2025-12-31" }], "2026-01-01").status).toBe(
      "Partially paid",
    );
    expect(
      receivable(invoice, [{ amountCents: 10000, date: "2026-01-01" }], "2026-02-01").status,
    ).toBe("Paid");
  });
  it("validates report dates and blocks spreadsheet formulas while retaining signed cents", () => {
    expect(() => reportRange.parse({ start: "2026-02-30", end: "2026-03-01" })).toThrow();
    expect(() => reportRange.parse({ start: "2026-03-02", end: "2026-03-01" })).toThrow();
    expect(() => reportRange.parse({ start: "2024-01-01", end: "2026-01-01" })).toThrow();
    const text = csv([["=1+1", "\t@SUM(A1)", 'a,"b', -4000]]);
    expect(text).toContain('"\'=1+1"');
    expect(text).toContain('"\'\t@SUM(A1)"');
    expect(text).toContain('"a,""b"');
    expect(text).toContain('"-4000"');
  });
});
