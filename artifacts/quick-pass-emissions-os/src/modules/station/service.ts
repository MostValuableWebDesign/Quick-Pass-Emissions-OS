import { z } from "zod";
import { Prisma } from "@prisma/client";
import { automation } from "../automation/transaction";
import { audit, requireRule, employeeExists, type Tx, BusinessError } from "../phase2";
import { dateString, id, timeString } from "@/lib/validation";
import { businessDate } from "@/lib/time";
import { parseReport, digest, range } from "./report";
import { reconcileStationCount } from "../payroll/service";

const reason = z.string().trim().min(1).max(2000);
const integer = z.coerce.number().int().min(0).max(2147483647);
const label = z.string().trim().min(1).max(160);
export function stationConfig() {
  // Only the server sees station configuration; no credentials are returned.
  const station = process.env.GA_STATION_ID?.trim();
  requireRule(
    station && /^[A-Za-z0-9_-]{1,40}$/.test(station),
    "Configure a valid GA_STATION_ID in Secrets.",
  );
  return { station, hash: digest(station) };
}
export async function stationTransaction<T>(
  actorId: string,
  work: (tx: Tx, hash: string) => Promise<T>,
) {
  return automation(actorId, ["OWNER"], async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183507)`;
    return work(tx, stationConfig().hash);
  });
}
export const scheduleInput = z
  .object({
    revision: integer,
    effectiveDate: dateString,
    weekStart: z.coerce.number().int().min(1).max(7),
    hours: z
      .array(
        z
          .object({ weekday: z.number().int().min(1).max(7), open: timeString, close: timeString })
          .refine((h) => h.close > h.open, "Split overnight hours into business dates."),
      )
      .max(7),
    observationDays: z.coerce.number().int().min(7).max(365),
    minimumDays: z.coerce.number().int().min(1).max(365),
    reason,
    sourceTimezoneConfirmed: z.boolean(),
  })
  .refine(
    (v) =>
      new Set(v.hours.map((h) => h.weekday)).size === v.hours.length &&
      v.minimumDays <= v.observationDays,
    "Use unique weekdays and minimum history within the observation window.",
  );
export async function saveSettings(actorId: string, input: unknown) {
  const data = scheduleInput.parse(input);
  return stationTransaction(actorId, async (tx, hash) => {
    const latest = await tx.stationSetting.findFirst({
      where: { stationHash: hash },
      orderBy: { revision: "desc" },
    });
    requireRule(
      (latest?.revision ?? 0) === data.revision,
      "Settings changed. Refresh before saving.",
    );
    requireRule(
      !latest || data.effectiveDate > latest.effectiveDate,
      "Add a later effective-dated revision; historical schedules remain.",
    );
    const row = await tx.stationSetting.create({
      data: {
        ...data,
        stationHash: hash,
        revision: data.revision + 1,
        hours: data.hours,
        createdBy: actorId,
      },
    });
    await audit(tx, actorId, "STATION_SETTINGS_CREATED", row.id, {
      revision: row.revision,
      reason: data.reason,
    });
    return row;
  });
}
export async function saveMapping(actorId: string, input: unknown) {
  const data = z
    .object({ inspector: label, employeeId: id, effectiveDate: dateString, reason })
    .parse(input);
  return stationTransaction(actorId, async (tx, hash) => {
    await employeeExists(tx, data.employeeId);
    const row = await tx.stationMapping.create({
      data: { ...data, stationHash: hash, createdBy: actorId },
    });
    await audit(tx, actorId, "STATION_MAPPING_CREATED", row.id, data);
    // Existing records retain their snapshotted attribution, even for retroactive mappings.
    return row;
  });
}
export async function saveRule(actorId: string, input: unknown) {
  const data = z
    .object({
      outcome: label,
      effectiveDate: dateString,
      eligible: z.boolean(),
      priceCents: z.coerce.number().int().min(0).max(2_000_000_000),
      reason,
    })
    .parse(input);
  return stationTransaction(actorId, async (tx, hash) => {
    const row = await tx.stationRule.create({
      data: { ...data, stationHash: hash, createdBy: actorId },
    });
    await audit(tx, actorId, "STATION_RULE_CREATED", row.id, data);
    return row;
  });
}
export async function importReport(actorId: string, input: { body: string; reason: string }) {
  const data = z.object({ body: z.string().max(2_000_000), reason }).parse(input);
  const started = Date.now();
  // Authorization is checked before parsing, and again for recording a rejected attempt.
  try {
    return await stationTransaction(actorId, async (tx, hash) => {
      const parsed = parseReport(data.body, stationConfig().station);
      requireRule(parsed.end <= businessDate(), "Report dates cannot be in the future.");
      const run = await tx.stationImport.create({
        data: {
          stationHash: hash,
          digest: parsed.digest,
          startDate: parsed.start,
          endDate: parsed.end,
          status: "IMPORTED",
          rows: parsed.rows.length,
          reason: data.reason,
          createdBy: actorId,
        },
      });
      let inserted = 0,
        duplicates = 0;
      for (const source of parsed.rows) {
        const existing = await tx.stationRevision.findUnique({
          where: {
            stationHash_fingerprint: { stationHash: hash, fingerprint: source.fingerprint },
          },
        });
        if (existing) {
          // An explicit reviewed-report import may promote historical evidence into this workflow.
          await tx.stationRecord.updateMany({
            where: { id: existing.recordId, historicalOnly: true },
            data: { historicalOnly: false },
          });
          duplicates++;
          continue;
        }
        const mapping = await tx.stationMapping.findFirst({
          where: {
            stationHash: hash,
            inspector: source.inspector,
            effectiveDate: { lte: source.businessDate },
          },
          orderBy: { effectiveDate: "desc" },
        });
        const record = await tx.stationRecord.create({
          data: { stationHash: hash, employeeId: mapping?.employeeId, mappingId: mapping?.id },
        });
        const revision = await tx.stationRevision.create({
          data: { ...source, stationHash: hash, recordId: record.id, importId: run.id },
        });
        await tx.stationRecord.update({
          where: { id: record.id },
          data: { currentRevisionId: revision.id },
        });
        inserted++;
      }
      const result = await tx.stationImport.update({
        where: { id: run.id },
        data: { inserted, duplicates, elapsedMs: Math.min(Date.now() - started, 2147483647) },
      });
      await audit(tx, actorId, "STATION_REPORT_IMPORTED", run.id, {
        inserted,
        duplicates,
        rows: parsed.rows.length,
        coverage: "PARTIAL",
      });
      return result;
    });
  } catch (error) {
    // Fixed diagnostics: never log, persist, or return raw markup/provider responses.
    await stationTransaction(actorId, async (tx, hash) => {
      const today = businessDate();
      await tx.stationImport.create({
        data: {
          stationHash: hash,
          digest: digest(data.body),
          startDate: today,
          endDate: today,
          status: "FAILED",
          reason: data.reason,
          error:
            "Report rejected. Check station, original format, date range and ambiguous duplicate rows.",
          elapsedMs: Math.min(Date.now() - started, 2147483647),
          createdBy: actorId,
        },
      });
    });
    throw error instanceof BusinessError
      ? error
      : new BusinessError("Report rejected. Check its original format and valid dates.");
  }
}
export async function attestCoverage(actorId: string, input: unknown) {
  const data = z.object({ importId: id, expectedRows: integer, reason }).parse(input);
  return stationTransaction(actorId, async (tx, hash) => {
    const run = await tx.stationImport.findFirst({
      where: { id: data.importId, stationHash: hash },
    });
    requireRule(run?.status === "IMPORTED", "Choose a successful imported report.");
    requireRule(
      run.endDate < businessDate(),
      "An in-progress business day cannot be attested as complete.",
    );
    const records = await currentRecords(tx, hash, run.startDate, run.endDate);
    requireRule(
      records.length > 0 && data.expectedRows > 0,
      "Zero-test report evidence is unverified. A historical report with no current records cannot establish empty-day coverage.",
    );
    requireRule(
      records.length === data.expectedRows && records.every((r) => r.state === "CONFIRMED"),
      "Import every page, resolve identities/corrections and compare the combined distinct count with the portal total before attesting.",
    );
    await tx.stationImport.update({
      where: { id: run.id },
      data: { coverage: "OWNER_ATTESTED", reviewedAt: new Date() },
    });
    await audit(tx, actorId, "STATION_COVERAGE_ATTESTED", run.id, {
      expectedRows: data.expectedRows,
      reason: data.reason,
      limitation: "Owner-attested report, not verified complete portal query.",
    });
  });
}
async function recordForUpdate(tx: Tx, hash: string, recordId: string, version: number) {
  const row = await tx.stationRecord.findFirst({
    where: { id: recordId, stationHash: hash },
    include: { revisions: true },
  });
  requireRule(
    row && row.version === version && row.state !== "SUPERSEDED",
    "Record changed. Refresh before reviewing.",
  );
  const source = row.revisions.find((r) => r.id === row.currentRevisionId);
  requireRule(source, "Source revision missing.");
  return { row, source };
}
export async function reviewRecord(actorId: string, input: unknown) {
  const data = z
    .object({
      recordId: id,
      version: integer,
      disposition: z.enum(["RETAIL", "EXCLUDED", "DEALER", "FINANCE", "UNRESOLVED"]),
      eligibility: z.enum(["RULE", "YES", "NO"]),
      reattribute: z.boolean(),
      dealerServiceId: z.string().max(100).default(""),
      financeEntryId: z.string().max(100).default(""),
      reason,
    })
    .parse(input);
  return stationTransaction(actorId, async (tx, hash) => {
    const { row, source } = await recordForUpdate(tx, hash, data.recordId, data.version);
    const rule = await tx.stationRule.findFirst({
      where: {
        stationHash: hash,
        outcome: source.outcome,
        effectiveDate: { lte: source.businessDate },
      },
      orderBy: { effectiveDate: "desc" },
    });
    const eligible =
      data.eligibility === "RULE" ? (rule?.eligible ?? null) : data.eligibility === "YES";
    requireRule(
      !data.dealerServiceId || data.disposition === "DEALER",
      "Dealer evidence requires DEALER classification.",
    );
    requireRule(
      !data.financeEntryId || data.disposition === "FINANCE",
      "Finance evidence requires FINANCE classification.",
    );
    if (data.disposition === "DEALER") {
      requireRule(
        data.dealerServiceId && !data.financeEntryId,
        "Choose exactly one dealership service evidence record.",
      );
      const service = await tx.dealerService.findUnique({ where: { id: data.dealerServiceId } });
      requireRule(
        service && !service.voidDate && service.date === source.businessDate,
        "Choose unvoided dealership evidence for this business date.",
      );
      const linked = await tx.stationRecord.count({
        where: {
          stationHash: hash,
          dealerServiceId: service.id,
          state: "CONFIRMED",
          id: { not: row.id },
        },
      });
      requireRule(
        linked < service.quantity,
        "All service units are already linked; do not count revenue twice.",
      );
    }
    if (data.disposition === "FINANCE") {
      requireRule(
        data.financeEntryId && !data.dealerServiceId,
        "Choose exactly one actual finance evidence record.",
      );
      const entry = await tx.financeEntry.findUnique({ where: { id: data.financeEntryId } });
      requireRule(
        entry &&
          entry.direction === "REVENUE" &&
          entry.basis === "MANUAL" &&
          !entry.voidDate &&
          entry.date === source.businessDate,
        "Choose actual unvoided revenue evidence for this date.",
      );
      requireRule(
        !(await tx.stationRecord.count({
          where: {
            stationHash: hash,
            financeEntryId: entry.id,
            state: "CONFIRMED",
            id: { not: row.id },
          },
        })),
        "This finance entry is already linked. Use specific evidence rather than duplicating it.",
      );
    }
    let mapping = null;
    if (data.reattribute) {
      mapping = await tx.stationMapping.findFirst({
        where: {
          stationHash: hash,
          inspector: source.inspector,
          effectiveDate: { lte: source.businessDate },
        },
        orderBy: { effectiveDate: "desc" },
      });
      requireRule(
        mapping,
        "Configure an exact source-label mapping before historical reattribution.",
      );
    }
    const result = await tx.stationRecord.update({
      where: { id: row.id },
      data: {
        state: "CONFIRMED",
        disposition: data.disposition,
        eligible,
        reason: data.reason,
        version: { increment: 1 },
        dealerServiceId: data.dealerServiceId || null,
        financeEntryId: data.financeEntryId || null,
        ...(mapping ? { employeeId: mapping.employeeId, mappingId: mapping.id } : {}),
      },
    });
    await audit(tx, actorId, "STATION_RECORD_REVIEWED", row.id, {
      before: {
        version: row.version,
        state: row.state,
        employeeId: row.employeeId,
        disposition: row.disposition,
        eligible: row.eligible,
      },
      after: data,
    });
    return result;
  });
}
/** No fuzzy/automatic corrected-record identity is inferred from this report. */
export async function mergeCorrection(actorId: string, input: unknown) {
  const data = z
    .object({ recordId: id, version: integer, originalId: id, originalVersion: integer, reason })
    .parse(input);
  return stationTransaction(actorId, async (tx, hash) => {
    const incoming = await recordForUpdate(tx, hash, data.recordId, data.version);
    const original = await recordForUpdate(tx, hash, data.originalId, data.originalVersion);
    requireRule(
      incoming.row.id !== original.row.id && incoming.row.state === "PENDING",
      "Choose a pending correction and its distinct original record.",
    );
    await tx.stationRevision.updateMany({
      where: { recordId: incoming.row.id },
      data: { recordId: original.row.id },
    });
    await tx.stationRecord.update({
      where: { id: incoming.row.id },
      data: { state: "SUPERSEDED", currentRevisionId: null, version: { increment: 1 } },
    });
    await tx.stationRecord.update({
      where: { id: original.row.id },
      data: {
        currentRevisionId: incoming.source.id,
        state: "PENDING",
        disposition: "UNRESOLVED",
        eligible: null,
        employeeId: null,
        mappingId: null,
        dealerServiceId: null,
        financeEntryId: null,
        reason: data.reason,
        version: { increment: 1 },
      },
    });
    await audit(tx, actorId, "STATION_CORRECTION_LINKED", original.row.id, {
      ...data,
      stationHash: hash,
      oldDate: original.source.businessDate,
      newDate: incoming.source.businessDate,
    });
  });
}
/** Departure dates matter too: a corrected row no longer appears in its old range.
 * Legacy correction events have no date bounds, so conservatively invalidate all
 * older attestations for that station instead of treating absence as zero.
 */
export async function correctionBoundaries(tx: Tx, hash: string) {
  const events = await tx.$queryRaw<{ details: Prisma.JsonValue; createdAt: Date }[]>`
    SELECT a."details", a."createdAt" FROM "AuditLog" a
    JOIN "StationRecord" r ON r.id = a."entityId"
    WHERE a.action = 'STATION_CORRECTION_LINKED' AND r."stationHash" = ${hash}`;
  return events.flatMap((e) => {
    const d: Record<string, unknown> =
      e.details && typeof e.details === "object" && !Array.isArray(e.details) ? e.details : {};
    const dates = [d.oldDate, d.newDate];
    return [
      {
        at: e.createdAt,
        dates: dates.every((v): v is string => dateString.safeParse(v).success) ? dates : null,
      },
    ];
  });
}
export function coverageAfterCorrections(
  reviewedAt: Date | null,
  date: string,
  corrections: { at: Date; dates: string[] | null }[],
) {
  return (
    reviewedAt !== null &&
    !corrections.some((c) => c.at >= reviewedAt && (!c.dates || c.dates.includes(date)))
  );
}
export async function reconcileCount(actorId: string, input: unknown) {
  const data = z
    .object({ employeeId: id, date: dateString, expectedVersion: integer, reason })
    .parse(input);
  return stationTransaction(actorId, async (tx, hash) => {
    await employeeExists(tx, data.employeeId);
    requireRule(data.date < businessDate(), "Finish the business day before reconciling.");
    const setting = await tx.stationSetting.findFirst({
      where: { stationHash: hash, effectiveDate: { lte: data.date } },
      orderBy: { effectiveDate: "desc" },
    });
    requireRule(
      setting?.sourceTimezoneConfirmed,
      "Owner must confirm the source calendar dates are America/New_York business dates before payroll reconciliation.",
    );
    const rows = await currentRecords(tx, hash, data.date, data.date);
    const corrections = await correctionBoundaries(tx, hash);
    const runs = await tx.stationImport.findMany({
      where: {
        stationHash: hash,
        startDate: { lte: data.date },
        endDate: { gte: data.date },
        status: "IMPORTED",
        coverage: "OWNER_ATTESTED",
      },
    });
    requireRule(
      rows.length > 0 &&
        runs.some(
          (run) =>
            coverageAfterCorrections(run.reviewedAt, data.date, corrections) &&
            rows.every((r) => r.source.observedAt <= run.reviewedAt!),
        ),
      "A current complete-page owner report attestation with nonempty station-day evidence is required. Empty station days require separately verified zero-report semantics; new source revisions require a new coverage review.",
    );
    requireRule(
      rows.every((r) => r.state === "CONFIRMED" && r.employeeId && r.eligible !== null),
      "Resolve all identities, inspector mappings and test eligibility for this date first.",
    );
    const personal = rows.filter((r) => r.employeeId === data.employeeId);
    const count = personal.filter((r) => r.eligible).length;
    const evidence = rows.map((r) => ({
      id: r.id,
      version: r.version,
      revisionId: r.currentRevisionId,
      employeeId: r.employeeId,
      eligible: r.eligible,
    }));
    const evidenceHash = digest(JSON.stringify(evidence));
    const daily = await reconcileStationCount(tx, actorId, {
      ...data,
      count,
      sourceRef: `station:${hash.slice(0, 12)}:${data.employeeId}:${data.date}`,
    });
    const row = await tx.stationReconciliation.create({
      data: {
        stationHash: hash,
        employeeId: data.employeeId,
        date: data.date,
        dailyEmissionId: daily.id,
        countVersion: daily.version,
        evidenceHash,
        evidence: evidence as Prisma.InputJsonValue,
        reason: data.reason,
        createdBy: actorId,
      },
    });
    await audit(tx, actorId, "STATION_COUNT_RECONCILED", row.id, {
      ...data,
      count,
      evidenceHash,
      dailyEmissionId: daily.id,
    });
    return row;
  });
}
export async function currentRecords(tx: Tx, hash: string, start: string, end: string) {
  const records = await tx.stationRecord.findMany({
    where: {
      stationHash: hash,
      historicalOnly: false,
      state: { not: "SUPERSEDED" },
      revisions: { some: { businessDate: { gte: start, lte: end } } },
    },
    include: { revisions: { orderBy: { observedAt: "desc" } } },
    orderBy: { id: "asc" },
  });
  return records
    .map((r) => ({ ...r, source: r.revisions.find((v) => v.id === r.currentRevisionId)! }))
    .filter((r) => r.source && r.source.businessDate >= start && r.source.businessDate <= end);
}
export async function recordDetail(actorId: string, recordId: string) {
  return stationTransaction(actorId, async (tx, hash) => {
    const record = await tx.stationRecord.findFirst({
      where: { id: recordId, stationHash: hash },
      include: { revisions: { orderBy: { observedAt: "desc" } } },
    });
    requireRule(record, "Station record not found.");
    const employees = await tx.employee.findMany({
      select: { id: true, user: { select: { name: true } } },
    });
    const source = record.revisions.find((r) => r.id === record.currentRevisionId);
    const services = source
      ? await tx.dealerService.findMany({
          where: { date: source.businessDate, voidDate: null },
          select: { id: true, reference: true, quantity: true, invoiceId: true },
        })
      : [];
    const entries = source
      ? await tx.financeEntry.findMany({
          where: {
            date: source.businessDate,
            voidDate: null,
            basis: "MANUAL",
            direction: "REVENUE",
          },
          select: { id: true, reference: true, verifiedAt: true },
        })
      : [];
    const candidates = source
      ? await tx.stationRecord.findMany({
          where: {
            stationHash: hash,
            state: { not: "SUPERSEDED" },
            id: { not: recordId },
            revisions: { some: { vehicleHash: source.vehicleHash } },
          },
          select: { id: true, version: true },
        })
      : [];
    return { record, employees, services, entries, candidates };
  });
}
export const reportRange = (input: unknown) => {
  const d = z
    .object({ start: dateString, end: dateString, employeeId: z.string().max(100).optional() })
    .parse(input);
  range(d.start, d.end);
  requireRule(d.end <= businessDate(), "Choose a range ending no later than today.");
  return d;
};
