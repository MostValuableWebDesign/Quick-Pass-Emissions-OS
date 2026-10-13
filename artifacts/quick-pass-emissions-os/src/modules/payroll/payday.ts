import { z } from "zod";
import { dateString } from "@/lib/validation";
import { audit, requireRule } from "../phase2";
import { automation } from "../automation/transaction";
import { paydayCalendar } from "./payday-rules";
export const PAYDAY_ACKNOWLEDGED = "PAYDAY_REMINDER_ACKNOWLEDGED";
const entity = (date: string) => `payday:${date}`;
export async function readPaydayAlert(actorId: string, now?: Date) {
  return automation(actorId, ["OWNER", "ADMIN"], async (tx) => {
    const snapshot = paydayCalendar(now ?? new Date());
    if (!snapshot.alert) return snapshot;
    const acknowledged = await tx.auditLog.findFirst({
      where: { actorId, action: PAYDAY_ACKNOWLEDGED, entityId: entity(snapshot.date) },
      select: { id: true },
    });
    return acknowledged ? { ...snapshot, alert: null } : snapshot;
  });
}
export async function acknowledgePayday(actorId: string, input: unknown, now?: Date) {
  const { date } = z.object({ date: dateString }).parse(input);
  return automation(actorId, ["OWNER", "ADMIN"], async (tx) => {
    // Resolve today's Eastern date after acquiring the lock: stale tabs cannot dismiss tomorrow.
    const current = paydayCalendar(now ?? new Date());
    requireRule(
      current.alert && current.date === date,
      "This payday alert is no longer current. Refresh to see today's reminder.",
    );
    const prior = await tx.auditLog.findFirst({
      where: { actorId, action: PAYDAY_ACKNOWLEDGED, entityId: entity(date) },
      select: { id: true },
    });
    if (!prior)
      await audit(tx, actorId, PAYDAY_ACKNOWLEDGED, entity(date), {
        date,
        payDate: current.alert.payDate,
        daysAway: current.alert.daysAway,
        scope: "OWN_ACCOUNT_LOCAL_DAY",
        paymentConfirmed: false,
      });
    return { date };
  });
}
