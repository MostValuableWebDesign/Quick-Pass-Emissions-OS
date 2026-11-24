import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
import {
  expenseTotals,
  expenseMissing,
  buildSpendingReport,
  spendingCsv,
} from "@/modules/personal/expense-rules";
import { validateExpenseLedger } from "@/modules/personal/expense-service";
import { validReceiptSignature } from "@/modules/personal/expense-storage";
import type { ExpenseEntry, ExpenseView } from "@/modules/personal/expense-types";
const entry = (
  kind: ExpenseEntry["kind"],
  amountCents: number,
  date = "2026-11-24",
  fundingSource: ExpenseEntry["fundingSource"] = "BUSINESS",
): ExpenseEntry => ({
  id: crypto.randomUUID(),
  expenseId: "expense",
  kind,
  amountCents,
  date,
  fundingSource,
  paymentMethod: "Card",
  note: "",
  voidedAt: null,
  voidReason: null,
  createdAt: `${date}T15:00:00Z`,
});
const expense = (extra: Partial<ExpenseView> = {}): ExpenseView => {
  const e = {
    id: "expense",
    title: "Parts",
    amountCents: 10000,
    vendor: "Parts supplier",
    date: "2026-11-24",
    category: "Repairs",
    purpose: "Fix bay",
    paymentMethod: "Card",
    planned: false,
    version: 1,
    archivedAt: null,
    createdAt: "2026-11-24T15:00:00Z",
    updatedAt: "2026-11-24T15:00:00Z",
    entries: [],
    links: [],
    attachments: [],
    history: [],
    missing: [],
    ...extra,
  };
  return { ...e, totals: expenseTotals(e, e.entries) };
};
describe("expense money rules", () => {
  it("distinguishes planned, unpaid, partial and paid without inventing unknown amounts", () => {
    expect(expenseTotals({ amountCents: null, planned: true }, [])).toMatchObject({
      status: "PLANNED",
      balanceCents: null,
    });
    expect(expense().totals.status).toBe("UNPAID");
    expect(expense({ entries: [entry("PAYMENT", 2500)] }).totals).toMatchObject({
      status: "PARTIALLY_PAID",
      balanceCents: 7500,
    });
    expect(expense({ entries: [entry("PAYMENT", 10000)] }).totals.status).toBe("PAID");
  });
  it("refund reduces spending but never reopens the paid vendor balance", () => {
    expect(
      expense({ entries: [entry("PAYMENT", 10000), entry("REFUND", 3000)] }).totals,
    ).toMatchObject({
      spentCents: 7000,
      balanceCents: 0,
      status: "PAID",
    });
  });
  it("reimbursement is not another purchase, and a later refund can require a return", () => {
    const entries = [
      entry("PAYMENT", 10000, undefined, "PERSONAL"),
      entry("REIMBURSEMENT", 10000, undefined, "PERSONAL"),
      entry("REFUND", 2000, undefined, "PERSONAL"),
    ];
    expect(expense({ entries }).totals).toMatchObject({
      spentCents: 8000,
      reimbursedCents: 10000,
      reimbursementReturnDueCents: 2000,
    });
    entries.push(entry("REIMBURSEMENT_RETURN", 2000, undefined, "PERSONAL"));
    expect(expense({ entries }).totals).toMatchObject({
      spentCents: 8000,
      reimbursedCents: 8000,
      reimbursementReturnDueCents: 0,
    });
  });
  it("keeps voided entries in history but excludes their money", () => {
    expect(
      expense({ entries: [{ ...entry("PAYMENT", 5000), voidedAt: "2026-11-24T17:00:00Z" }] }).totals
        .paidCents,
    ).toBe(0);
  });
  it("rejects overpayments, unknown totals, over-refunds, premature refunds, and invalid reimbursement returns", () => {
    expect(() => validateExpenseLedger(10000, [entry("PAYMENT", 10001)])).toThrow(
      "Payments cannot exceed",
    );
    expect(() => validateExpenseLedger(null, [entry("PAYMENT", 100)])).toThrow("purchase amount");
    expect(() =>
      validateExpenseLedger(10000, [entry("PAYMENT", 1000), entry("REFUND", 1001)]),
    ).toThrow("refund cannot exceed");
    expect(() =>
      validateExpenseLedger(10000, [
        entry("PAYMENT", 1000, "2026-11-24"),
        entry("REFUND", 500, "2026-11-23"),
      ]),
    ).toThrow();
    expect(() => validateExpenseLedger(10000, [entry("REIMBURSEMENT_RETURN", 500)])).toThrow();
  });
  it("allows valid same-day returns and reimbursements without inventing a time order", () => {
    expect(() =>
      validateExpenseLedger(10000, [
        entry("PAYMENT", 10000, undefined, "PERSONAL"),
        entry("REIMBURSEMENT", 10000),
        entry("REIMBURSEMENT_RETURN", 10000),
        entry("REIMBURSEMENT", 10000),
      ]),
    ).not.toThrow();
  });
  it("gently flags missing details but planned purchases do not require receipts", () => {
    const e = expense({
      amountCents: null,
      vendor: "",
      category: "Uncategorized",
      purpose: "",
      paymentMethod: "",
      planned: true,
    });
    expect(expenseMissing(e, 0, [])).toEqual(["Amount", "Vendor", "Category", "Business purpose"]);
    expect(expenseMissing({ ...e, planned: false }, 0, [])).toContain("Receipt");
  });
});
describe("spending reports", () => {
  it("keeps the vendor balance when a deposit predates the purchase date", () => {
    const r = buildSpendingReport(
      [expense({ date: "2026-12-01", entries: [entry("PAYMENT", 2500)] })],
      "2026-11-24",
      "2026-11-24",
    );
    expect(r.spentCents).toBe(2500);
    expect(r.balanceCents).toBe(7500);
  });
  it("uses payment/refund dates, separates planned costs and avoids double counting reimbursement", () => {
    const purchase = expense({
      date: "2026-10-01",
      entries: [
        entry("PAYMENT", 10000, "2026-10-02", "PERSONAL"),
        entry("REFUND", 2500),
        entry("REIMBURSEMENT", 5000),
      ],
    });
    const planned = expense({ id: "plan", planned: true, category: "Supplies", amountCents: 4000 });
    const report = buildSpendingReport([purchase, planned], "2026-11-01", "2026-11-30");
    expect(report).toMatchObject({
      plannedCents: 4000,
      paidCents: 0,
      refundedCents: 2500,
      spentCents: -2500,
      reimbursedCents: 5000,
    });
    expect(report.categories.find((c) => c.category === "Repairs")?.spentCents).toBe(-2500);
  });
  it("includes endpoint dates and distinguishes missing balances from zero", () => {
    const r = buildSpendingReport(
      [expense({ amountCents: null }), expense({ id: "zero", amountCents: 0 })],
      "2026-11-24",
      "2026-11-24",
    );
    expect(r.rows).toHaveLength(2);
    expect(r.unknownBalanceCount).toBe(1);
    expect(r.balanceCents).toBe(0);
    expect(buildSpendingReport([expense()], "2026-11-25", "2026-12-01").rows).toHaveLength(0);
  });
  it("archiving never hides actual spending from reports but cancels planned projection", () => {
    const r = buildSpendingReport(
      [
        expense({ archivedAt: "2026-11-24T18:00:00Z", entries: [entry("PAYMENT", 2000)] }),
        expense({ id: "plan", planned: true, archivedAt: "2026-11-24T18:00:00Z" }),
      ],
      "2026-11-01",
      "2026-11-30",
    );
    expect(r.spentCents).toBe(2000);
    expect(r.plannedCents).toBe(0);
  });
  it("exports amounts exactly and escapes commas, quotes and spreadsheet formulas", () => {
    const text = spendingCsv(
      buildSpendingReport(
        [
          expense({
            title: '=HYPERLINK("bad")',
            vendor: "Parts, Inc.",
            entries: [entry("PAYMENT", 9999)],
          }),
        ],
        "2026-11-01",
        "2026-11-30",
      ),
    );
    expect(text).toContain(`"'=HYPERLINK(""bad"")"`);
    expect(text).toContain('"Parts, Inc."');
    expect(text).toContain('"99.99"');
  });
});
describe("receipt signatures", () => {
  it("accepts matching signatures and rejects disguised HTML", () => {
    expect(validReceiptSignature(Buffer.from("%PDF-1.7 example"), "application/pdf")).toBe(true);
    expect(validReceiptSignature(Buffer.from("<html>fake.pdf"), "application/pdf")).toBe(false);
    expect(validReceiptSignature(Buffer.from("RIFF1234WEBPabcd"), "image/webp")).toBe(true);
    expect(validReceiptSignature(Buffer.from("%PDF-1.7 example"), "image/jpeg")).toBe(false);
  });
});
