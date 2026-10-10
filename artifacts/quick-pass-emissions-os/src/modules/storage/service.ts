import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { StorageError } from "@/lib/storage";

export async function storageStatus(actorId: string) {
  return db.$transaction(
    async (tx) => {
      const actor = await tx.user.findUnique({ where: { id: actorId } });
      if (!actor?.active || actor.role !== "OWNER")
        throw new StorageError("Only an active owner can view storage information.");
      const store = await tx.dataStore.findUniqueOrThrow({ where: { id: "business" } });
      const [employees, tasks, auditEntries] = await Promise.all([
        tx.employee.count(),
        tx.taskInstance.count(),
        tx.auditLog.count(),
      ]);
      return { ...store, employees, tasks, auditEntries };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
