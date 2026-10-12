import { Prisma } from "@prisma/client";
import { z } from "zod";
import { phase4, audit, requireRule, type Tx } from "../phase4";
import { businessDate } from "@/lib/time";
import { dateString, id } from "@/lib/validation";
import { stationConfig } from "../station/service";
import {
  campaignInput,
  promoInput,
  stationList,
  label,
  notes,
  cents,
  version,
  optionalId,
  sources,
} from "./rules";
import { buildReport, reportInput } from "./reporting";

export const marketingRoles = ["OWNER", "ADMIN"] as const;
export async function marketingTransaction<T>(
  actorId: string,
  ownerOnly: boolean,
  work: (tx: Tx) => Promise<T>,
) {
  return phase4(actorId, ownerOnly ? ["OWNER"] : ["OWNER", "ADMIN"], async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183518)`;
    return work(tx);
  });
}
export function validateStations(values: unknown) {
  const stations = stationList.parse(values);
  requireRule(
    stations.every((s) => s === stationConfig().hash),
    "Choose the configured station. Multi-station access is not configured.",
  );
  return stations;
}
async function campaignAt(
  tx: Tx,
  campaignId: string,
  stationHash: string,
  date: string,
  active = false,
) {
  const row = await tx.marketingCampaign.findUnique({ where: { id: campaignId } });
  requireRule(
    row && Array.isArray(row.stationHashes) && row.stationHashes.includes(stationHash),
    "Campaign is not available at this station.",
  );
  requireRule(date >= row.startDate && date <= row.endDate, "Date is outside the campaign period.");
  if (active) requireRule(row.status === "ACTIVE", "Campaign must be active.");
  return row;
}
export async function saveCampaign(actorId: string, input: unknown) {
  const { id: key, version: v, ...data } = campaignInput.parse(input);
  validateStations(data.stationHashes);
  return marketingTransaction(actorId, true, async (tx) => {
    const before = key ? await tx.marketingCampaign.findUnique({ where: { id: key } }) : null;
    requireRule(!key || before?.version === v, "Campaign changed. Refresh and try again.");
    if (before) validateStations(before.stationHashes);
    requireRule(
      !before || before.status !== "ARCHIVED" || data.status === "ARCHIVED",
      "Archived campaigns retain their history. Create a new campaign.",
    );
    if (key) {
      const observations = await tx.marketingObservation.findMany({ where: { campaignId: key } });
      const promos = await tx.marketingPromo.findMany({ where: { campaignId: key } });
      const expenses = await tx.marketingExpense.findMany({ where: { campaignId: key } });
      requireRule(
        expenses.every(
          (e) =>
            e.date >= data.startDate &&
            e.date <= data.endDate &&
            data.stationHashes.includes(e.stationHash),
        ),
        "Campaign dates/stations cannot exclude recorded expenses.",
      );
      requireRule(
        observations.every(
          (o) =>
            o.date >= data.startDate &&
            o.date <= data.endDate &&
            data.stationHashes.includes(o.stationHash),
        ),
        "Campaign dates/stations cannot exclude existing attribution.",
      );
      requireRule(
        promos.every(
          (p) =>
            p.startDate >= data.startDate &&
            p.endDate <= data.endDate &&
            (p.stationHashes as string[]).every((s) => data.stationHashes.includes(s)),
        ),
        "Campaign must continue to contain its promo terms.",
      );
    }
    const row = key
      ? await tx.marketingCampaign.update({
          where: { id: key },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.marketingCampaign.create({ data: { ...data, createdBy: actorId } });
    await audit(tx, actorId, "MARKETING_CAMPAIGN_SAVED", row.id, { before, ...data });
    return row;
  });
}
export async function archiveCampaign(actorId: string, input: unknown) {
  const data = z.object({ id, version }).parse(input);
  return marketingTransaction(actorId, true, async (tx) => {
    const row = await tx.marketingCampaign.findUnique({ where: { id: data.id } });
    requireRule(row?.version === data.version, "Campaign changed. Refresh.");
    validateStations(row.stationHashes);
    await tx.marketingCampaign.update({
      where: { id: data.id },
      data: { status: "ARCHIVED", version: { increment: 1 } },
    });
    await audit(tx, actorId, "MARKETING_CAMPAIGN_ARCHIVED", data.id, {
      previousStatus: row.status,
    });
  });
}
export async function recordExpense(actorId: string, input: unknown) {
  const data = z
    .object({
      campaignId: id,
      stationHash: id,
      date: dateString,
      amountCents: cents.refine((v) => v > 0),
      description: label,
      reference: label,
    })
    .parse(input);
  validateStations([data.stationHash]);
  return marketingTransaction(actorId, true, async (tx) => {
    requireRule(data.date <= businessDate(), "Spending must have a current or past date.");
    const campaign = await campaignAt(tx, data.campaignId, data.stationHash, data.date);
    requireRule(campaign.status !== "ARCHIVED", "Archived campaigns cannot accept new spending.");
    requireRule(
      !(await tx.marketingExpense.count({ where: { reference: data.reference } })),
      "Expense reference already exists.",
    );
    const row = await tx.marketingExpense.create({ data: { ...data, createdBy: actorId } });
    await audit(tx, actorId, "MARKETING_EXPENSE_RECORDED", row.id, data);
    return row;
  });
}
export async function voidExpense(actorId: string, input: unknown) {
  const data = z.object({ id, reason: label }).parse(input);
  return marketingTransaction(actorId, true, async (tx) => {
    const row = await tx.marketingExpense.findUnique({ where: { id: data.id } });
    requireRule(row && !row.voidedAt, "Expense already voided or missing.");
    validateStations([row.stationHash]);
    await tx.marketingExpense.update({
      where: { id: row.id },
      data: { voidedAt: new Date(), voidReason: data.reason },
    });
    await audit(tx, actorId, "MARKETING_EXPENSE_VOIDED", row.id, data);
  });
}
export async function savePromo(actorId: string, input: unknown) {
  const { id: key, version: v, ...data } = promoInput.parse(input);
  validateStations(data.stationHashes);
  return marketingTransaction(actorId, true, async (tx) => {
    const c = await campaignAt(tx, data.campaignId, data.stationHashes[0], data.startDate);
    requireRule(
      c.status !== "ARCHIVED" && data.endDate <= c.endDate,
      "Promo must fit a non-archived campaign.",
    );
    const before = key
      ? await tx.marketingPromo.findUnique({
          where: { id: key },
          include: { _count: { select: { redemptions: true } } },
        })
      : null;
    requireRule(!key || before?.version === v, "Promo changed. Refresh.");
    requireRule(
      !(await tx.marketingPromo.count({
        where: { code: data.code, ...(key ? { id: { not: key } } : {}) },
      })),
      "Promo code already exists, including archived codes.",
    );
    if (before?._count.redemptions) {
      requireRule(
        ["campaignId", "code", "kind", "value", "startDate", "endDate", "usageLimit"].every(
          (k) =>
            JSON.stringify(data[k as keyof typeof data]) ===
            JSON.stringify(before[k as keyof typeof before]),
        ) && JSON.stringify(data.stationHashes) === JSON.stringify(before.stationHashes),
        "Redeemed offer terms are frozen. Create a new code; you may still deactivate this one.",
      );
    }
    const row = key
      ? await tx.marketingPromo.update({
          where: { id: key },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.marketingPromo.create({ data: { ...data, createdBy: actorId } });
    await audit(tx, actorId, "MARKETING_PROMO_SAVED", row.id, { before, ...data });
    return row;
  });
}
export async function recordSource(actorId: string, input: unknown) {
  const data = z
    .object({
      recordId: id,
      version,
      source: z.union([z.enum(sources), z.literal("")]).transform((v) => v || null),
      campaignId: optionalId,
      evidence: notes,
    })
    .parse(input);
  return marketingTransaction(actorId, true, async (tx) => {
    const record = await tx.stationRecord.findUnique({
      where: { id: data.recordId },
      include: { revisions: true },
    });
    requireRule(
      record && record.stationHash === stationConfig().hash && record.state !== "SUPERSEDED",
      "Choose current station evidence.",
    );
    const revision = record.revisions.find((r) => r.id === record.currentRevisionId);
    requireRule(revision, "No current source revision.");
    requireRule(
      !data.campaignId || (data.source !== null && data.source !== "UNKNOWN"),
      "Unknown or missing responses cannot be assigned to a campaign.",
    );
    if (data.campaignId)
      await campaignAt(tx, data.campaignId, record.stationHash, revision.businessDate);
    const previous = await tx.marketingObservation.findUnique({ where: { recordId: record.id } });
    requireRule((previous?.version ?? 0) === data.version, "Source response changed. Refresh.");
    const saved = {
      source: data.source,
      campaignId: data.campaignId ?? null,
      evidence: data.evidence,
      date: revision.businessDate,
      stationHash: record.stationHash,
    };
    const row = previous
      ? await tx.marketingObservation.update({
          where: { id: previous.id },
          data: { ...saved, version: { increment: 1 } },
        })
      : await tx.marketingObservation.create({
          data: { ...saved, recordId: record.id, createdBy: actorId },
        });
    await audit(tx, actorId, "MARKETING_SOURCE_RECORDED", row.id, {
      ...saved,
      recordId: record.id,
    });
    return row;
  });
}
export async function saveAction(actorId: string, input: unknown) {
  const data = z
    .object({
      id: optionalId,
      version,
      campaignId: id,
      title: label,
      rationale: label,
      periodStart: dateString,
      periodEnd: dateString,
      reviewDate: dateString,
      status: z.enum(["PLANNED", "DONE", "REVIEWED"]).default("PLANNED"),
      resultNotes: notes,
    })
    .refine((v) => v.periodEnd >= v.periodStart, "Review the period dates.")
    .parse(input);
  return marketingTransaction(actorId, true, async (tx) => {
    const campaign = await tx.marketingCampaign.findUnique({ where: { id: data.campaignId } });
    requireRule(campaign, "Campaign not found.");
    validateStations(campaign.stationHashes);
    const before = data.id ? await tx.marketingAction.findUnique({ where: { id: data.id } }) : null;
    requireRule(!data.id || before?.version === data.version, "Action changed. Refresh.");
    requireRule(
      !before || before.campaignId === data.campaignId,
      "Action belongs to another campaign.",
    );
    requireRule(
      data.status !== "REVIEWED" || !!data.resultNotes,
      "Add your review findings before marking reviewed.",
    );
    const { id: key, ...saved } = data;
    const metrics = await buildReport(
      tx,
      reportInput.parse({
        start: data.periodStart,
        end: data.periodEnd,
        campaignId: data.campaignId,
      }),
      stationConfig().hash,
    );
    const baseline = asJson({
      recordedAt: new Date().toISOString(),
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      spendingCents: metrics.spendingCents,
      attributedPaidInspections: metrics.attributedPaidInspections,
      collectedCents: metrics.collectedCents,
      coverage: metrics.coverage,
    });
    const row = key
      ? await tx.marketingAction.update({
          where: { id: key },
          data: {
            status: saved.status,
            resultNotes: saved.resultNotes,
            reviewDate: saved.reviewDate,
            version: { increment: 1 },
          },
        })
      : await tx.marketingAction.create({
          data: { ...saved, version: 0, baseline, createdBy: actorId },
        });
    await audit(tx, actorId, "MARKETING_ACTION_SAVED", row.id, {
      ...saved,
      baseline: before?.baseline ?? baseline,
    });
    return row;
  });
}
export type UploadedMaterial = {
  objectPath: string;
  filename: string;
  mimeType: string;
  byteSize: number;
};
export async function saveMaterial(actorId: string, input: unknown, upload?: UploadedMaterial) {
  const data = z.object({ campaignId: id, title: label, copy: notes }).parse(input);
  requireRule(!!data.copy || !!upload, "Add copy or upload a file.");
  return marketingTransaction(actorId, true, async (tx) => {
    const campaign = await tx.marketingCampaign.findUnique({ where: { id: data.campaignId } });
    requireRule(campaign && campaign.status !== "ARCHIVED", "Choose a non-archived campaign.");
    validateStations(campaign.stationHashes);
    const row = await tx.marketingMaterial.create({
      data: { ...data, ...upload, createdBy: actorId },
    });
    await audit(tx, actorId, "MARKETING_MATERIAL_DRAFT", row.id, {
      campaignId: data.campaignId,
      title: data.title,
      file: !!upload,
    });
    return row;
  });
}
export async function reviewMaterial(actorId: string, input: unknown) {
  const data = z.object({ id, version, status: z.enum(["APPROVED", "ARCHIVED"]) }).parse(input);
  return marketingTransaction(actorId, true, async (tx) => {
    const row = await tx.marketingMaterial.findUnique({
      where: { id: data.id },
      include: { campaign: true },
    });
    requireRule(row?.version === data.version, "Material changed. Refresh.");
    validateStations(row.campaign.stationHashes);
    requireRule(
      data.status !== "APPROVED" || row.status === "DRAFT",
      "Only a draft can be approved.",
    );
    await tx.marketingMaterial.update({
      where: { id: row.id },
      data: {
        status: data.status,
        version: { increment: 1 },
        ...(data.status === "APPROVED" ? { approvedBy: actorId, approvedAt: new Date() } : {}),
      },
    });
    await audit(tx, actorId, "MARKETING_MATERIAL_REVIEWED", row.id, data);
  });
}
export async function materialForActor(actorId: string, key: string) {
  return marketingTransaction(actorId, false, async (tx) => {
    const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
    const row = await tx.marketingMaterial.findUnique({
      where: { id: key },
      include: { campaign: true },
    });
    requireRule(
      row && (actor.role === "OWNER" || row.status === "APPROVED"),
      "Material not available.",
    );
    validateStations(row.campaign.stationHashes);
    return row;
  });
}
export const asJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function marketingOverview(actorId: string, input: unknown) {
  const q = reportInput.parse(input);
  const station = stationConfig();
  if (q.stationHash) validateStations([q.stationHash]);
  return marketingTransaction(actorId, false, async (tx) => {
    const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
    const campaigns = await tx.marketingCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        expenses: { orderBy: { date: "desc" } },
        promos: {
          orderBy: { createdAt: "desc" },
          include: { _count: { select: { redemptions: true } } },
        },
        actions: { orderBy: { reviewDate: "asc" } },
        materials: {
          where: actor.role === "OWNER" ? {} : { status: "APPROVED" },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    const allowed = campaigns.filter(
      (c) => Array.isArray(c.stationHashes) && c.stationHashes.includes(station.hash),
    );
    const records =
      actor.role === "OWNER"
        ? await tx.stationRecord.findMany({
            where: { stationHash: station.hash, state: { not: "SUPERSEDED" } },
            include: {
              revisions: { where: { businessDate: { gte: q.start, lte: q.end } } },
              marketingObservation: true,
            },
            orderBy: { id: "asc" },
          })
        : [];
    const serviceRecords = await tx.dealerService.findMany({
      where: { quantity: 1, date: { gte: q.start, lte: q.end }, voidDate: null },
      include: { marketingObservation: true },
      orderBy: { date: "desc" },
    });
    const report = await buildReport(tx, q, station.hash);
    return {
      isOwner: actor.role === "OWNER",
      station: { hash: station.hash, label: station.station },
      query: q,
      campaigns: allowed,
      report,
      records: records.flatMap((r) => {
        const rev = r.revisions.find((v) => v.id === r.currentRevisionId);
        return rev
          ? [
              {
                id: r.id,
                date: rev.businessDate,
                outcome: rev.outcome,
                certificate: rev.certificate,
                observation: r.marketingObservation,
              },
            ]
          : [];
      }),
      serviceRecords: serviceRecords.map((s) => ({
        id: s.id,
        date: s.date,
        reference: s.reference,
        description: s.description,
        observation: s.marketingObservation,
      })),
      analytics: {
        connected: false as const,
        reason:
          "No authorized Google Business Profile analytics or review connection is configured. Profile interactions are not inspections or collected sales.",
      },
    };
  });
}
export type MarketingOverview = Awaited<ReturnType<typeof marketingOverview>>;

export async function recordServiceSource(actorId: string, input: unknown) {
  const data = z
    .object({
      serviceId: id,
      version,
      source: z.union([z.enum(sources), z.literal("")]).transform((v) => v || null),
      campaignId: optionalId,
      inspectionKind: z.enum(["PAID", "UNKNOWN", "OTHER"]),
      evidence: notes,
    })
    .parse(input);
  return marketingTransaction(actorId, false, async (tx) => {
    const svc = await tx.dealerService.findUnique({ where: { id: data.serviceId } });
    requireRule(svc && svc.quantity === 1 && !svc.voidDate, "Choose an active single service.");
    requireRule(
      data.inspectionKind !== "PAID" || !!data.evidence,
      "Paid inspection classification needs supporting evidence.",
    );
    const hash = stationConfig().hash;
    requireRule(
      !data.campaignId || (data.source && data.source !== "UNKNOWN"),
      "Unknown/missing sources cannot be attributed.",
    );
    if (data.campaignId) await campaignAt(tx, data.campaignId, hash, svc.date);
    const previous = await tx.marketingObservation.findUnique({ where: { serviceId: svc.id } });
    const redemption = await tx.marketingRedemption.findUnique({ where: { serviceId: svc.id } });
    requireRule(
      !redemption || data.inspectionKind === "PAID",
      "A charged redeemed inspection cannot be reclassified here. Correct its service/payment record first.",
    );
    requireRule((previous?.version ?? 0) === data.version, "Source response changed. Refresh.");
    const saved = {
      source: data.source,
      campaignId: data.campaignId ?? null,
      inspectionKind: data.inspectionKind,
      evidence: data.evidence,
      date: svc.date,
      stationHash: hash,
    };
    const row = previous
      ? await tx.marketingObservation.update({
          where: { id: previous.id },
          data: { ...saved, version: { increment: 1 } },
        })
      : await tx.marketingObservation.create({
          data: { ...saved, serviceId: svc.id, createdBy: actorId },
        });
    await audit(tx, actorId, "MARKETING_SOURCE_RECORDED", row.id, { serviceId: svc.id, ...saved });
  });
}

export async function marketingOptions(actorId: string) {
  return marketingTransaction(actorId, false, async (tx) => {
    const station = stationConfig();
    const campaigns = await tx.marketingCampaign.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: {
        id: true,
        name: true,
        stationHashes: true,
        startDate: true,
        endDate: true,
        status: true,
      },
      orderBy: { name: "asc" },
    });
    return {
      station,
      campaigns: campaigns.filter(
        (c) => Array.isArray(c.stationHashes) && c.stationHashes.includes(station.hash),
      ),
    };
  });
}
export async function recordSourceDetail(actorId: string, recordId: string) {
  return marketingTransaction(actorId, true, async (tx) => {
    const record = await tx.stationRecord.findUnique({
      where: { id: recordId },
      include: { marketingObservation: true },
    });
    requireRule(record?.stationHash === stationConfig().hash, "Station evidence is not available.");
    return record.marketingObservation;
  });
}
