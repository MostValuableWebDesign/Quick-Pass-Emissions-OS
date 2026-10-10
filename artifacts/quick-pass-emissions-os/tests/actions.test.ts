import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: { getSession: async () => (session.userId ? { user: { id: session.userId } } : null) },
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Use an isolated _test database");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
const suite = enabled ? describe : describe.skip;
function form(data: Record<string, string>) {
  const f = new FormData();
  Object.entries(data).forEach(([k, v]) => f.set(k, v));
  return f;
}
suite("Server action authorization with PostgreSQL", () => {
  let db: PrismaClient;
  let actions: typeof import("../src/app/actions");
  let ownerId: string;
  let adminId: string;
  let employeeId: string;
  let employeeProfileId: string;
  const employeeData = {
    name: "Created employee",
    email: "created@example.test",
    role: "EMPLOYEE",
    phone: "",
    startDate: "",
    duties: "",
    workAreas: "",
    managerNotes: "Private",
    certificationExpires: "",
  };
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    actions = await import("../src/app/actions");
    await db.$executeRawUnsafe(
      'TRUNCATE "User", "BusinessSetting", "Closure", "JobRun", "TaskTemplate" CASCADE',
    );
    const owner = await db.user.create({
      data: { name: "Owner", email: `${randomUUID()}@example.test`, role: "OWNER" },
    });
    ownerId = owner.id;
    const admin = await db.user.create({
      data: { name: "Manager", email: `${randomUUID()}@example.test`, role: "ADMIN" },
    });
    adminId = admin.id;
    const employee = await db.user.create({
      data: {
        name: "Employee",
        email: `${randomUUID()}@example.test`,
        role: "EMPLOYEE",
        employee: { create: {} },
      },
      include: { employee: true },
    });
    employeeId = employee.id;
    employeeProfileId = employee.employee!.id;
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  it("denies an employee's direct request to create an account", async () => {
    session.userId = employeeId;
    const result = await actions.saveEmployee({}, form(employeeData));
    expect(result.ok).toBe(false);
    expect(await db.user.count()).toBe(3);
  });
  it("denies manager attempts to grant owner access", async () => {
    session.userId = adminId;
    const result = await actions.saveEmployee({}, form({ ...employeeData, role: "OWNER" }));
    expect(result.ok).toBe(false);
    expect(await db.user.count()).toBe(3);
  });
  it("allows manager creation of ordinary employees and writes audit", async () => {
    session.userId = adminId;
    expect((await actions.saveEmployee({}, form(employeeData))).ok).toBe(true);
    expect(await db.auditLog.count({ where: { action: "EMPLOYEE_CREATED" } })).toBe(1);
  });
  it("denies unauthenticated and deactivated users even with a session identity", async () => {
    session.userId = "";
    expect(
      (await actions.saveEmployee({}, form({ ...employeeData, email: "anon@example.test" }))).ok,
    ).toBe(false);
    await db.user.update({ where: { id: employeeId }, data: { active: false } });
    session.userId = employeeId;
    expect(
      (
        await actions.saveShift(
          {},
          form({
            employeeId: employeeProfileId,
            date: "2026-10-09",
            startTime: "08:00",
            endTime: "17:00",
            duties: "",
          }),
        )
      ).ok,
    ).toBe(false);
  });
  it("does not allow manager deactivation of owner", async () => {
    const profile = await db.employee.create({ data: { userId: ownerId } });
    session.userId = adminId;
    expect(
      (await actions.setEmployeeActive({}, form({ id: profile.id, active: "false" }))).ok,
    ).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: ownerId } })).active).toBe(true);
  });
  it("rejects open signup-style activation without a valid invitation", async () => {
    session.userId = "";
    expect(
      (
        await actions.acceptInvite(
          {},
          form({ token: "f".repeat(64), password: "example-invalid-password" }),
        )
      ).ok,
    ).toBe(false);
  });
  async function queuedChange(
    action: () => Promise<unknown>,
    change: (tx: import("@prisma/client").Prisma.TransactionClient) => Promise<unknown>,
  ) {
    let pending: Promise<unknown> | undefined;
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
      pending = action();
      const deadline = Date.now() + 2000;
      let waiting = false;
      while (Date.now() < deadline) {
        const rows = await tx.$queryRaw<
          { waiting: boolean }[]
        >`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND objid = 7183502 AND NOT granted) AS waiting`;
        if (rows[0].waiting) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await change(tx);
    });
    return pending as Promise<{ ok?: boolean }>;
  }
  it("denies a queued manager deactivation after the target becomes owner", async () => {
    const target = await db.employee.create({
      data: { user: { create: { name: "Promoted", email: `${randomUUID()}@example.test` } } },
    });
    session.userId = adminId;
    const before = await db.auditLog.count();
    const result = await queuedChange(
      () => actions.setEmployeeActive({}, form({ id: target.id, active: "false" })),
      (tx) => tx.user.update({ where: { id: target.userId }, data: { role: "OWNER" } }),
    );
    expect(result.ok).toBe(false);
    expect(await db.user.findUniqueOrThrow({ where: { id: target.userId } })).toMatchObject({
      active: true,
      role: "OWNER",
    });
    expect(await db.auditLog.count()).toBe(before);
  });
  it.each(["inactive", "demoted"])(
    "denies a queued owner grant after its actor becomes %s",
    async (change) => {
      const actor = await db.user.create({
        data: { name: "Queued owner", email: `${randomUUID()}@example.test`, role: "OWNER" },
      });
      const email = `${randomUUID()}@example.test`;
      session.userId = actor.id;
      const before = await db.auditLog.count();
      const result = await queuedChange(
        () => actions.saveEmployee({}, form({ ...employeeData, email, role: "OWNER" })),
        (tx) =>
          tx.user.update({
            where: { id: actor.id },
            data: change === "inactive" ? { active: false } : { role: "ADMIN" },
          }),
      );
      expect(result.ok).toBe(false);
      expect(await db.user.count({ where: { email } })).toBe(0);
      expect(await db.auditLog.count()).toBe(before);
    },
  );
});
