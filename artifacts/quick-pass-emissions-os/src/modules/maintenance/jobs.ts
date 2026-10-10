import { Temporal } from "@js-temporal/polyfill";
import { addDays, businessDate, dueInstant } from "../../lib/time";
import { audit, type Tx } from "../phase3";
// Called inside the existing observable jobs transaction. Lock order: jobs, then Phase 3.
export async function generateMaintenance(
  tx: Tx,
  now: Date,
  operatingDays: number[],
  closed: Set<string>,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183504)`;
  const today = businessDate(now),
    until = addDays(today, 14);
  const plans = await tx.maintenancePlan.findMany({
    where: {
      active: true,
      employee: { user: { active: true, role: { not: "BOOKKEEPER" } } },
      OR: [{ equipmentId: null }, { equipment: { active: true } }],
    },
  });
  let generated = 0;
  for (const plan of plans) {
    let day = plan.nextDueDate,
      examined = 0;
    // Bounded catch-up: repeated runs continue from persisted nextDueDate without losing old dates.
    while (day <= until && examined++ < 62) {
      if (operatingDays.includes(Temporal.PlainDate.from(day).dayOfWeek) && !closed.has(day)) {
        const result = await tx.maintenanceTicket.createMany({
          data: [
            {
              planId: plan.id,
              occurrenceDate: day,
              bayId: plan.bayId,
              equipmentId: plan.equipmentId,
              title: plan.title,
              description: plan.instructions,
              priority: plan.priority,
              assignedId: plan.employeeId,
              targetDate: day,
              dueAt: dueInstant(day, plan.dueTime),
              reportedBy: plan.createdBy,
            },
          ],
          skipDuplicates: true,
        });
        if (result.count) {
          const ticket = await tx.maintenanceTicket.findUniqueOrThrow({
            where: { planId_occurrenceDate: { planId: plan.id, occurrenceDate: day } },
          });
          await audit(tx, plan.createdBy, "MAINTENANCE_GENERATED", ticket.id, {
            planId: plan.id,
            date: day,
          });
          generated++;
        }
      }
      day = addDays(day, plan.intervalDays);
    }
    if (day !== plan.nextDueDate)
      await tx.maintenancePlan.update({
        where: { id: plan.id },
        data: { nextDueDate: day, version: { increment: 1 } },
      });
  }
  const managers = await tx.user.findMany({
    where: { active: true, role: { in: ["OWNER", "ADMIN"] } },
  });
  const late = await tx.maintenanceTicket.findMany({
    where: { status: { notIn: ["COMPLETED", "CANCELLED"] }, dueAt: { lt: now } },
    include: { assigned: { include: { user: true } } },
  });
  const liveKeys: string[] = [];
  const automationPolicy = await tx.reminderPolicy.findFirst({
    where: { kind: "MAINTENANCE" },
    orderBy: { revision: "desc" },
  });
  for (const ticket of late) {
    if (automationPolicy?.active) continue; // Phase 5 replaces, rather than duplicates, these alerts.
    const recipients = new Set(managers.map((u) => u.id));
    for (const userId of recipients) {
      const key = `maintenance:${ticket.id}:${userId}`;
      liveKeys.push(key);
      await tx.notification.upsert({
        where: { key },
        create: {
          key,
          userId,
          maintenanceId: ticket.id,
          title: `Maintenance overdue: ${ticket.title}`,
        },
        update: { resolvedAt: null },
      });
    }
  }
  await tx.notification.updateMany({
    where: { key: { startsWith: "maintenance:", notIn: liveKeys }, resolvedAt: null },
    data: { resolvedAt: now },
  });
  return generated;
}
