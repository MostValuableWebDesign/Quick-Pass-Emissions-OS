export const INBOX_CATEGORIES = [
  "Uncategorized",
  "Dealerships & invoices",
  "Station & certificates",
  "Service & repairs",
  "Employees & payroll",
  "Supplies & orders",
  "Customer",
  "Marketing",
  "Account & security",
  "Other",
] as const;

export const INBOX_IMPORTANCE = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type InboxImportance = (typeof INBOX_IMPORTANCE)[number];
