import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { dateString } from "@/lib/validation";
import { requireRule } from "../phase4";
export const cents = z.coerce.number().int().min(0).max(2000000000);
export const positiveCents = cents.refine((v) => v > 0, "Enter a positive amount in cents.");
export function requiredInteger(min: number, max: number) {
  return z.preprocess(
    (v) => (v == null || (typeof v === "string" && v.trim() === "") ? NaN : v),
    z.coerce.number().int().min(min).max(max),
  );
}
export function bounded(n: bigint) {
  requireRule(n >= 0n && n <= 2000000000n, "Amount exceeds supported bounds.");
  return Number(n);
}
export function invoiceTotals(lines: { quantity: number; unitCents: number }[], taxBps: number) {
  requireRule(
    lines.length > 0 && lines.length <= 100,
    "Choose between 1 and 100 completed services.",
  );
  requireRule(
    Number.isInteger(taxBps) && taxBps >= 0 && taxBps <= 10000,
    "Invalid tax basis points.",
  );
  const amounts = lines.map((l) => {
    requireRule(
      Number.isInteger(l.quantity) &&
        l.quantity > 0 &&
        l.quantity <= 100000 &&
        Number.isInteger(l.unitCents) &&
        l.unitCents > 0,
      "Invalid service quantity or rate.",
    );
    return bounded(BigInt(l.quantity) * BigInt(l.unitCents));
  });
  const subtotalCents = bounded(amounts.reduce((s, n) => s + BigInt(n), 0n));
  const taxCents = bounded((BigInt(subtotalCents) * BigInt(taxBps) + 5000n) / 10000n);
  return {
    amounts,
    subtotalCents,
    taxCents,
    totalCents: bounded(BigInt(subtotalCents) + BigInt(taxCents)),
  };
}
export function sumCents(values: number[]) {
  const n = values.reduce((s, v) => s + BigInt(v), 0n);
  requireRule(
    n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER),
    "Report exceeds supported bounds.",
  );
  return Number(n);
}
export function receivable(
  invoice: {
    state: string;
    totalCents: number;
    dueDate: string;
    issueDate: string;
    voidDate: string | null;
  },
  payments: { amountCents: number; date: string }[],
  asOf: string,
) {
  const paidCents = sumCents(payments.filter((p) => p.date <= asOf).map((p) => p.amountCents));
  const recognized =
    invoice.state !== "DRAFT" &&
    invoice.issueDate <= asOf &&
    !(invoice.voidDate && invoice.voidDate <= asOf);
  const remainingCents = recognized ? invoice.totalCents - paidCents : 0;
  const days =
    recognized && remainingCents > 0
      ? Math.max(
          0,
          Temporal.PlainDate.from(invoice.dueDate).until(Temporal.PlainDate.from(asOf)).days,
        )
      : 0;
  const bucket =
    days === 0
      ? "Current"
      : days <= 30
        ? "1–30 days"
        : days <= 60
          ? "31–60 days"
          : days <= 90
            ? "61–90 days"
            : "91+ days";
  const status =
    invoice.voidDate && invoice.voidDate <= asOf
      ? "Voided"
      : invoice.state === "DRAFT"
        ? "Draft"
        : !recognized
          ? "Not issued"
          : remainingCents === 0
            ? "Paid"
            : days > 0
              ? "Overdue"
              : paidCents > 0
                ? "Partially paid"
                : invoice.state === "SENT"
                  ? "Sent"
                  : "Approved";
  return { recognized, paidCents, remainingCents, days, bucket, status };
}
export const reportRange = z.object({ start: dateString, end: dateString }).refine((v) => {
  try {
    return (
      v.end >= v.start &&
      Temporal.PlainDate.from(v.start).until(Temporal.PlainDate.from(v.end)).days <= 366
    );
  } catch {
    return false;
  }
}, "Choose an ordered range of at most 367 days.");
export function csv(rows: (string | number | null)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((v) => {
            const s = v === null ? "" : String(v);
            // Quoting alone does not prevent spreadsheet formula execution.
            const safe = typeof v === "string" && /^[\s]*[=+\-@]/.test(s) ? "'" + s : s;
            return '"' + safe.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n") +
    "\r\n"
  );
}
