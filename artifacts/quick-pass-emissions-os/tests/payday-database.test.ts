import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Isolated test database required");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
(enabled ? describe : describe.skip)("Persistent daily payday acknowledgement", () => {
  let db: PrismaClient,
    pay: typeof import("../src/modules/payroll/payday"),
    owner: string,
    manager: string,
    staff: string;
  const saturday = new Date("2026-10-17T16:00:00Z"),
    sunday = new Date("2026-10-18T16:00:00Z"),
    monday = new Date("2026-10-19T16:00:00Z");
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    pay = await import("../src/modules/payroll/payday");
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe('TRUNCATE "User" CASCADE');
    owner = (
      await db.user.create({
        data: { name: "Owner", email: `${randomUUID()}@example.test`, role: "OWNER" },
      })
    ).id;
    manager = (
      await db.user.create({
        data: { name: "Manager", email: `${randomUUID()}@example.test`, role: "ADMIN" },
      })
    ).id;
    staff = (
      await db.user.create({
        data: { name: "Staff", email: `${randomUUID()}@example.test`, role: "EMPLOYEE" },
      })
    ).id;
  });
  it("reads without scheduling or persisting new work", async () => {
    const count = await db.auditLog.count();
    expect((await pay.readPaydayAlert(owner, saturday)).alert?.tone).toBe("yellow");
    expect(await db.auditLog.count()).toBe(count);
  });
  it("persists dismissal for this account/day and returns tomorrow and next week", async () => {
    await pay.acknowledgePayday(owner, { date: "2026-10-17" }, saturday);
    expect((await pay.readPaydayAlert(owner, saturday)).alert).toBeNull();
    expect((await pay.readPaydayAlert(manager, saturday)).alert?.tone).toBe("yellow");
    expect((await pay.readPaydayAlert(owner, sunday)).alert?.tone).toBe("orange");
    await pay.acknowledgePayday(owner, { date: "2026-10-18" }, sunday);
    expect((await pay.readPaydayAlert(owner, monday)).alert?.tone).toBe("red");
    expect((await pay.readPaydayAlert(owner, new Date("2026-10-24T16:00:00Z"))).alert?.tone).toBe(
      "yellow",
    );
  });
  it("allows a manager to acknowledge their own alert without recording a payment", async () => {
    await pay.acknowledgePayday(manager, { date: "2026-10-19" }, monday);
    expect((await pay.readPaydayAlert(manager, monday)).alert).toBeNull();
    expect(
      (await db.auditLog.findFirstOrThrow({ where: { actorId: manager } })).details,
    ).toMatchObject({ paymentConfirmed: false, payDate: "2026-10-19" });
  });
  it("rejects stale, future and off-window dates", async () => {
    await expect(pay.acknowledgePayday(owner, { date: "2026-10-17" }, sunday)).rejects.toThrow(
      "no longer current",
    );
    await expect(pay.acknowledgePayday(owner, { date: "2026-10-19" }, saturday)).rejects.toThrow();
    await expect(
      pay.acknowledgePayday(owner, { date: "2026-10-20" }, new Date("2026-10-20T16:00:00Z")),
    ).rejects.toThrow();
    expect(await db.auditLog.count()).toBe(0);
  });
  it("serializes repeat clicks into one durable acknowledgement", async () => {
    await Promise.all([
      pay.acknowledgePayday(owner, { date: "2026-10-17" }, saturday),
      pay.acknowledgePayday(owner, { date: "2026-10-17" }, saturday),
    ]);
    expect(await db.auditLog.count({ where: { action: pay.PAYDAY_ACKNOWLEDGED } })).toBe(1);
  });
  it.each(["EMPLOYEE", "BOOKKEEPER"] as const)("rejects legacy %s accounts", async (role) => {
    await db.user.update({ where: { id: staff }, data: { role } });
    await expect(pay.readPaydayAlert(staff, saturday)).rejects.toThrow("permission");
    await expect(pay.acknowledgePayday(staff, { date: "2026-10-17" }, saturday)).rejects.toThrow(
      "permission",
    );
  });
  it("rechecks active role after acquiring the personnel lock", async () => {
    let queued: Promise<unknown>;
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
      queued = pay.acknowledgePayday(owner, { date: "2026-10-17" }, saturday);
      queued.catch(() => {});
      await tx.user.update({ where: { id: owner }, data: { active: false } });
    });
    await expect(queued!).rejects.toThrow("permission");
    expect(await db.auditLog.count({ where: { action: pay.PAYDAY_ACKNOWLEDGED } })).toBe(0);
  });
});
