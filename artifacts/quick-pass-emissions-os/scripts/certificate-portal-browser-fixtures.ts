import type { PrismaClient } from "@prisma/client";
import {
  CERTIFICATE_BALANCE_ACTION,
  CERTIFICATE_PORTAL_SCOPE,
  CERTIFICATE_THRESHOLD_ACTION,
} from "../src/modules/certificates/portal";
import {
  CERTIFICATE_ANALYZER,
  CERTIFICATE_STATION,
} from "../src/modules/certificates/portal-types";
import { CERTIFICATE_HISTORY_ACTION } from "../src/modules/certificates/order-history";
import { addDays, businessDate } from "../src/lib/time";

/** Synthetic portal cache only; called exclusively inside the owned browser database. */
export async function certificatePortalBrowserFixture(db: PrismaClient, ownerId: string) {
  const createdAt = new Date(Date.now() - 20_000);
  await db.auditLog.createMany({
    data: [
      {
        actorId: ownerId,
        entityId: CERTIFICATE_PORTAL_SCOPE,
        action: CERTIFICATE_HISTORY_ACTION,
        createdAt,
        details: {
          checkedAt: new Date().toISOString(),
          orders: Array.from({ length: 28 }, (_, index) => ({
            transactionId: String(10000 + index),
            analyzer: index === 27 ? "OTHER_ANALYZER" : CERTIFICATE_ANALYZER,
            quantity: index === 26 ? -100 : 300,
            saleDate: addDays(businessDate(), -Math.floor(index / 4) * 3),
            saleTime: "07:52 AM",
            analyzerFlag: "Yes",
          })),
        },
      },
      {
        actorId: ownerId,
        entityId: CERTIFICATE_PORTAL_SCOPE,
        action: CERTIFICATE_BALANCE_ACTION,
        createdAt,
        details: {
          balance: 29,
          checkedAt: new Date().toISOString(),
          station: CERTIFICATE_STATION,
          analyzer: CERTIFICATE_ANALYZER,
        },
      },
      {
        actorId: ownerId,
        entityId: CERTIFICATE_PORTAL_SCOPE,
        action: CERTIFICATE_THRESHOLD_ACTION,
        details: { threshold: 30 },
      },
    ],
  });
}
