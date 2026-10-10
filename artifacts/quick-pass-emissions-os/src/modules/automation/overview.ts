import { addDays, businessDate } from "@/lib/time";
import { receivable, sumCents } from "../finance/rules";
import { type Tx } from "../phase2";
import { forecasts } from "./forecasts";
export async function overview(tx: Tx, now = new Date()) {
  const today = businessDate(now);
  const [tasks, maintenance, downtime, employees, payroll, invoices, rentals, inventory] =
    await Promise.all([
      tx.taskInstance.findMany({
        where: {
          OR: [
            { status: { notIn: ["COMPLETED", "CANCELLED"] }, dueAt: { lt: now } },
            { status: "COMPLETED", reviewRequired: true, reviewedAt: null },
          ],
        },
        orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      }),
      tx.maintenanceTicket.findMany({
        where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
        orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      }),
      tx.downtimeEvent.findMany({ where: { endedAt: null }, orderBy: { id: "asc" } }),
      tx.employee.findMany({
        where: { user: { active: true }, certificationExpires: { not: null } },
        select: { id: true, certificationExpires: true, user: { select: { name: true } } },
        orderBy: { id: "asc" },
      }),
      tx.payrollDraft.findMany({
        where: { status: "DRAFT" },
        select: { id: true, periodId: true },
        orderBy: { id: "asc" },
      }),
      tx.dealerInvoice.findMany({
        where: { approvedAt: { not: null }, voidDate: null, issueDate: { lte: today } },
        include: { payments: true },
        orderBy: { id: "asc" },
      }),
      tx.rentalCharge.findMany({
        where: { voidedAt: null },
        include: { payments: true },
        orderBy: { id: "asc" },
      }),
      forecasts(tx, today),
    ]);
  const certPolicy = await tx.reminderPolicy.findFirst({
    where: { kind: "CERTIFICATION" },
    orderBy: { revision: "desc" },
  });
  const maintenancePolicy = await tx.reminderPolicy.findFirst({
    where: { kind: "MAINTENANCE" },
    orderBy: { revision: "desc" },
  });
  const items = [
    ...tasks.map((t) => ({
      kind: t.status === "COMPLETED" ? "Pending responsibility review" : "Overdue responsibility",
      title: t.title,
      href: `/tasks/${t.id}`,
      date: t.dueAt.toISOString(),
      amountCents: null,
    })),
    ...maintenance
      .filter(
        (t) =>
          t.targetDate <= addDays(today, maintenancePolicy?.advanceDays ?? 0) ||
          t.status === "AWAITING_REVIEW",
      )
      .map((t) => ({
        kind:
          t.status === "AWAITING_REVIEW"
            ? "Pending maintenance review"
            : t.dueAt < now
              ? "Overdue maintenance"
              : "Upcoming maintenance",
        title: t.title,
        href: `/maintenance/${t.id}`,
        date: t.targetDate,
        amountCents: null,
      })),
    ...downtime.map((d) => ({
      kind: "Unresolved downtime",
      title: d.reason,
      href: d.bayId ? "/carwash" : "/equipment",
      date: d.startedAt.toISOString(),
      amountCents: null,
    })),
    ...employees
      .filter((e) => e.certificationExpires! <= addDays(today, certPolicy?.advanceDays ?? 0))
      .map((e) => ({
        kind: "Certification expiration",
        title: e.user.name,
        href: `/employees/${e.id}`,
        date: e.certificationExpires!,
        amountCents: null,
      })),
    ...inventory
      .filter(
        (i) => i.low || ["UNKNOWN_STOCK", "INSUFFICIENT_HISTORY", "UNCONFIGURED"].includes(i.state),
      )
      .map((i) => ({
        kind: "Inventory warning",
        title: `${i.name}: ${i.state}${i.low ? " / low recorded stock" : ""}`,
        href: i.key === "certificates" ? "/certificates" : "/chemicals",
        date: today,
        amountCents: null,
      })),
    ...payroll.map((d) => ({
      kind: "Payroll awaiting review",
      title: "Gross draft awaiting independent review",
      href: `/payroll/${d.periodId}`,
      date: today,
      amountCents: null,
    })),
    ...invoices.flatMap((i) => {
      const r = receivable(i, i.payments, today);
      return r.remainingCents > 0
        ? [
            {
              kind: "Dealership receivable",
              title: i.number,
              href: `/invoices/${i.id}`,
              date: i.dueDate,
              amountCents: r.remainingCents,
            },
          ]
        : [];
    }),
    ...rentals.flatMap((c) => {
      const balance =
        c.amountCents -
        sumCents(c.payments.filter((p) => p.date <= today).map((p) => p.amountCents));
      return balance > 0
        ? [
            {
              kind: "Rental balance",
              title: c.month,
              href: `/rentals/${c.agreementId}`,
              date: c.dueDate,
              amountCents: balance,
            },
          ]
        : [];
    }),
  ];
  return {
    generatedAt: now.toISOString(),
    today,
    items,
    inventory,
    limits:
      "Live exception state at generation, not complete books. Upcoming windows use the owner's reminder policies; without a policy only due/expired records appear. Financial amounts are recorded receivables, not bank balances.",
  };
}
