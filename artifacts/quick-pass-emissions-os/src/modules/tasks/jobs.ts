import { db } from "../../lib/db";
import { businessDate, addDays, dueInstant } from "../../lib/time";
import { occursOn } from "./recurrence";
export async function runJobs(now = new Date()) {
  const run = await db.jobRun.create({ data: {} });
  try {
    const generated = await db.$transaction(
      async (tx) => {
        // One generator at a time across web/CLI workers; uniqueness remains a second guard.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183501)`;
        const settings = await tx.businessSetting.findUnique({ where: { id: "business" } });
        if (!settings?.configured) return 0;
        const previous = await tx.jobRun.findFirst({
          where: { status: "SUCCESS", completedAt: { not: null } },
          orderBy: { completedAt: "desc" },
        });
        const today = businessDate(now);
        const from = previous?.completedAt
          ? addDays(businessDate(previous.completedAt), -1)
          : addDays(today, -31);
        const until = addDays(today, 14);
        const templates = await tx.taskTemplate.findMany({
          where: { active: true, employee: { user: { active: true } } },
        });
        const closed = new Set((await tx.closure.findMany()).map((c) => c.date));
        let count = 0;
        for (const t of templates) {
          const templateFrom =
            !previous?.completedAt || t.createdAt > previous.completedAt
              ? addDays(today, -31)
              : from;
          for (
            let day = templateFrom > t.startDate ? templateFrom : t.startDate;
            day <= until;
            day = addDays(day, 1)
          ) {
            if (!occursOn(t, day, settings.operatingDays, closed)) continue;
            const result = await tx.taskInstance.createMany({
              data: [
                {
                  templateId: t.id,
                  occurrenceDate: day,
                  title: t.title,
                  description: t.description,
                  employeeId: t.employeeId,
                  dueAt: dueInstant(day, t.dueTime),
                  priority: t.priority,
                  reviewRequired: t.reviewRequired,
                  escalationHours: t.escalationHours,
                },
              ],
              skipDuplicates: true,
            });
            count += result.count;
          }
        }
        const late = await tx.taskInstance.findMany({
          where: { status: { notIn: ["COMPLETED", "CANCELLED"] }, dueAt: { lt: now } },
          include: { employee: true },
        });
        const managers = await tx.user.findMany({
          where: { active: true, role: { in: ["OWNER", "ADMIN"] } },
        });
        for (const task of late) {
          const users = new Set([task.employee.userId]);
          if (now.getTime() >= task.dueAt.getTime() + task.escalationHours * 3600000)
            managers.forEach((u) => users.add(u.id));
          for (const userId of users)
            await tx.notification.upsert({
              where: { key: `overdue:${task.id}:${userId}` },
              create: {
                key: `overdue:${task.id}:${userId}`,
                userId,
                taskId: task.id,
                title: `Overdue: ${task.title}`,
              },
              update: { resolvedAt: null },
            });
        }
        await tx.notification.updateMany({
          where: {
            resolvedAt: null,
            task: { OR: [{ status: { in: ["COMPLETED", "CANCELLED"] } }, { dueAt: { gte: now } }] },
          },
          data: { resolvedAt: now },
        });
        await tx.jobRun.update({
          where: { id: run.id },
          data: { status: "SUCCESS", completedAt: now, generated: count },
        });
        return count;
      },
      { timeout: 60000 },
    );
    // Unconfigured jobs are observable without claiming to have generated duties.
    await db.jobRun.updateMany({
      where: { id: run.id, status: "RUNNING" },
      data: { status: "UNCONFIGURED", completedAt: now },
    });
    return { generated, runId: run.id };
  } catch (error) {
    await db.jobRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        message: "Job failed; inspect database connectivity and application logs.",
      },
    });
    throw error;
  }
}
