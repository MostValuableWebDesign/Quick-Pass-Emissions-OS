import { addDays } from "@/lib/time";

export const TEST_EXPORT_BATCH_DAYS = 3;
export const TEST_EXPORT_MAX_REQUESTS = 3;

export function testExportBatches(dates: string[], today: string) {
  const chunks: { start: string; end: string }[] = [];
  for (const date of [...new Set(dates)].sort()) {
    const last = chunks.at(-1);
    // Today always gets its own request, ahead of historical backfill.
    if (
      last &&
      date !== today &&
      date === addDays(last.end, 1) &&
      date <= addDays(last.start, TEST_EXPORT_BATCH_DAYS - 1)
    )
      last.end = date;
    else chunks.push({ start: date, end: date });
  }
  return chunks.sort((a, b) => b.end.localeCompare(a.end));
}
