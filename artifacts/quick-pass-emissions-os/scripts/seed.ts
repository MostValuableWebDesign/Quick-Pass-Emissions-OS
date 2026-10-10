import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
import { businessDate, addDays, dueInstant } from "../src/lib/time";
import { runJobs } from "../src/modules/tasks/jobs";
async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ALLOW_DEMO_SEED !== "true" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !url.pathname.endsWith("_demo")
  )
    throw new Error(
      "Demo seed requires a local database ending in _demo and explicit ALLOW_DEMO_SEED=true.",
    );
  const supplied = process.env.DEMO_PASSWORD;
  if (!supplied || supplied.length < 12 || supplied.length > 128)
    throw new Error("Provide DEMO_PASSWORD with 12–128 characters.");
  if (await db.user.count())
    throw new Error(
      "Demo seed requires an empty user database; it never overwrites existing records.",
    );
  const password = await hashPassword(supplied);
  const today = businessDate();
  await db.$transaction(async (tx) => {
    const people = [
      { name: "Demo Owner", email: "owner@example.test", role: "OWNER" as const },
      { name: "Demo Manager", email: "manager@example.test", role: "ADMIN" as const },
      { name: "Demo Al", email: "al@example.test", role: "EMPLOYEE" as const },
      { name: "Demo John", email: "john@example.test", role: "EMPLOYEE" as const },
      { name: "Demo Bookkeeper", email: "bookkeeper@example.test", role: "BOOKKEEPER" as const },
    ];
    const employees = [];
    for (const p of people) {
      const user = await tx.user.create({
        data: {
          ...p,
          employee: {
            create: {
              demo: true,
              duties: "Demonstration responsibilities only",
              workAreas: "Demo operations",
            },
          },
        },
        include: { employee: true },
      });
      await tx.account.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password,
        },
      });
      employees.push(user.employee!);
    }
    await tx.businessSetting.create({
      data: { operatingDays: [1, 2, 3, 4, 5, 6], configured: true },
    });
    const duties = [
      "Inspect emissions analyzer",
      "Verify tag renewal kiosk status",
      "Inspect carwash bays",
      "Check chemical inventory",
      "Verify certificate stock",
      "Complete closing operational report",
    ];
    for (let i = 0; i < duties.length; i++) {
      const t = await tx.taskTemplate.create({
        data: {
          title: duties[i],
          description:
            "DEMO: inspect the assigned work area, record any issue in a note, and mark blocked if a manager needs to intervene.",
          frequency: "DAILY",
          startDate: addDays(today, -1),
          dueTime: i === 5 ? "18:00" : "09:00",
          employeeId: employees[2 + (i % 2)].id,
          priority: i === 0 ? "CRITICAL" : "NORMAL",
          reviewRequired: i === 0,
          demo: true,
        },
      });
      if (i < 3) {
        const task = await tx.taskInstance.create({
          data: {
            templateId: t.id,
            occurrenceDate: today,
            title: t.title,
            description: t.description,
            employeeId: t.employeeId,
            priority: t.priority,
            dueAt: dueInstant(today, t.dueTime),
            reviewRequired: t.reviewRequired,
            escalationHours: 0,
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });
        await tx.taskEvent.create({
          data: {
            taskId: task.id,
            actorId: employees[2 + (i % 2)].userId,
            actorName: people[2 + (i % 2)].name,
            action: "COMPLETED",
            note: "Demonstration completion.",
          },
        });
      }
    }
    for (let d = 0; d < 7; d++)
      for (const e of employees.slice(1, 4))
        await tx.employeeSchedule.create({
          data: {
            employeeId: e.id,
            date: addDays(today, d),
            startTime: "08:00",
            endTime: "17:00",
            duties: "Demonstration shift",
          },
        });
    await tx.auditLog.create({
      data: {
        action: "DEMO_SEEDED",
        entityId: "demo",
        details: { warning: "All records are demonstration data" },
      },
    });
  });
  await runJobs();
  console.log(
    "Local demo created. Sign in as owner@example.test using your supplied DEMO_PASSWORD. Other demo roles are documented in README.",
  );
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Demo seed failed");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
