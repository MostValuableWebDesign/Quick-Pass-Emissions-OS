import { z } from "zod";
import { dateString } from "@/lib/validation";
import { businessDate } from "@/lib/time";
import { audit, requireRule } from "../phase2";
import { stationConfig, stationTransaction } from "./service";
import { portalDailyTotal } from "./portal-client";

export const portalTotalSchema = z
  .object({
    date: dateString,
    total: z.number().int().min(0).max(10000),
    passed: z.number().int().min(0),
    failed: z.number().int().min(0),
    aborted: z.number().int().min(0),
    other: z.number().int().min(0),
    retrievedAt: z.string().datetime(),
  })
  .refine((r) => r.total === r.passed + r.failed + r.aborted + r.other);
export type SavedPortalTotal = z.infer<typeof portalTotalSchema>;

export async function retrievePortalCount(actorId: string, input: unknown) {
  const date = dateString.parse(input);
  requireRule(date <= businessDate(), "Choose today or an earlier business date.");
  // Authorize and throttle before reading credentials or making any external request.
  await stationTransaction(actorId, async (tx, hash) => {
    const latest = await tx.auditLog.findFirst({
      where: { action: "STATION_PORTAL_LOOKUP_STARTED", entityId: hash },
      orderBy: { createdAt: "desc" },
    });
    requireRule(
      !latest || latest.createdAt.getTime() <= Date.now() - 15_000,
      "Wait 15 seconds between station portal requests.",
    );
    await audit(tx, actorId, "STATION_PORTAL_LOOKUP_STARTED", hash, { date });
  });
  const config = stationConfig();
  const result = portalTotalSchema.parse(
    await portalDailyTotal(date, {
      station: config.station,
      username: process.env.GA_DASHBOARD_USERNAME ?? "",
      password: process.env.GA_DASHBOARD_PASSWORD ?? "",
    }),
  );
  await stationTransaction(actorId, async (tx, hash) => {
    requireRule(hash === config.hash, "Station configuration changed. Try again.");
    await audit(tx, actorId, "STATION_PORTAL_COUNT_RETRIEVED", hash, result);
  });
  return result;
}
