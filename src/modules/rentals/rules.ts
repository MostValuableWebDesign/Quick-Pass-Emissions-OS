import { Temporal } from "@js-temporal/polyfill";
export function rentalMonth(month: string, dueDay: number) {
  const start = Temporal.PlainDate.from(`${month}-01`);
  return {
    start: start.toString(),
    end: start.with({ day: start.daysInMonth }).toString(),
    dueDate: start.with({ day: Math.min(dueDay, start.daysInMonth) }).toString(),
  };
}
export function paymentSummary(
  amountCents: number,
  payments: { amountCents: number }[],
  dueDate: string,
  today: string,
  voided = false,
) {
  const paid = payments.reduce((s, p) => s + BigInt(p.amountCents), 0n);
  const remaining = BigInt(amountCents) - paid;
  return {
    paidCents: Number(paid),
    remainingCents: Number(remaining),
    status: voided
      ? "Voided"
      : remaining === 0n
        ? "Paid"
        : dueDate < today
          ? "Overdue"
          : paid > 0n
            ? "Partially paid"
            : "Unpaid",
  };
}
