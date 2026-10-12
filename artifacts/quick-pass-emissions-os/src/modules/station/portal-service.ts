import { z } from "zod";
import { dateString } from "@/lib/validation";
import { businessDate } from "@/lib/time";
import { audit, requireRule } from "../phase2";
import { stationTransaction } from "./service";
import { portalDailyTotal, PortalSession } from "./portal-client";
import { withStationTestExport, requireActiveTestExport } from "./test-export-gate";

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
  return withStationTestExport(actorId, "DAILY_COUNT", async (run) => {
    await stationTransaction(actorId, (tx, hash) => requireActiveTestExport(tx, hash, run));
    const result = portalTotalSchema.parse(
      await portalDailyTotal(
        date,
        {
          station: run.station,
          username: process.env.GA_DASHBOARD_USERNAME ?? "",
          password: process.env.GA_DASHBOARD_PASSWORD ?? "",
        },
        new PortalSession(fetch, false, false, run.signal),
      ),
    );
    await stationTransaction(actorId, async (tx, hash) => {
      await requireActiveTestExport(tx, hash, run);
      await audit(tx, actorId, "STATION_PORTAL_COUNT_RETRIEVED", hash, result);
    });
    return result;
  });
}
