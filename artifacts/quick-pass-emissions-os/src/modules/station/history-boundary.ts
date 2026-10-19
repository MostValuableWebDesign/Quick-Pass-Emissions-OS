import { z } from "zod";
import { dateString } from "@/lib/validation";
import { addDays } from "@/lib/time";

export const HISTORY_START_ACTION = "STATION_HISTORY_START_VERIFIED";
export const historyStartSchema = z.object({
  earliestDate: dateString.refine((date) => date >= "2000-01-01"),
  scannedFrom: z.literal("2000-01-01"),
  verified: z.literal(true),
});

const emptyCheckSchema = z
  .object({
    start: dateString,
    end: dateString,
    traffic: z.literal(false),
    metadataOnly: z.literal(true),
  })
  .refine((check) => check.end >= check.start);

/** A gap in provider checks cannot establish the station's earliest available activity. */
export function emptyHistoryCovers(checks: unknown[], endExclusive: string) {
  if (!dateString.safeParse(endExclusive).success || endExclusive < "2000-01-01") return false;
  const ranges = checks
    .flatMap((check) => {
      const parsed = emptyCheckSchema.safeParse(check);
      return parsed.success ? [parsed.data] : [];
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  let cursor = "2000-01-01";
  for (const check of ranges) {
    if (check.start <= cursor && check.end >= cursor) cursor = addDays(check.end, 1);
  }
  return cursor >= endExclusive;
}
