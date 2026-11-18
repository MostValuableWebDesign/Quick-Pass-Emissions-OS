import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("A disposable test database is required.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

(enabled ? describe : describe.skip)("real read-only page transactions", () => {
  let db: PrismaClient;
  let blocker: PrismaClient;
  let read: typeof import("@/lib/read-as-actor").readAsActor;
  let registry: typeof import("@/modules/maintenance/service").registry;
  let payday: typeof import("@/modules/payroll/payday").readPaydayAlert;
  let invoices: typeof import("@/modules/finance/service").invoiceOverview;
  let owner: string;
  let staff: string;
  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    const { PrismaClient } = await import("@prisma/client");
    blocker = new PrismaClient();
    read = (await import("@/lib/read-as-actor")).readAsActor;
    registry = (await import("@/modules/maintenance/service")).registry;
    payday = (await import("@/modules/payroll/payday")).readPaydayAlert;
    invoices = (await import("@/modules/finance/service")).invoiceOverview;
    owner = (
      await db.user.create({
        data: { name: "Read fixture", email: `${randomUUID()}@example.test`, role: "OWNER" },
      })
    ).id;
    staff = (
      await db.user.create({
        data: { name: "Staff fixture", email: `${randomUUID()}@example.test`, role: "EMPLOYEE" },
      })
    ).id;
  });
  afterAll(async () => {
    await blocker?.$disconnect();
    await db?.$disconnect();
  });
  it("enforces read-only mode at PostgreSQL, not just by convention", async () => {
    await expect(
      read(owner, ["OWNER"], (tx) =>
        tx.user.update({
          where: { id: owner },
          data: { name: "Must not change" },
        }),
      ),
    ).rejects.toThrow();
    expect((await db.user.findUniqueOrThrow({ where: { id: owner } })).name).toBe("Read fixture");
  });
  it("continues page reads while a writer holds all business advisory locks", async () => {
    let release!: () => void;
    let acquired!: () => void;
    const held = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const end = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writer = blocker.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183503)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183504)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183505)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183506)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183507)`;
        acquired();
        await end;
      },
      { timeout: 15000 },
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await held;
      const result = await Promise.race([
        Promise.all([
          registry(owner, "bays"),
          payday(owner, new Date("2026-10-17T16:00:00Z")),
          invoices(owner),
        ]),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Read blocked by business locks")), 5000);
        }),
      ]);
      expect(result[0].bays).toEqual([]);
      expect(result[1].alert?.tone).toBe("yellow");
      expect(result[2].invoices).toEqual([]);
    } finally {
      if (timer) clearTimeout(timer);
      release();
      await writer;
    }
  });
  it("keeps role and inactive-account checks on real page reads", async () => {
    await expect(registry(staff, "bays")).rejects.toThrow("permission");
    await expect(invoices(staff)).rejects.toThrow("permission");
    await db.user.update({ where: { id: owner }, data: { active: false } });
    await expect(registry(owner, "bays")).rejects.toThrow("permission");
    await expect(payday(owner)).rejects.toThrow("permission");
    await expect(invoices(owner)).rejects.toThrow("permission");
  });
});
