import type {
  ExpenseFields,
  ExpenseView,
  ExpenseWorkspaceData,
  SpendingSnapshot,
} from "@/modules/personal/expense-types";

export class ExpenseApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export const isStale = (e: unknown) => e instanceof ExpenseApiError && e.status === 409;
export const errText = (e: unknown, fallback = "Something went wrong.") =>
  e instanceof Error ? e.message : fallback;

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  try {
    return (await res.json()) as T & { error?: string };
  } catch {
    return {} as T & { error?: string };
  }
}

export type CommandResult = {
  data: ExpenseWorkspaceData;
  expenseId?: string;
  duplicateOf?: string;
};

/** A delayed focus refresh must never replace a newer saved expense/version.
 * Attachments/history only append; preserve those when concurrent uploads finish out of order. */
export function mergeExpenseWorkspace(
  previous: ExpenseWorkspaceData,
  incoming: ExpenseWorkspaceData,
): ExpenseWorkspaceData {
  const records = new Map(previous.expenses.map((e) => [e.id, e]));
  for (const next of incoming.expenses) {
    const old = records.get(next.id);
    if (!old) {
      records.set(next.id, next);
      continue;
    }
    const latest = next.version >= old.version ? next : old;
    const attachments = [
      ...new Map([...old.attachments, ...next.attachments].map((a) => [a.id, a])).values(),
    ];
    const history = [...new Map([...old.history, ...next.history].map((h) => [h.id, h])).values()];
    records.set(next.id, {
      ...latest,
      attachments,
      history,
      missing: attachments.length ? latest.missing.filter((m) => m !== "Receipt") : latest.missing,
    });
  }
  return { ...incoming, expenses: [...records.values()] };
}

export async function expenseLoad(): Promise<ExpenseWorkspaceData> {
  let res: Response;
  try {
    res = await fetch("/api/personal/expenses", { credentials: "include", cache: "no-store" });
  } catch {
    throw new ExpenseApiError("Could not reach the server. Check your connection.", 0);
  }
  const json = await readJson<{ data?: ExpenseWorkspaceData }>(res);
  if (!res.ok || !json.data)
    throw new ExpenseApiError(json.error || `Request failed (${res.status}).`, res.status);
  return json.data;
}

export async function expenseCommand(body: Record<string, unknown>): Promise<CommandResult> {
  let res: Response;
  try {
    res = await fetch("/api/personal/expenses", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ExpenseApiError("Could not reach the server. Your entries are still here.", 0);
  }
  const json = await readJson<Partial<CommandResult>>(res);
  if (!res.ok || !json.data)
    throw new ExpenseApiError(
      json.error ||
        (res.status === 409
          ? "This expense changed somewhere else. Reload it, then try again."
          : `Request failed (${res.status}).`),
      res.status,
    );
  return json as CommandResult;
}

export async function fetchReport(start: string, end: string): Promise<SpendingSnapshot> {
  let res: Response;
  try {
    res = await fetch(
      `/api/personal/expenses/report?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      { credentials: "include", cache: "no-store" },
    );
  } catch {
    throw new ExpenseApiError("Could not reach the server.", 0);
  }
  const json = await readJson<{ report?: SpendingSnapshot }>(res);
  if (!res.ok || !json.report)
    throw new ExpenseApiError(json.error || `Report failed (${res.status}).`, res.status);
  return json.report;
}
export const csvUrl = (start: string, end: string) =>
  `/api/personal/expenses/report?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&format=csv`;

async function attachPost<T>(body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/personal/expenses/attachments", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ExpenseApiError("Could not reach the server.", 0);
  }
  const json = await readJson<T>(res);
  if (!res.ok)
    throw new ExpenseApiError(json.error || `Upload failed (${res.status}).`, res.status);
  return json;
}

export const RECEIPT_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
export const RECEIPT_MAX = 10 * 1024 * 1024;

/** prepare -> direct PUT (with progress) -> complete */
export async function uploadReceipt(
  expenseId: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<ExpenseWorkspaceData | null> {
  const prep = await attachPost<{ attachmentId?: string; uploadURL?: string }>({
    op: "prepare",
    expenseId,
    filename: file.name,
    mimeType: file.type,
    byteSize: file.size,
  });
  if (!prep.attachmentId || !prep.uploadURL)
    throw new ExpenseApiError("The server did not return an upload address.", 500);
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", prep.uploadURL as string);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ExpenseApiError(`Storage rejected the file (${xhr.status}).`, xhr.status));
    xhr.onerror = () => reject(new ExpenseApiError("Upload interrupted. Try again.", 0));
    xhr.send(file);
  });
  onProgress(100);
  const done = await attachPost<{ data?: ExpenseWorkspaceData }>({
    op: "complete",
    id: prep.attachmentId,
  });
  return done.data && "expenses" in done.data ? done.data : null;
}

// ---------- formatting ----------
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const money = (c: number | null | undefined) => (c == null ? "—" : usd.format(c / 100));
export const centsToInput = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2));
/** "" -> null, invalid -> NaN */
export function parseCents(s: string): number | null {
  const t = s.replace(/[$,\s]/g, "");
  if (!t) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return NaN;
  return Math.round(Number(t) * 100);
}
export const fmtDay = (d: string | null | undefined) => {
  if (!d) return "No date";
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};
export const fmtBytes = (b: number) =>
  b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`;

export const STATUS_TEXT: Record<ExpenseView["totals"]["status"], string> = {
  PLANNED: "Planned",
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Part-paid",
  PAID: "Paid",
};
export const KIND_TEXT: Record<string, string> = {
  PAYMENT: "Payment",
  REFUND: "Refund",
  REIMBURSEMENT: "Reimbursement paid",
  REIMBURSEMENT_RETURN: "Reimbursement returned",
};
export const MISSING_TEXT: Record<string, string> = {
  amountCents: "amount",
  amount: "amount",
  vendor: "vendor",
  date: "date",
  category: "category",
  purpose: "purpose",
  paymentMethod: "payment method",
  receipt: "receipt",
  attachment: "receipt",
};
export const missingLabel = (m: string) =>
  MISSING_TEXT[m] ?? m.replace(/([A-Z])/g, " $1").toLowerCase();

export const fieldsOf = (e: ExpenseView): ExpenseFields => ({
  title: e.title,
  amountCents: e.amountCents,
  vendor: e.vendor,
  date: e.date ? e.date.slice(0, 10) : "",
  category: e.category,
  purpose: e.purpose,
  paymentMethod: e.paymentMethod,
  planned: e.planned,
});

export const rid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16),
      );

export const monthRange = (today: string) => {
  const [y, m] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}` };
};
export const yearRange = (today: string) => {
  const y = today.slice(0, 4);
  return { start: `${y}-01-01`, end: `${y}-12-31` };
};
