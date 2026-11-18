import { Prisma, type Role } from "@prisma/client";
import { db } from "./db";
import { requireRule, type Tx } from "@/modules/phase2";

/**
 * Consistent, permission-checked reads without the advisory locks used by writers.
 * PostgreSQL also rejects accidental writes inside this transaction.
 * Never cache the actor or its permissions across requests.
 */
export async function readAsActor<T>(
  actorId: string,
  roles: Role[],
  work: (
    tx: Tx,
    actor: { id: string; name: string; role: Role; employee: { id: string } | null },
  ) => Promise<T>,
  timeout = 30000,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
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
      timeout,
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    },
  );
}
