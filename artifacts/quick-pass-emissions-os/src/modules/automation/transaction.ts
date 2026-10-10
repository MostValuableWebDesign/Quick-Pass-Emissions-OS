import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRule, type Tx } from "../phase2";
// Global order when combined: job generator 3501 -> personnel 3502 -> Phase2 3503 -> Phase3 3504
// -> Phase4 3505 -> automation 3506. Claim-only transactions take 3506 alone.
export async function automationLocks(tx: Tx) {
  // Role, active-status and certification/profile edits share the existing personnel lock.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183503)`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183504)`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183505)`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183506)`;
}
export async function automation<T>(
  actorId: string,
  roles: Role[],
  work: (tx: Tx, actor: { id: string; role: Role; employee: { id: string } | null }) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await automationLocks(tx);
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        include: { employee: { select: { id: true } } },
      });
      requireRule(
        actor?.active && roles.includes(actor.role),
        "You do not have permission for this action.",
      );
      return work(tx, actor);
    },
    {
      timeout: 60000,
      maxWait: 10000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
}
