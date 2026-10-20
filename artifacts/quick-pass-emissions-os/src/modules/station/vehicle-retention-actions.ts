"use server";

import { z } from "zod";
import { currentUser } from "@/lib/access";
import { BusinessError } from "../phase2";
import { readDashboard, dashboardQuerySchema } from "./dashboard-service";
import { readRetentionDetails } from "./vehicle-retention-service";
import type { DashboardQuery } from "./dashboard-types";
import type { RetentionDetailRequest, RetentionDetails } from "./vehicle-retention";

const querySchema = dashboardQuerySchema.refine(
  (q) => q.start <= q.end,
  "Choose a valid date range.",
);
const detailSchema = z.object({
  metric: z.enum(["repeat", "selected", "month", "year", "cohort", "intervals", "review", "plate"]),
  year: z.number().int().min(2000).max(9998).optional(),
  band: z.string().max(30).optional(),
  vehicleId: z.string().min(1).max(200).optional(),
  page: z.number().int().min(1).max(100000).optional(),
});
export async function getVehicleRetentionDetailsAction(
  query: DashboardQuery,
  input: RetentionDetailRequest,
): Promise<{ ok: true; data: RetentionDetails } | { ok: false; message: string }> {
  const actor = await currentUser();
  try {
    const q = querySchema.parse(query),
      detail = detailSchema.parse(input);
    let data = await readRetentionDetails(actor.id, q, detail);
    if (!data) {
      // Reuse the cache-only Performance pipeline after a server restart or cache expiry.
      // Opening a drill-down never contacts the provider or starts a retrieval job.
      await readDashboard(actor.id, q);
      data = await readRetentionDetails(actor.id, q, detail);
    }
    if (!data)
      return {
        ok: false,
        message: "History changed while loading. Refresh Performance and try again.",
      };
    return { ok: true, data };
  } catch (error) {
    if (error instanceof BusinessError) return { ok: false, message: error.message };
    return { ok: false, message: "Unable to load the saved vehicle history. No data was changed." };
  }
}
