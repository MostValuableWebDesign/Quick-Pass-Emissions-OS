import "dotenv/config";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
async function main() {
  if (process.env.ALLOW_ACCOUNT_RECOVERY !== "true")
    throw new Error("Recovery must be explicitly enabled.");
  const email = z.email().parse(process.env.RECOVERY_EMAIL).toLowerCase();
  const actorEmail = z.email().parse(process.env.RECOVERY_ACTOR_EMAIL).toLowerCase();
  const password = await hashPassword(
    z.string().min(12).max(128).parse(process.env.RECOVERY_PASSWORD),
  );
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
    const actor = await tx.user.findUniqueOrThrow({ where: { email: actorEmail } });
    const target = await tx.user.findUniqueOrThrow({
      where: { email },
      include: { employee: true },
    });
    if (
      actor.role !== "OWNER" ||
      !actor.active ||
      !target.active ||
      !["OWNER", "ADMIN"].includes(target.role)
    )
      throw new Error("Recovery requires an active owner and target.");
    const result = await tx.account.updateMany({
      where: { userId: target.id, providerId: "credential" },
      data: { password },
    });
    if (result.count !== 1) throw new Error("An activated credential account is required.");
    await tx.session.deleteMany({ where: { userId: target.id } });
    if (target.employee)
      await tx.invite.updateMany({
        where: { employeeId: target.employee.id, usedAt: null },
        data: { usedAt: new Date() },
      });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "OPERATOR_ACCOUNT_RECOVERY",
        entityId: target.id,
        details: { sessionsRevoked: true },
      },
    });
  });
  console.log("Account recovered and sessions revoked. Remove recovery environment variables now.");
}
main()
  .catch(() => {
    console.error(
      "Recovery failed. Verify explicit enablement, credentials and active owner authorization.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
