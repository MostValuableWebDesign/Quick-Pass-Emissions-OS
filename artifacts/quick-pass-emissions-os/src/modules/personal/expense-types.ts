export type ExpenseEntry = {
  id: string;
  expenseId: string;
  kind: "PAYMENT" | "REFUND" | "REIMBURSEMENT" | "REIMBURSEMENT_RETURN";
  amountCents: number;
  date: string;
  fundingSource: "BUSINESS" | "PERSONAL";
  paymentMethod: string;
  note: string;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
};
export type ExpenseFields = {
  title: string;
  amountCents: number | null;
  vendor: string;
  date: string;
  category: string;
  purpose: string;
  paymentMethod: string;
  planned: boolean;
};
export type ExpenseTotals = {
  paidCents: number;
  refundedCents: number;
  spentCents: number;
  reimbursedCents: number;
  personalOutstandingCents: number;
  reimbursementReturnDueCents: number;
  balanceCents: number | null;
  status: "PLANNED" | "UNPAID" | "PARTIALLY_PAID" | "PAID";
};
export type ExpenseView = ExpenseFields & {
  id: string;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  entries: ExpenseEntry[];
  totals: ExpenseTotals;
  missing: string[];
  links: { id: string; sourceKey: string; noteId: string | null; taskId: string | null }[];
  attachments: {
    id: string;
    filename: string;
    mimeType: string;
    byteSize: number;
    uploadedAt: string | null;
  }[];
  history: { id: string; action: string; detail: string; snapshot: unknown; createdAt: string }[];
};
export type ExpenseWorkspaceData = {
  expenses: ExpenseView[];
  notes: { id: string; title: string }[];
  tasks: { id: string; title: string }[];
  today: string;
};
export type SpendingSnapshot = {
  startDate: string;
  endDate: string;
  plannedCents: number;
  plannedUnknownCount: number;
  paidCents: number;
  refundedCents: number;
  spentCents: number;
  reimbursedCents: number;
  balanceCents: number;
  unknownBalanceCount: number;
  categories: {
    category: string;
    plannedCents: number;
    paidCents: number;
    refundedCents: number;
    spentCents: number;
    reimbursedCents: number;
  }[];
  rows: {
    id: string;
    title: string;
    vendor: string;
    category: string;
    date: string;
    purpose: string;
    paymentMethod: string;
    planned: boolean;
    amountCents: number | null;
    plannedCents: number;
    paidCents: number;
    refundedCents: number;
    spentCents: number;
    reimbursedCents: number;
    balanceCents: number | null;
    missing: string[];
    transactions: ExpenseEntry[];
  }[];
};
