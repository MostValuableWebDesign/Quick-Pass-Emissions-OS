import { addDays } from "@/lib/time";

export const TEST_EXPORT_BATCH_DAYS = 3;
export const TEST_EXPORT_MAX_REQUESTS = 3;

export function testExportBatches(
  dates: string[],
  today: string,
  selected?: { start: string; end: string },
) {
  const isSelected = (date: string) => !!selected && date >= selected.start && date <= selected.end;
  const chunks: { start: string; end: string }[] = [];
  for (const date of [...new Set(dates)].sort()) {
    const last = chunks.at(-1);
    // Today is isolated; selected dates are never grouped with supporting history.
    if (
      last &&
      date !== today &&
      isSelected(date) === isSelected(last.end) &&
      date === addDays(last.end, 1) &&
      date <= addDays(last.start, TEST_EXPORT_BATCH_DAYS - 1)
    )
      last.end = date;
    else chunks.push({ start: date, end: date });
  }
  // The requested report must not be combined with (or blocked by) supporting history.
  return chunks.sort(
    (a, b) =>
      Number(isSelected(b.start)) - Number(isSelected(a.start)) || b.end.localeCompare(a.end),
  );
}
