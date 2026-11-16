import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { businessDate, addDays } from "@/lib/time";
import { dateString } from "@/lib/validation";
import { phase4, financeRoles, audit, requireRule, type Tx } from "../phase4";
import { stationConfig } from "../station/service";
import { createInvoiceInTransaction } from "./service";
import {
  cleanVirIdentifier,
  virReportKey,
  virReviewSchema,
  virTestKey,
  type StoredVirRow,
} from "./dealer-vir-parser";
import type { DealerVirPreview, DealerVirResult } from "./dealer-vir-types";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const termsReady = (dealer: {
  termsAuthorizedAt: Date | null;
  termsDays: number | null;
  taxBps: number | null;
}) => !!dealer.termsAuthorizedAt && dealer.termsDays !== null && dealer.taxBps !== null;

export async function dealerVirOptions(actorId: string) {
  return phase4(actorId, financeRoles, (tx) =>
    tx.dealership.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  );
}

export async function beginDealerVirUpload(actorId: string, dealershipId: string) {
  return phase4(actorId, financeRoles, async (tx) => {
    requireRule(
      await tx.dealership.count({ where: { id: dealershipId, active: true } }),
      "Choose an active dealership.",
    );
    requireRule(
      !(await tx.dealerVirUpload.count({
        where: { status: "PROCESSING", createdAt: { gte: new Date(Date.now() - 6 * 60_000) } },
      })),
      "Another report upload is being processed. Please wait before starting a new upload.",
    );
    // Expired, uncommitted previews contain no billing records and can be discarded.
    await tx.dealerVirUpload.deleteMany({
      where: {
        createdBy: actorId,
        status: { in: ["REVIEW", "FAILED"] },
        expiresAt: { lt: new Date() },
      },
    });
    const upload = await tx.dealerVirUpload.create({
      data: {
        dealershipId,
        createdBy: actorId,
        rows: [],
        expiresAt: new Date(Date.now() + 2 * 60 * 60_000),
      },
    });
    return upload.id;
  });
}

async function annotateRows(tx: Tx, rows: StoredVirRow[]) {
  const existing = await tx.dealerVirRecord.findMany({
    where: {
      OR: [
        { reportKey: { in: rows.flatMap((row) => (row.reportKey ? [row.reportKey] : [])) } },
        { sourceKey: { in: rows.map((row) => row.sourceKey) } },
        {
          testKey: {
            in: rows.flatMap((row) =>
              virTestKey(row.testNumber) ? [virTestKey(row.testNumber)!] : [],
            ),
          },
        },
      ],
    },
    select: { reportKey: true, sourceKey: true, testKey: true },
  });
  const seen = new Set(
    existing.flatMap((row) => [
      row.reportKey,
      row.sourceKey,
      ...(row.testKey ? [row.testKey] : []),
    ]),
  );
  const vins = [...new Set(rows.flatMap((row) => (row.vinHash ? [row.vinHash] : [])))];
  const dates = rows
    .map((row) => row.date)
    .filter((date) => dateString.safeParse(date).success)
    .sort();
  const previousImported =
    vins.length && dates.length
      ? await tx.dealerVirRecord.findMany({
          where: {
            vinHash: { in: vins },
            date: { gte: addDays(dates[0], -30), lte: dates.at(-1)! },
          },
          select: { vinHash: true, date: true, minute: true, reportKey: true },
        })
      : [];
  // Existing Performance evidence provides the same station-wide 30-day lookback.
  const station = stationConfig();
  const evidence =
    vins.length && dates.length
      ? await tx.stationInspectionEvidence.findMany({
          where: {
            stationHash: station.hash,
            vinHash: { in: vins },
            businessDate: { gte: addDays(dates[0], -30), lte: dates.at(-1)! },
            record: { state: { not: "SUPERSEDED" } },
          },
          select: {
            vinHash: true,
            businessDate: true,
            revision: {
              select: { certificate: true, sourceDate: true },
            },
          },
        })
      : [];
  const assigned = rows.length
    ? await tx.stationRecord.findMany({
        where: {
          stationHash: station.hash,
          dealerServiceId: { not: null },
          revisions: {
            some: { certificate: { in: rows.map((row) => row.certificate).filter(Boolean) } },
          },
        },
        select: { revisions: { select: { certificate: true } } },
      })
    : [];
  const assignedCerts = new Set(
    assigned.flatMap((r) => r.revisions.map((v) => cleanVirIdentifier(v.certificate))),
  );
  return rows.map((row) => {
    const testKey = virTestKey(row.testNumber);
    const duplicate =
      seen.has(row.sourceKey) ||
      (!!testKey && seen.has(testKey)) ||
      (!!row.reportKey && (seen.has(row.reportKey) || assignedCerts.has(row.certificate)));
    if (row.reportKey) seen.add(row.reportKey);
    seen.add(row.sourceKey);
    if (testKey) seen.add(testKey);
    let freeRetest = row.feeCents === 0 || row.certificate === "RETEST";
    if (row.date && dateString.safeParse(row.date).success && row.vinHash) {
      const cutoff = addDays(row.date, -30);
      freeRetest ||= previousImported.some(
        (p) =>
          p.vinHash === row.vinHash &&
          p.date >= cutoff &&
          p.reportKey !== row.reportKey &&
          (p.date < row.date ||
            (p.date === row.date &&
              p.minute !== null &&
              row.minute !== null &&
              p.minute < row.minute)),
      );
      freeRetest ||= rows.some(
        (p) =>
          p.id !== row.id &&
          p.vinHash === row.vinHash &&
          p.date >= cutoff &&
          (p.date < row.date ||
            (p.date === row.date &&
              p.minute !== null &&
              row.minute !== null &&
              p.minute < row.minute)),
      );
      freeRetest ||= evidence.some((p) => {
        if (p.vinHash !== row.vinHash || p.businessDate < cutoff) return false;
        if (cleanVirIdentifier(p.revision.certificate) === row.certificate) return false;
        if (p.businessDate < row.date) return true;
        const time = p.revision.sourceDate.match(/(\d{1,2}):(\d{2})/);
        const minute = time ? Number(time[1]) * 60 + Number(time[2]) : null;
        return (
          p.businessDate === row.date &&
          minute !== null &&
          row.minute !== null &&
          minute < row.minute
        );
      });
    }
    return {
      ...row,
      duplicate,
      freeRetest,
      warnings: [
        ...row.warnings.filter(
          (warning) =>
            !warning.startsWith("Already recorded") && !warning.startsWith("Free retest"),
        ),
        ...(duplicate ? ["Already recorded. This report will be skipped."] : []),
        ...(freeRetest ? ["Free retest or zero-fee inspection. Not billable."] : []),
      ],
    };
  });
}

