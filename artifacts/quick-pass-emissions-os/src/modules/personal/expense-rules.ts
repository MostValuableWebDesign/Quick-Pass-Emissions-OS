import type { ExpenseFields, ExpenseTotals, ExpenseView, SpendingSnapshot } from "./expense-types";

export type ExpenseLedgerEntry = {
  kind: string;
  amountCents: number;
  fundingSource: string;
  voidedAt: unknown;
  paymentMethod?: string;
};
export function expenseTotals(
  expense: Pick<ExpenseFields, "amountCents" | "planned">,
  entries: ExpenseLedgerEntry[],
): ExpenseTotals {
  const active = entries.filter((e) => !e.voidedAt);
  const sum = (kind: string, source?: string) =>
    active
      .filter((e) => e.kind === kind && (!source || e.fundingSource === source))
      .reduce((n, e) => n + e.amountCents, 0);
  const paidCents = sum("PAYMENT"),
    refundedCents = sum("REFUND"),
    reimbursedCents = sum("REIMBURSEMENT") - sum("REIMBURSEMENT_RETURN");
  const balanceCents =
    expense.amountCents === null ? null : Math.max(0, expense.amountCents - paidCents);
  return {
    paidCents,
    refundedCents,
    spentCents: paidCents - refundedCents,
    reimbursedCents,
    personalOutstandingCents: Math.max(
      0,
      sum("PAYMENT", "PERSONAL") - sum("REFUND", "PERSONAL") - reimbursedCents,
    ),
    reimbursementReturnDueCents: Math.max(
      0,
      reimbursedCents - sum("PAYMENT", "PERSONAL") + sum("REFUND", "PERSONAL"),
    ),
    balanceCents,
    status: expense.planned
      ? "PLANNED"
      : balanceCents === 0
        ? "PAID"
        : paidCents > 0
          ? "PARTIALLY_PAID"
          : "UNPAID",
  };
}
export function expenseMissing(
  expense: ExpenseFields,
  attachmentCount: number,
  entries: ExpenseLedgerEntry[],
) {
  const missing: string[] = [];
  if (expense.amountCents === null) missing.push("Amount");
  if (!expense.vendor.trim()) missing.push("Vendor");
  if (!expense.category.trim() || expense.category === "Uncategorized") missing.push("Category");
  if (!expense.purpose.trim()) missing.push("Business purpose");
  if (!expense.planned && !attachmentCount) missing.push("Receipt");
  if (
    !expense.paymentMethod.trim() &&
    entries.some((e) => !e.voidedAt && e.kind === "PAYMENT" && !e.paymentMethod?.trim())
  )
    missing.push("Payment method");
  if (expenseTotals(expense, entries).reimbursementReturnDueCents > 0)
    missing.push("Reimbursement return due");
  return missing;
}
export function buildSpendingReport(
  expenses: ExpenseView[],
  startDate: string,
  endDate: string,
): SpendingSnapshot {
  const inRange = (date: string) => date >= startDate && date <= endDate;
  const rows: SpendingSnapshot["rows"] = [];
  const categories = new Map<string, SpendingSnapshot["categories"][number]>();
  let balanceCents = 0,
    unknownBalanceCount = 0,
    plannedUnknownCount = 0;
  for (const e of expenses) {
    const transactions = e.entries.filter((t) => !t.voidedAt && inRange(t.date));
    const dated = inRange(e.date);
    if (!dated && !transactions.length) continue;
    const total = expenseTotals(e, transactions);
    const atEnd = expenseTotals(
      e,
      e.entries.filter((t) => t.date <= endDate),
    );
    const planned = dated && e.planned && !e.archivedAt;
    const plannedCents = planned ? (e.amountCents ?? 0) : 0;
    if (planned && e.amountCents === null) plannedUnknownCount++;
    const remaining = !e.planned ? atEnd.balanceCents : 0;
    if (remaining === null) unknownBalanceCount++;
    else balanceCents += remaining;
    const row = {
      id: e.id,
      title: e.title,
      vendor: e.vendor,
      category: e.category,
      date: e.date,
      purpose: e.purpose,
      paymentMethod: e.paymentMethod,
      planned: e.planned,
      amountCents: e.amountCents,
      plannedCents,
      paidCents: total.paidCents,
      refundedCents: total.refundedCents,
      spentCents: total.spentCents,
      reimbursedCents: total.reimbursedCents,
      balanceCents: remaining,
      missing: e.missing,
      transactions,
    };
    rows.push(row);
    const c = categories.get(e.category) ?? {
      category: e.category,
      plannedCents: 0,
      paidCents: 0,
      refundedCents: 0,
      spentCents: 0,
      reimbursedCents: 0,
    };
    for (const key of [
      "plannedCents",
      "paidCents",
      "refundedCents",
      "spentCents",
      "reimbursedCents",
    ] as const)
      c[key] += row[key];
    categories.set(e.category, c);
  }
  const sums = (
    key: "plannedCents" | "paidCents" | "refundedCents" | "spentCents" | "reimbursedCents",
  ) => rows.reduce((n, r) => n + r[key], 0);
  return {
    startDate,
    endDate,
    rows,
    categories: [...categories.values()].sort((a, b) => a.category.localeCompare(b.category)),
    plannedCents: sums("plannedCents"),
    plannedUnknownCount,
    paidCents: sums("paidCents"),
    refundedCents: sums("refundedCents"),
    spentCents: sums("spentCents"),
    reimbursedCents: sums("reimbursedCents"),
    balanceCents,
    unknownBalanceCount,
  };
}
export function spendingText(s: SpendingSnapshot) {
  const dollars = (n: number) => `$${(n / 100).toFixed(2)}`;
  return `SPENDING (${s.startDate} – ${s.endDate})\nPlanned purchases: ${dollars(s.plannedCents)}${s.plannedUnknownCount ? ` + ${s.plannedUnknownCount} without amounts` : ""}\nPayments: ${dollars(s.paidCents)}\nRefunds: ${dollars(s.refundedCents)}\nNet purchase spending: ${dollars(s.spentCents)}\nReimbursements: ${dollars(s.reimbursedCents)} (not counted again as spending)\nRemaining vendor balance for included purchases: ${dollars(s.balanceCents)}${s.unknownBalanceCount ? ` + ${s.unknownBalanceCount} unknown` : ""}\n${s.categories.map((c) => `${c.category}: ${dollars(c.spentCents)} spent · ${dollars(c.plannedCents)} planned`).join("\n")}`;
}
export function spendingCsv(s: SpendingSnapshot) {
  const cell = (v: unknown) =>
    `"${String(v ?? "")
      .replace(/^\s*[=+\-@\t\r]/, "'$&")
      .replace(/"/g, '""')}"`;
  const money = (n: number | null) => (n === null ? "" : (n / 100).toFixed(2));
  const header = [
    "Expense ID",
    "Title",
    "Vendor",
    "Purchase date",
    "Category",
    "Business purpose",
    "Payment method",
    "Planned",
    "Purchase amount USD",
    "Planned in period USD",
    "Payments in period USD",
    "Refunds in period USD",
    "Net spending in period USD",
    "Reimbursements in period USD",
    "Remaining at period end USD",
    "Missing details",
    "Report start",
    "Report end",
    "Transactions",
  ];
  return (
    "\uFEFF" +
    [
      header,
      ...s.rows.map((r) => [
        r.id,
        r.title,
        r.vendor,
        r.date,
        r.category,
        r.purpose,
        r.paymentMethod,
        r.planned ? "Yes" : "No",
        money(r.amountCents),
        money(r.plannedCents),
        money(r.paidCents),
        money(r.refundedCents),
        money(r.spentCents),
        money(r.reimbursedCents),
        money(r.balanceCents),
        r.missing.join("; "),
        s.startDate,
        s.endDate,
        r.transactions
          .map(
            (t) =>
              `${t.date} ${t.kind} ${money(t.amountCents)} ${t.fundingSource} ${t.paymentMethod} ${t.note}`,
          )
          .join("; "),
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
