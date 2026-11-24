import { describe, it, expect } from "vitest";
import { mergeExpenseWorkspace, parseCents } from "@/components/personal/expenses-api";
import type { ExpenseView, ExpenseWorkspaceData } from "@/modules/personal/expense-types";
const expense = (version: number, extra: Partial<ExpenseView> = {}): ExpenseView => ({
  id: "purchase",
  version,
  title: `Version ${version}`,
  amountCents: 10000,
  vendor: "Vendor",
  date: "2026-11-24",
  category: "Supplies",
  purpose: "Repair",
  paymentMethod: "Card",
  planned: false,
  archivedAt: null,
  createdAt: "2026-11-24T15:00:00Z",
  updatedAt: "2026-11-24T15:00:00Z",
  entries: [],
  links: [],
  attachments: [],
  history: [],
  missing: ["Receipt"],
  totals: {
    paidCents: 0,
    refundedCents: 0,
    spentCents: 0,
    reimbursedCents: 0,
    personalOutstandingCents: 0,
    reimbursementReturnDueCents: 0,
    balanceCents: 10000,
    status: "UNPAID",
  },
  ...extra,
});
const data = (...expenses: ExpenseView[]): ExpenseWorkspaceData => ({
  expenses,
  notes: [],
  tasks: [],
  today: "2026-11-24",
});
describe("expense client snapshots", () => {
  it("never downgrades an own saved version when a delayed refresh arrives", () => {
    const merged = mergeExpenseWorkspace(data(expense(3)), data(expense(2)));
    expect(merged.expenses[0].version).toBe(3);
    expect(merged.expenses[0].title).toBe("Version 3");
  });
  it("accepts new versions, while keeping saved purchases absent from an older full response", () => {
    const merged = mergeExpenseWorkspace(
      data(expense(1), expense(2, { id: "new" })),
      data(expense(3)),
    );
    expect(merged.expenses).toHaveLength(2);
    expect(merged.expenses.find((e) => e.id === "purchase")?.version).toBe(3);
  });
  it("preserves completed receipt metadata on out-of-order upload responses", () => {
    const a = {
      id: "a",
      filename: "a.png",
      mimeType: "image/png",
      byteSize: 10,
      uploadedAt: "2026-11-24T15:00:00Z",
    };
    const b = { ...a, id: "b", filename: "b.png" };
    const merged = mergeExpenseWorkspace(
      data(expense(3, { attachments: [a] })),
      data(expense(3, { attachments: [b] })),
    );
    expect(merged.expenses[0].attachments).toHaveLength(2);
    expect(merged.expenses[0].missing).not.toContain("Receipt");
  });
  it("parses exact cents and rejects hidden fractional cents", () => {
    expect(parseCents("$1,240.50")).toBe(124050);
    expect(parseCents("0.29")).toBe(29);
    expect(parseCents("")).toBeNull();
    expect(Number.isNaN(parseCents("1.005"))).toBe(true);
  });
});
