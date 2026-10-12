import { z } from "zod";

export const PACE_SETTINGS_ACTION = "STATION_PERFORMANCE_PACE_SETTINGS";
export const paceSettingsSchema = z.object({
  revision: z
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER - 1),
  longGapMinutes: z.number().int().min(1).max(1439).nullable(),
});
