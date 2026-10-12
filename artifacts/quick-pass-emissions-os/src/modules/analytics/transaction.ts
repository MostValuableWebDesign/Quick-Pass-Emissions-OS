import { db } from "@/lib/db";
import { requireRule, type Tx } from "../phase2";
import { automationLocks } from "../automation/transaction";
export async function analyticsLocks(tx: Tx) {
  await automationLocks(tx);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183507)`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183509)`;
}
export async function analytics<T>(
  actorId: string,
  work: (tx: Tx, actor: { id: string; role: string }) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await analyticsLocks(tx);
      const actor = await tx.user.findUnique({ where: { id: actorId } });
      requireRule(
        actor?.active && ["OWNER", "ADMIN"].includes(actor.role),
        "Management access required.",
      );
      return work(tx, actor);
    },
    { timeout: 45000, maxWait: 10000 },
  );
}
export async function stationAccess(
  tx: Tx,
  actor: { id: string; role: string },
  stationId: string,
) {
  const station = await tx.analyticsStation.findUnique({
    where: { id: stationId },
    include: { grants: true },
  });
  requireRule(
    station && (actor.role === "OWNER" || station.grants.some((g) => g.userId === actor.id)),
    "This station is not authorized for your account.",
  );
  return station;
}
