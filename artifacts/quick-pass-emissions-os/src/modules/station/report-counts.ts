import type { PortalDay } from "./dashboard-types";
import type { RetentionVisit } from "./vehicle-retention";

type SourceRow = Pick<
  RetentionVisit,
  "date" | "key" | "inspector" | "outcome" | "minute" | "vinHash" | "invalidVin"
>;

/**
 * Older snapshots excluded malformed VINs. Restore only distinct, retained
 * provider reports that explain those VIN-only exclusions; never invent rows
 * from aggregate counts or restore missing inspector/outcome evidence.
 */
export function includeReportedInspections(days: PortalDay[], reports: SourceRow[]) {
  const identities = new Map(reports.map((row) => [row.key, row.vinHash]));
  const byDate = new Map<string, SourceRow[]>();
  for (const row of reports) {
    if ((!row.invalidVin && row.vinHash) || !row.inspector.trim() || !row.outcome.trim()) continue;
    const rows = byDate.get(row.date) ?? [];
    rows.push(row);
    byDate.set(row.date, rows);
  }
  return days.map((original) => {
    if (!original.testTimes) return original;
    const times = original.testTimes.map((row) =>
      row.recordKey && identities.has(row.recordKey)
        ? { ...row, vinHash: identities.get(row.recordKey) ?? undefined }
        : row,
    );
    if (!original.incompleteRows?.vehicle) return { ...original, testTimes: times };
    const day: PortalDay = {
      ...original,
      inspectors: original.inspectors.map((row) => ({ ...row })),
      testTimes: times,
      incompleteRows: { ...original.incompleteRows },
    };
    const seen = new Set(day.testTimes!.map((row) => row.recordKey));
    for (const row of byDate.get(day.date) ?? []) {
      if (!day.incompleteRows?.vehicle || seen.has(row.key)) continue;
      seen.add(row.key);
      const result = row.outcome.trim().toLowerCase();
      const outcome =
        result === "pass"
          ? "passed"
          : result === "fail"
            ? "failed"
            : result === "abort"
              ? "aborted"
              : "other";
      let inspector = day.inspectors.find((person) => person.inspector === row.inspector);
      if (!inspector) {
        inspector = {
          inspector: row.inspector,
          total: 0,
          passed: 0,
          failed: 0,
          aborted: 0,
          other: 0,
        };
        day.inspectors.push(inspector);
      }
      for (const counts of [day, inspector]) {
        counts.total++;
        counts[outcome]++;
      }
      day.testTimes!.push({
        inspector: row.inspector,
        minute: row.minute,
        vinHash: row.vinHash ?? undefined,
        recordKey: row.key,
        outcome,
      });
      day.incompleteRows.total--;
      day.incompleteRows.vehicle--;
      if (!day.incompleteRows.total) day.incompleteRows = undefined;
    }
    return day;
  });
}
