import { Prisma, type Role } from "@prisma/client";
import { db } from "../lib/db";
export class BusinessError extends Error {}
export function requireRule(ok: unknown, message: string): asserts ok {
  if (!ok) throw new BusinessError(message);
}
export const financeRoles: Role[] = ["OWNER", "ADMIN"];
export const approvalRoles: Role[] = ["OWNER", "ADMIN"];
export type Tx = Prisma.TransactionClient;
// One transaction-scoped lock serializes this small business's Phase 2 ledger and approvals.
// READ COMMITTED queries after the lock see the previous writer's committed balance/state.
export async function phase2<T>(
  actorId: string,
  roles: Role[],
  work: (tx: Tx, actor: { id: string; name: string; role: Role }) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183503)`;
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
export async function audit(
  tx: Tx,
  actorId: string,
  action: string,
  entityId: string,
  details: Prisma.InputJsonValue,
) {
  await tx.auditLog.create({ data: { actorId, action, entityId, details } });
}
export async function employeeExists(tx: Tx, employeeId: string) {
  const employee = await tx.employee.findUnique({
    where: { id: employeeId },
    include: { user: true },
  });
  requireRule(employee, "Choose an existing employee.");
  return employee;
}
