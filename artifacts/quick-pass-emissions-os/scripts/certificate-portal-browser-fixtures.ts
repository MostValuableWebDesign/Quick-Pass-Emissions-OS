import type { PrismaClient } from "@prisma/client";
import {
  CERTIFICATE_BALANCE_ACTION,
  CERTIFICATE_PORTAL_SCOPE,
  CERTIFICATE_THRESHOLD_ACTION,
} from "../src/modules/certificates/portal";
import { CERTIFICATE_ANALYZER, CERTIFICATE_STATION } from "../src/modules/certificates/portal-types";

/** Synthetic portal cache only; called exclusively inside the owned browser database. */
export async function certificatePortalBrowserFixture(db: PrismaClient, ownerId: string) {
  const createdAt = new Date(Date.now() - 20_000);
  await db.auditLog.createMany({
    data: [
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
