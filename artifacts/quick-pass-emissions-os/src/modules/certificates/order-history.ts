import { z } from "zod";
import { db } from "@/lib/db";
import { businessDate } from "@/lib/time";
import { approvalRoles, audit, BusinessError, phase2 } from "../phase2";
import {
  CERTIFICATE_PORTAL_SCOPE,
  readCertificatePortalStatus,
  refreshCertificateBalance,
} from "./portal";
import { fetchCertificateOrderHistory } from "./order-history-source";
import { certificateOrderInsights } from "./order-insights";

export const CERTIFICATE_HISTORY_ACTION = "CERTIFICATE_ORDER_HISTORY_CACHED";
const FAILURE = "CERTIFICATE_ORDER_HISTORY_FAILED";
const ATTEMPT = "CERTIFICATE_ORDER_HISTORY_STARTED";
const snapshotSchema = z.object({
  checkedAt: z.string().datetime(),
  orders: z
    .array(
      z.object({
        transactionId: z.string(),
        analyzer: z.string(),
        quantity: z.number().int().min(-2_000_000_000).max(2_000_000_000),
        saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        saleTime: z.string(),
        analyzerFlag: z.string(),
      }),
    )
    .max(10000),
});

export async function readCertificateInsights() {
  const [snapshot, failed, settings, portal] = await Promise.all([
    db.auditLog.findFirst({
      where: { entityId: CERTIFICATE_PORTAL_SCOPE, action: CERTIFICATE_HISTORY_ACTION },
      orderBy: { createdAt: "desc" },
    }),
    db.auditLog.findFirst({
      where: { entityId: CERTIFICATE_PORTAL_SCOPE, action: FAILURE },
      orderBy: { createdAt: "desc" },
    }),
    db.certificateSetting.findUnique({ where: { id: "certificates" } }),
    readCertificatePortalStatus(),
  ]);
  const parsed = snapshotSchema.safeParse(snapshot?.details);
  const history = parsed.success ? parsed.data : { checkedAt: null, orders: [] };
  return {
    ...history,
    metrics: certificateOrderInsights(history.orders, portal, businessDate(), settings),
    portal,
    error:
      failed && (!snapshot || failed.createdAt >= snapshot.createdAt)
        ? "Order report refresh failed. Any saved history is still shown and may be out of date."
        : null,
  };
}
export type CertificateInsightsData = Awaited<ReturnType<typeof readCertificateInsights>>;

export async function refreshCertificateInsights(actorId: string, force: boolean) {
  const allowed = await phase2(actorId, approvalRoles, async (tx) => {
    const recent = await tx.auditLog.findFirst({
      where: {
        entityId: CERTIFICATE_PORTAL_SCOPE,
        action: { in: [CERTIFICATE_HISTORY_ACTION, ATTEMPT] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (
      recent &&
      Date.now() - recent.createdAt.getTime() <
        (recent.action === ATTEMPT ? 60000 : force ? 60000 : 3600000)
    )
      return false;
    await audit(tx, actorId, ATTEMPT, CERTIFICATE_PORTAL_SCOPE, { station: "GA102539" });
    return true;
  });
  if (allowed) {
    try {
      const snapshot = await fetchCertificateOrderHistory({
        username: process.env.GA_DASHBOARD_USERNAME ?? "",
        password: process.env.GA_DASHBOARD_PASSWORD ?? "",
      });
      await phase2(actorId, approvalRoles, (tx) =>
        audit(tx, actorId, CERTIFICATE_HISTORY_ACTION, CERTIFICATE_PORTAL_SCOPE, snapshot),
      );
    } catch (error) {
      await phase2(actorId, approvalRoles, (tx) =>
        audit(tx, actorId, FAILURE, CERTIFICATE_PORTAL_SCOPE, {
          message:
            error instanceof BusinessError
              ? error.message
              : "Certificate history could not be loaded.",
        }),
      );
    }
  }
  await refreshCertificateBalance(actorId, force);
  return readCertificateInsights();
}
