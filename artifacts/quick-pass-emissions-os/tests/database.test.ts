import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
// Explicit database gate: never run destructive fixtures against a real business database.
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  const u = new URL(process.env.TEST_DATABASE_URL!);
  if (!u.pathname.endsWith("_test")) throw new Error("Test database name must end in _test");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
const describeDatabase = enabled ? describe : describe.skip;
describeDatabase("PostgreSQL workflows", () => {
  let db: PrismaClient;
  let jobs: typeof import("../src/modules/tasks/jobs").runJobs;
  let change: typeof import("../src/modules/tasks/service").changeTask;
  let employeeId: string, ownerId: string, employeeUserId: string, taskId: string;
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    jobs = (await import("../src/modules/tasks/jobs")).runJobs;
    change = (await import("../src/modules/tasks/service")).changeTask;
    await db.$executeRawUnsafe(
      'TRUNCATE "User", "BusinessSetting", "Closure", "JobRun", "TaskTemplate" CASCADE',
    );
    const owner = await db.user.create({
      data: { name: "Test Owner", email: `${randomUUID()}@example.test`, role: "OWNER" },
    });
    ownerId = owner.id;
    const employee = await db.employee.create({
      data: { user: { create: { name: "Test Employee", email: `${randomUUID()}@example.test` } } },
    });
    employeeId = employee.id;
    employeeUserId = employee.userId;
    await db.businessSetting.create({
      data: { configured: true, operatingDays: [1, 2, 3, 4, 5, 6, 7] },
    });
    await db.taskTemplate.create({
      data: {
        title: "Test inspection",
        frequency: "DAILY",
        startDate: "2026-10-01",
        dueTime: "09:00",
        employeeId,
        priority: "CRITICAL",
      },
    });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  it("migrations support duplicate-safe concurrent generation and alerts", async () => {
    const now = new Date("2026-10-09T22:00:00Z");
    await Promise.all([jobs(now), jobs(now)]);
    const tasks = await db.taskInstance.findMany();
    expect(tasks).toHaveLength(23);
    expect(new Set(tasks.map((t) => `${t.templateId}:${t.occurrenceDate}`)).size).toBe(23);
    const task = tasks.find((t) => t.occurrenceDate === "2026-10-09")!;
    taskId = task.id;
    expect(await db.notification.count({ where: { taskId } })).toBe(1);
  });
  it("denies completion by another employee and leaves no completion log", async () => {
    await expect(
      change(
        {
          id: employeeUserId,
          name: "Intruder",
          role: "EMPLOYEE",
          employee: { id: "someone-else" },
        },
        { taskId, version: 0, status: "COMPLETED", note: "" },
      ),
    ).rejects.toThrow("denied");
    expect((await db.taskInstance.findUniqueOrThrow({ where: { id: taskId } })).status).toBe(
      "PENDING",
    );
    expect(await db.taskEvent.count({ where: { taskId } })).toBe(0);
  });
  it("persists completion, its audit and resolves alerts atomically", async () => {
    await change(
      { id: ownerId, name: "Test Owner", role: "OWNER" },
      { taskId, version: 0, status: "COMPLETED", note: "Inspection completed" },
    );
    const fresh = new PrismaClient();
    try {
      const task = await fresh.taskInstance.findUniqueOrThrow({ where: { id: taskId } });
      expect(task.status).toBe("COMPLETED");
      expect(task.completedAt).not.toBeNull();
      expect(await fresh.taskEvent.count({ where: { taskId } })).toBe(1);
      expect(await fresh.auditLog.count({ where: { entityId: taskId } })).toBe(1);
      expect(await fresh.notification.count({ where: { taskId, resolvedAt: null } })).toBe(0);
    } finally {
      await fresh.$disconnect();
    }
  });
  it("rejects stale versions and unauthorized reopening", async () => {
    await expect(
      change(
        { id: ownerId, name: "Owner", role: "OWNER" },
        { taskId, version: 0, status: "PENDING", note: "Approved correction" },
      ),
    ).rejects.toThrow("Refresh");
    await expect(
      change(
        { id: employeeUserId, name: "Employee", role: "EMPLOYEE", employee: { id: employeeId } },
        { taskId, version: 1, status: "PENDING", note: "" },
      ),
    ).rejects.toThrow("denied");
  });
  it("honors closures and skips inactive employees for new generation", async () => {
    await db.closure.create({ data: { date: "2026-10-24", reason: "Closed" } });
    await jobs(new Date("2026-10-10T22:00:00Z"));
    expect(await db.taskInstance.count({ where: { occurrenceDate: "2026-10-24" } })).toBe(0);
    await db.user.update({ where: { id: employeeUserId }, data: { active: false } });
    await jobs(new Date("2026-10-11T22:00:00Z"));
    expect(await db.taskInstance.count({ where: { occurrenceDate: "2026-10-25" } })).toBe(0);
  });
});
