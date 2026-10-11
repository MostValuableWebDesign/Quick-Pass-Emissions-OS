import { createHash } from "node:crypto";
import { type Role, type ReminderPolicy } from "@prisma/client";
import { businessDate } from "@/lib/time";
import { receivable, sumCents } from "../finance/rules";
import { type Tx } from "../phase2";
import { reminderStage } from "./rules";
export type Source = {
  kind: string;
  id: string;
  dueDate: string;
  dueAt?: string;
  title: string;
  href: string;
  employeeId: string | null;
  fingerprint: string;
};
export function fingerprint(values: unknown) {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}
export async function reminderSources(tx: Tx, today: string): Promise<Source[]> {
  const [maintenance, employees, invoices, charges] = await Promise.all([
    tx.maintenanceTicket.findMany({
      where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
      orderBy: { id: "asc" },
    }),
    tx.employee.findMany({
      where: { user: { active: true }, certificationExpires: { not: null } },
      select: { id: true, certificationExpires: true, user: { select: { name: true } } },
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
  ]);
  return [
    ...maintenance.map((t) => ({
      kind: "MAINTENANCE",
      id: t.id,
      dueDate: t.targetDate,
      dueAt: t.dueAt.toISOString(),
      title: t.title,
      href: `/maintenance/${t.id}`,
      employeeId: t.assignedId,
      fingerprint: fingerprint([t.id, t.targetDate, t.dueAt.toISOString(), t.assignedId]),
    })),
    ...employees.map((e) => ({
      kind: "CERTIFICATION",
      id: e.id,
      dueDate: e.certificationExpires!,
      title: `Certification expiration: ${e.user.name}`,
      href: `/employees/${e.id}`,
      employeeId: e.id,
      fingerprint: fingerprint([e.id, e.certificationExpires]),
    })),
    ...invoices.flatMap((i) => {
      const r = receivable(i, i.payments, today);
      return r.remainingCents > 0
        ? [
            {
              kind: "DEALER",
              id: i.id,
              dueDate: i.dueDate,
              title: `Unpaid approved invoice: ${i.number}`,
              href: `/invoices/${i.id}`,
              employeeId: null,
              // Payment/reversal identities prevent reopening an acknowledged old alert after reversal.
              fingerprint: fingerprint([
                i.id,
                i.dueDate,
                r.remainingCents,
                i.payments
                  .filter((p) => p.date <= today)
                  .map((p) => p.id)
                  .sort(),
              ]),
            },
          ]
        : [];
    }),
    ...charges.flatMap((c) => {
      const balance =
        c.amountCents -
        sumCents(c.payments.filter((p) => p.date <= today).map((p) => p.amountCents));
      return balance > 0
        ? [
            {
              kind: "RENTAL",
              id: c.id,
              dueDate: c.dueDate,
              title: `Unpaid rental charge: ${c.month}`,
              href: `/rentals/${c.agreementId}`,
              employeeId: null,
              fingerprint: fingerprint([
                c.id,
                c.dueDate,
                balance,
                c.payments
                  .filter((p) => p.date <= today)
                  .map((p) => p.id)
                  .sort(),
              ]),
            },
          ]
        : [];
    }),
  ];
}
export function allowedRecipient(
  _source: Source,
  user: { role: Role; employee: { id: string } | null },
) {
  return user.role === "OWNER" || user.role === "ADMIN";
}
export function applicable(
  policy: ReminderPolicy,
  source: Source,
  userId: string,
  today: string,
  now?: Date,
) {
  if (!policy.active) return null;
  let stage = reminderStage(source.dueDate, today, policy.advanceDays, policy.escalationDays);
  // Maintenance has an authoritative instant. Other sources expire at the end of their local due date.
  if (source.dueAt && now && new Date(source.dueAt) < now && source.dueDate === today)
    stage = policy.escalationDays === 0 ? "ESCALATED" : "OVERDUE";
  if (!stage) return null;
  const ids =
    stage === "ESCALATED"
      ? [...policy.recipients, ...policy.escalationRecipients]
      : policy.recipients;
  return ids.includes(userId) ? stage : null;
}
export async function currentPolicies(tx: Tx) {
  const all = await tx.reminderPolicy.findMany({ orderBy: { revision: "desc" } });
  return all.filter((p, i) => all.findIndex((other) => other.kind === p.kind) === i);
}
export async function reconcileReminders(tx: Tx, now: Date) {
  const today = businessDate(now),
    sources = await reminderSources(tx, today),
    policies = await currentPolicies(tx);
  const users = await tx.user.findMany({
    where: { active: true },
    include: { employee: { select: { id: true } } },
  });
  const live = new Set<string>();
  for (const source of sources) {
    const policy = policies.find((p) => p.kind === source.kind);
    if (!policy) continue;
    for (const user of users) {
      const stage = applicable(policy, source, user.id, today, now);
      if (!stage || !allowedRecipient(source, user)) continue;
      const base = fingerprint([
        policy.id,
        source.kind,
        source.id,
        source.fingerprint,
        stage,
        user.id,
      ]);
      const existing = await tx.actionReminder.findFirst({
        where: { key: { startsWith: `${base}:` }, resolvedAt: null },
      });
      // A condition returning after resolution gets a new unacknowledged lifecycle.
      // Creation/reconciliation share the advisory lock; simultaneous workers cannot overlap it.
      const generation = existing
        ? 0
        : await tx.actionReminder.count({ where: { key: { startsWith: `${base}:` } } });
      const key = existing?.key ?? `${base}:${generation}`;
      live.add(key);
      const reminder =
        existing ??
        (await tx.actionReminder.create({
          data: {
            key,
            kind: source.kind,
            sourceId: source.id,
            fingerprint: source.fingerprint,
            stage,
            policyId: policy.id,
            userId: user.id,
            title: source.title,
            href: source.href,
            dueDate: source.dueDate,
          },
        }));
      // Atomic in-app delivery, no external provider.
      await tx.automationDelivery.upsert({
        where: { key: `reminder:${key}` },
        create: {
          key: `reminder:${key}`,
          userId: user.id,
          reminderId: reminder.id,
        },
        update: {},
      });
    }
  }
  const open = await tx.actionReminder.findMany({ where: { resolvedAt: null } });
  for (const reminder of open)
    if (!live.has(reminder.key)) {
      const source = sources.find((s) => s.id === reminder.sourceId && s.kind === reminder.kind);
      await tx.actionReminder.update({
        where: { id: reminder.id },
        data: {
          resolvedAt: now,
          resolution: source ? "SUPERSEDED" : "SOURCE_SATISFIED_OR_REMOVED",
        },
      });
      await tx.auditLog.create({
        data: {
          action: "REMINDER_RESOLVED",
          entityId: reminder.id,
          details: {
            kind: reminder.kind,
            sourceId: reminder.sourceId,
            resolution: source ? "SUPERSEDED" : "SOURCE_SATISFIED_OR_REMOVED",
          },
        },
      });
      await tx.automationDelivery.updateMany({
        where: { reminderId: reminder.id },
        data: {
          status: "REVOKED",
          failure: "Source, recipient, stage or policy no longer matches.",
        },
      });
    }
  // The configured Phase 5 maintenance policy replaces legacy maintenance alerts.
  if (policies.find((p) => p.kind === "MAINTENANCE")?.active)
    await tx.notification.updateMany({
      where: { key: { startsWith: "maintenance:" }, resolvedAt: null },
      data: { resolvedAt: now },
    });
  return live.size;
}
export async function visibleReminders(
  tx: Tx,
  user: { id: string; role: Role; employee: { id: string } | null },
  now = new Date(),
) {
  const sources = await reminderSources(tx, businessDate(now)),
    policies = await currentPolicies(tx);
  const records = await tx.actionReminder.findMany({
    where: { userId: user.id, resolvedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return records.filter((r) => {
    const s = sources.find((s) => s.id === r.sourceId && s.kind === r.kind),
      p = policies.find((p) => p.id === r.policyId);
    return (
      !!s &&
      !!p &&
      s.fingerprint === r.fingerprint &&
      allowedRecipient(s, user) &&
      applicable(p, s, user.id, businessDate(now), now) === r.stage
    );
  });
}
