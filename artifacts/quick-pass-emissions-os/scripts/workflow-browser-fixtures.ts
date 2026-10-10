import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { businessDate, dueInstant, addDays } from "../src/lib/time";

// Synthetic accounts and work records, only in the runner-owned disposable DB.
export async function workflowBrowserFixtures(db: PrismaClient, password: string) {
  await db.businessSetting.upsert({
    where: { id: "business" },
    create: { id: "business", configured: true, operatingDays: [1, 2, 3, 4, 5, 6, 7] },
    update: {},
  });
  const users = [];
  for (const [role, name] of [
    ["WORKER", "Demo Al"],
    ["PEER", "Demo John"],
    ["PREPARER", "Preparation Manager"],
  ]) {
    const email = `workflow-${randomUUID()}@example.test`;
    const user = await db.user.create({
      data: {
        name,
        email,
        role: role === "PREPARER" ? "ADMIN" : "EMPLOYEE",
        emailVerified: true,
        employee: {
          create: {
            demo: true,
            ...(role === "WORKER" ? { certificationExpires: addDays(businessDate(), -1) } : {}),
          },
        },
      },
      include: { employee: true },
    });
    if (role === "PREPARER")
      await db.account.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: await hashPassword(password),
        },
      });
    users.push({ role, email });
    if (role === "PEER") {
      const date = businessDate();
      const template = await db.taskTemplate.create({
        data: {
          title: "Inspect emissions analyzer",
          frequency: "ONCE",
          startDate: date,
          dueTime: "09:00",
          employeeId: user.employee!.id,
        },
      });
      await db.taskInstance.create({
        data: {
          templateId: template.id,
          occurrenceDate: date,
          title: template.title,
          description: "Synthetic completed duty",
          employeeId: user.employee!.id,
          dueAt: dueInstant(date, "09:00"),
          priority: "NORMAL",
          reviewRequired: false,
          escalationHours: 0,
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
    }
  }
  await db.automationJob.create({
    data: {
      key: "workflow-terminal-failure",
      kind: "REMINDERS",
      status: "FAILED",
      attempts: 4,
      failure: "Synthetic terminal failure for owner retry",
      dueAt: new Date(),
      nextAttemptAt: new Date(),
    },
  });
  return users;
}
