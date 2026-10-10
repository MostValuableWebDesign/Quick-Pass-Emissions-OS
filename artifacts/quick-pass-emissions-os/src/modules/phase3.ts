import { Prisma, type Role } from "@prisma/client";
import { db } from "../lib/db";
import { requireRule } from "./phase2";
export { audit, requireRule, BusinessError, type Tx } from "./phase2";
export const managers: Role[] = ["OWNER", "ADMIN"];
export const rentalRoles: Role[] = ["OWNER", "ADMIN"];
export async function phase3<T>(
  actorId: string,
  roles: Role[],
  work: (
    tx: Prisma.TransactionClient,
    actor: { id: string; role: Role; employee: { id: string } | null },
  ) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183504)`;
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
      maxWait: 10000,
      timeout: 30000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
}
