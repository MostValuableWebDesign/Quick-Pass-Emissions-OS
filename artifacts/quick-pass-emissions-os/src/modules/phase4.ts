import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRule } from "./phase2";
export { audit, requireRule, BusinessError, type Tx } from "./phase2";
export const financeRoles: Role[] = ["OWNER", "ADMIN"];
export const reviewers: Role[] = ["OWNER", "ADMIN"];
export async function phase4<T>(
  actorId: string,
  roles: Role[],
  work: (tx: Prisma.TransactionClient, actor: { id: string; role: Role }) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      // Shared rental lock first: reports/exports and duplicate references see one committed state.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183504)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183505)`;
      const actor = await tx.user.findUnique({ where: { id: actorId } });
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
