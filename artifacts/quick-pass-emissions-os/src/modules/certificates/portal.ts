import { z } from "zod";
import { db } from "@/lib/db";
import { audit, phase2, approvalRoles, BusinessError } from "../phase2";
import { digest } from "../station/report";
import { fetchCertificateBalance } from "./portal-source";
import {
  CERTIFICATE_ANALYZER,
  CERTIFICATE_STATION,
  resolveCertificateAlertThreshold,
  type CertificatePortalStatus,
} from "./portal-types";

export const CERTIFICATE_PORTAL_SCOPE = digest(`${CERTIFICATE_STATION}:${CERTIFICATE_ANALYZER}`);
export const CERTIFICATE_BALANCE_ACTION = "CERTIFICATE_PORTAL_BALANCE";
export const CERTIFICATE_THRESHOLD_ACTION = "CERTIFICATE_ALERT_THRESHOLD_V2";
export const LEGACY_CERTIFICATE_THRESHOLD_ACTION = "CERTIFICATE_ALERT_THRESHOLD";
const START = "CERTIFICATE_PORTAL_LOOKUP_STARTED";
const FAIL = "CERTIFICATE_PORTAL_LOOKUP_FAILED";
const TTL = 5 * 60_000;
export const certificateThresholdSchema = z
  .union([z.number(), z.string().trim().regex(/^\d+$/)])
  .transform(Number)
  .pipe(z.number().int().min(0).max(1_000_000));
const balanceSchema = z.object({
  balance: z.number().int().min(0).max(2_000_000_000),
  checkedAt: z.string().datetime(),
  station: z.literal(CERTIFICATE_STATION),
  analyzer: z.literal(CERTIFICATE_ANALYZER),
});

/** Cache only: never performs a portal login just to render the server layout. */
export async function readCertificatePortalStatus(): Promise<CertificatePortalStatus> {
  const [snapshot, setting, legacySetting, failure] = await Promise.all([
    db.auditLog.findFirst({
      where: { entityId: CERTIFICATE_PORTAL_SCOPE, action: CERTIFICATE_BALANCE_ACTION },
      orderBy: { createdAt: "desc" },
    }),
    db.auditLog.findFirst({
      where: { entityId: CERTIFICATE_PORTAL_SCOPE, action: CERTIFICATE_THRESHOLD_ACTION },
      orderBy: { createdAt: "desc" },
    }),
    db.auditLog.findFirst({
      where: { entityId: CERTIFICATE_PORTAL_SCOPE, action: LEGACY_CERTIFICATE_THRESHOLD_ACTION },
      orderBy: { createdAt: "desc" },
    }),
    db.auditLog.findFirst({
      where: { entityId: CERTIFICATE_PORTAL_SCOPE, action: FAIL },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const parsed = balanceSchema.safeParse(snapshot?.details);
  const config = z.object({ threshold: certificateThresholdSchema }).safeParse(setting?.details);
  const legacyConfig = z.object({ threshold: certificateThresholdSchema }).safeParse(
    legacySetting?.details,
  );
  const failed = failure && (!snapshot || failure.createdAt > snapshot.createdAt);
  return {
    station: CERTIFICATE_STATION,
    analyzer: CERTIFICATE_ANALYZER,
    balance: parsed.success ? parsed.data.balance : null,
    checkedAt: parsed.success ? parsed.data.checkedAt : null,
    threshold: resolveCertificateAlertThreshold(
      config.success ? config.data.threshold : null,
      legacyConfig.success ? legacyConfig.data.threshold : null,
    ),
    ...(failed
      ? { error: "The last portal check failed. Any saved balance may be out of date." }
      : {}),
  };
}

export async function refreshCertificateBalance(actorId: string, force = false) {
  const initial = await readCertificatePortalStatus();
  const now = Date.now();
  const fresh = initial.checkedAt && now - Date.parse(initial.checkedAt) < TTL;
  const allowed = await phase2(actorId, approvalRoles, async (tx) => {
    const recent = await tx.auditLog.findFirst({
      where: {
        entityId: CERTIFICATE_PORTAL_SCOPE,
        action: { in: [START, CERTIFICATE_BALANCE_ACTION, FAIL] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!force && fresh && !initial.error) return false;
    // Lease covers the bounded read; do not start overlapping portal sessions.
    if (recent?.action === START && now - recent.createdAt.getTime() < 90_000) return false;
    if (recent && now - recent.createdAt.getTime() < 15_000) return false;
    if (!force && recent?.action === FAIL && now - recent.createdAt.getTime() < TTL) return false;
    await audit(tx, actorId, START, CERTIFICATE_PORTAL_SCOPE, {
      station: CERTIFICATE_STATION,
      analyzer: CERTIFICATE_ANALYZER,
    });
    return true;
  });
  if (!allowed)
    return force
      ? {
          ...initial,
          error:
            "A portal check is running or was just completed. Showing the saved balance; try again shortly.",
        }
      : initial;
  try {
    const balance = await fetchCertificateBalance({
      username: process.env.GA_DASHBOARD_USERNAME ?? "",
      password: process.env.GA_DASHBOARD_PASSWORD ?? "",
    });
    await phase2(actorId, approvalRoles, async (tx) => {
      await audit(tx, actorId, CERTIFICATE_BALANCE_ACTION, CERTIFICATE_PORTAL_SCOPE, {
        balance,
        checkedAt: new Date().toISOString(),
        station: CERTIFICATE_STATION,
        analyzer: CERTIFICATE_ANALYZER,
      });
    });
  } catch (error) {
    await phase2(actorId, approvalRoles, async (tx) => {
      await audit(tx, actorId, FAIL, CERTIFICATE_PORTAL_SCOPE, {
        message:
          error instanceof BusinessError ? error.message : "Certificate balance lookup failed.",
      });
    });
  }
  return readCertificatePortalStatus();
}

export async function saveCertificateAlertThreshold(actorId: string, input: unknown) {
  const threshold = certificateThresholdSchema.parse(input);
  await phase2(actorId, ["OWNER"], async (tx) => {
    await audit(tx, actorId, CERTIFICATE_THRESHOLD_ACTION, CERTIFICATE_PORTAL_SCOPE, { threshold });
  });
}