export async function finishDealerVirUpload(
  actorId: string,
  uploadId: string,
  rows: StoredVirRow[],
): Promise<DealerVirPreview> {
  return phase4(actorId, financeRoles, async (tx) => {
    const upload = await tx.dealerVirUpload.findFirst({
      where: { id: uploadId, createdBy: actorId, status: "PROCESSING" },
      include: { dealership: true },
    });
    requireRule(upload && upload.dealership.active, "This upload is no longer available.");
    requireRule(rows.length > 0 && rows.length <= 40, "Upload between 1 and 40 VIR pages.");
    const annotated = await annotateRows(tx, rows);
    await tx.dealerVirUpload.update({
      where: { id: upload.id },
      data: {
        rows: json(annotated),
        status: "REVIEW",
        billingVersion: upload.dealership.version,
      },
    });
    return {
      uploadId,
      dealershipId: upload.dealershipId,
      expiresAt: upload.expiresAt.toISOString(),
      rows: annotated.map(
        ({
          vinHash: _vinHash,
          reportKey: _reportKey,
          minute: _minute,
          sourceKey: _sourceKey,
          ...row
        }) => row,
      ),
      rateCents: upload.dealership.defaultRateCents,
      taxBps: upload.dealership.taxBps,
      termsReady: termsReady(upload.dealership),
      issueDate: businessDate(),
    };
  });
}

export async function failDealerVirUpload(actorId: string, uploadId: string) {
  return phase4(actorId, financeRoles, (tx) =>
    tx.dealerVirUpload.updateMany({
      where: { id: uploadId, createdBy: actorId, status: "PROCESSING" },
      data: { status: "FAILED" },
    }),
  );
}

