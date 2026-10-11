import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Use an isolated test database.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
(enabled ? describe : describe.skip)("Management-only upgrade", () => {
  it("retires legacy authentication while retaining staff and operational records", async () => {
    const { db } = await import("../src/lib/db");
    try {
      const users = [];
      for (const role of ["OWNER", "ADMIN", "EMPLOYEE", "BOOKKEEPER"] as const) {
        const user = await db.user.create({
          data: {
            name: "Upgrade fixture",
            email: `${randomUUID()}@example.test`,
            role,
            employee: { create: {} },
          },
          include: { employee: true },
        });
        await db.account.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            accountId: user.id,
            providerId: "credential",
            password: "synthetic-retired-hash",
          },
        });
        await db.session.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            token: randomUUID(),
            expiresAt: new Date(Date.now() + 60000),
          },
        });
        await db.invite.create({
          data: {
            employeeId: user.employee!.id,
            tokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
            expiresAt: new Date(Date.now() + 60000),
          },
        });
        await db.employeeSchedule.create({
          data: {
            employeeId: user.employee!.id,
            date: "2026-10-01",
            startTime: "08:00",
            endTime: "17:00",
            duties: "Retained management record",
          },
        });
        users.push(user);
      }
      const sql = readFileSync(
        new URL(
          "../prisma/migrations/202610100011_management_access/migration.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await db.$transaction(async (tx) => {
        for (const statement of sql.split(";").filter((s) => s.trim()))
          await tx.$executeRawUnsafe(statement);
      });
      for (const user of users) {
        const allowed = user.role === "OWNER" || user.role === "ADMIN";
        expect(await db.account.count({ where: { userId: user.id } })).toBe(allowed ? 1 : 0);
        expect(await db.session.count({ where: { userId: user.id } })).toBe(allowed ? 1 : 0);
        expect(
          (await db.invite.findFirstOrThrow({ where: { employeeId: user.employee!.id } }))
            .usedAt === null,
        ).toBe(allowed);
        expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).active).toBe(true);
        expect(await db.employeeSchedule.count({ where: { employeeId: user.employee!.id } })).toBe(
          1,
        );
      }
    } finally {
      await db.$disconnect();
    }
  });
});