export async function commitDealerVirUpload(
  actorId: string,
  input: unknown,
): Promise<DealerVirResult> {
  const data = virReviewSchema.parse(input);
  return phase4(actorId, financeRoles, async (tx) => {
    const upload = await tx.dealerVirUpload.findFirst({
      where: { id: data.uploadId, dealershipId: data.dealershipId, createdBy: actorId },
      include: { dealership: true },
    });
    requireRule(upload, "Upload not found.");
    if (upload.status === "COMPLETED") return upload.result as DealerVirResult;
    requireRule(
      upload.status === "REVIEW" && upload.expiresAt > new Date(),
      "This upload expired. Upload the PDFs again.",
    );
    requireRule(upload.dealership.active, "This dealership is archived.");
    requireRule(data.issueDate <= businessDate(), "Invoice date cannot be in the future.");
    const originals = upload.rows as unknown as StoredVirRow[];
    requireRule(
      data.rows.length === originals.length &&
        new Set(data.rows.map((row) => row.id)).size === originals.length &&
        data.rows.every((row) => originals.some((original) => original.id === row.id)),
      "The report list changed. Upload the PDFs again.",
    );
    const merged = originals.map((original) => {
      const review = data.rows.find((row) => row.id === original.id)!;
      if (review.billing === "EXCLUDE")
        return { ...original, billing: review.billing, confirmed: review.confirmed };
      requireRule(review.confirmed, `Confirm the reviewed fields for ${original.source}.`);
      const date = dateString.parse(review.date);
      requireRule(date <= businessDate(), "Inspection dates cannot be in the future.");
      if (data.createDraft)
        requireRule(
          date <= data.issueDate,
          "Invoice date must be on or after every included inspection.",
        );
      const certificate = cleanVirIdentifier(review.certificate);
      const testNumber = cleanVirIdentifier(review.testNumber);
      requireRule(
        virReportKey(certificate, testNumber),
        `Enter a unique certificate number or Test ID for ${original.source}.`,
      );
      requireRule(
        review.outcome !== "UNKNOWN",
        `Choose the inspection result for ${original.source}.`,
      );
      requireRule(review.testType !== "UNKNOWN", `Choose the test type for ${original.source}.`);
      return {
        ...original,
        ...review,
        date,
        certificate,
        testNumber,
        reportKey: virReportKey(certificate, testNumber),
      };
    });
    const annotated = await annotateRows(
      tx,
      merged.filter((row) => row.billing !== "EXCLUDE"),
    );
    const states = new Map(annotated.map((row) => [row.id, row]));
    const accepted = merged.filter(
      (row) => row.billing !== "EXCLUDE" && !states.get(row.id)?.duplicate,
    );
    requireRule(
      accepted.length > 0,
      "No new inspections selected. Duplicates cannot be imported again.",
    );
    for (const row of accepted) {
      if (row.billing === "BILL") {
        requireRule(
          !states.get(row.id)?.freeRetest,
          `${row.source} is a free retest. Mark it Free or Exclude.`,
        );
        requireRule(
          row.outcome === "PASS" || row.outcome === "FAIL",
          "Only completed Pass/Fail inspections can be billed.",
        );
      }
    }
    const billable = accepted.filter((row) => row.billing === "BILL");
    const rate = upload.dealership.defaultRateCents;
    if (billable.length)
      requireRule(
        upload.billingVersion === upload.dealership.version,
        "The dealership billing settings changed during review. Upload the reports again to review the current rate.",
      );
    if (billable.length)
      requireRule(
        rate !== null && rate > 0,
        "Set the dealership service rate before importing billable inspections.",
      );
    if (data.createDraft) {
      requireRule(billable.length > 0, "An invoice needs at least one billable inspection.");
      requireRule(
        termsReady(upload.dealership),
        "Authorize the dealership billing terms and tax before creating a draft.",
      );
    }
    const groups = new Map<string, typeof billable>();
    for (const row of billable) groups.set(row.date, [...(groups.get(row.date) ?? []), row]);
    const serviceIds: string[] = [];
    const serviceByDate = new Map<string, string>();
    for (const [date, group] of groups) {
      const service = await tx.dealerService.create({
        data: {
          dealershipId: data.dealershipId,
          date,
          description: "Emissions inspections",
          quantity: group.length,
          unitCents: rate!,
          reference: `VIR-${upload.id}-${date}`,
          evidence: `${group.length} reviewed VIR report(s). Upload ${upload.id}.`,
          createdBy: actorId,
        },
      });
      serviceIds.push(service.id);
      serviceByDate.set(date, service.id);
      await audit(tx, actorId, "DEALER_SERVICE", service.id, {
        source: "VIR_UPLOAD",
        uploadId: upload.id,
        quantity: group.length,
      });
    }
    for (const row of accepted) {
      await tx.dealerVirRecord.create({
        data: {
          uploadId: upload.id,
          dealershipId: data.dealershipId,
          reportKey: row.reportKey!,
          sourceKey: row.sourceKey,
          testKey: virTestKey(row.testNumber),
          certificate: row.certificate,
          testNumber: row.testNumber,
          date: row.date,
          minute: row.minute,
          vinHash: row.vinHash,
          outcome: row.outcome,
          testType: row.testType,
          billing: row.billing,
          serviceId: row.billing === "BILL" ? serviceByDate.get(row.date) : null,
          createdBy: actorId,
        },
      });
    }
    const invoice = data.createDraft
      ? await createInvoiceInTransaction(tx, actorId, {
          dealershipId: data.dealershipId,
          number:
            data.invoiceNumber ||
            `VIR-${data.issueDate.replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`,
          issueDate: data.issueDate,
          serviceIds,
          notes: `Created from ${billable.length} reviewed VIR reports.`,
        })
      : null;
    const result: DealerVirResult = {
      saved: accepted.length,
      billable: billable.length,
      free: accepted.length - billable.length,
      skipped: merged.length - accepted.length,
      invoiceId: invoice?.id ?? null,
      invoiceNumber: invoice?.number ?? null,
    };
    await tx.dealerVirUpload.update({
      where: { id: upload.id },
      data: { status: "COMPLETED", completedAt: new Date(), result: json(result), rows: [] },
    });
    await audit(tx, actorId, "DEALER_VIR_IMPORTED", upload.id, {
      ...result,
      dealershipId: data.dealershipId,
    });
    return result;
  });
}
