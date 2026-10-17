import type { Tx } from "../phase4";
import { z } from "zod";
import { dateString } from "@/lib/validation";
import { addDays, businessDate } from "@/lib/time";
import { channels, inspectionKind, lineReceipts, sourceLabels, sumMoney } from "./rules";

export const reportInput = z
  .object({
    start: dateString,
    end: dateString,
    stationHash: z.string().max(100).optional(),
    campaignId: z
      .string()
      .max(100)
      .optional()
      .transform((v) => v || undefined),
    channel: z
      .union([z.enum(channels), z.literal("")])
      .optional()
      .transform((v) => v || undefined),
  })
  .refine(
    (v) => v.end >= v.start && v.end <= addDays(v.start, 365),
    "Choose a date range of at most 366 days.",
  );

export async function buildReport(tx: Tx, query: z.infer<typeof reportInput>, hash: string) {
  const campaigns = await tx.marketingCampaign.findMany();
  const selected = new Set(
    campaigns
      .filter(
        (c) =>
          (!query.campaignId || c.id === query.campaignId) &&
          (!query.channel || c.channel === query.channel) &&
          Array.isArray(c.stationHashes) &&
          c.stationHashes.includes(hash),
      )
      .map((c) => c.id),
  );
  const filter = !!query.campaignId || !!query.channel;
  const records = await tx.stationRecord.findMany({
    where: { stationHash: hash, historicalOnly: false, state: { not: "SUPERSEDED" } },
    include: { revisions: true, marketingObservation: true },
  });
  const services = await tx.dealerService.findMany({
    include: {
      marketingObservation: true,
      promoRedemption: { include: { promo: true } },
      lines: { include: { invoice: { include: { payments: true } } } },
    },
  });
  const serviceMap = new Map(services.map((s) => [s.id, s]));
  const history = records.flatMap((r) => {
    const revision = r.revisions.find((v) => v.id === r.currentRevisionId);
    return revision
      ? [
          {
            id: r.id,
            date: revision.businessDate,
            time: revision.sourceDate,
            vin: revision.vehicleHash,
            outcome: revision.outcome,
          },
        ]
      : [];
  });
  const imports = await tx.stationImport.findMany({
    where: { stationHash: hash, coverage: "OWNER_ATTESTED", reviewedAt: { not: null } },
    include: { revisions: { include: { record: true } } },
  });
  const completeDates = new Set<string>();
  for (const i of imports) {
    // Protect against malformed external legacy coverage ranges.
    for (let d = i.startDate, n = 0; d <= i.endDate && n < 4000; d = addDays(d, 1), n++) {
      const reviewed = i.revisions
        .filter((r) => r.businessDate === d)
        .every((r) => r.record.state === "CONFIRMED" && r.record.currentRevisionId === r.id);
      const noNewRevisions = records
        .flatMap((r) => r.revisions)
        .filter((r) => r.businessDate === d)
        .every((r) => r.observedAt <= i.reviewedAt!);
      if (reviewed && noNewRevisions) completeDates.add(d);
    }
  }
  const visits = new Map<
    string,
    {
      key: string;
      date: string;
      source: string | null;
      campaignId: string | null;
      automaticCampaignId: string | null;
      kind: string;
      serviceId: string | null;
      financeEntryId: string | null;
    }
  >();
  for (const r of records) {
    const h = history.find((h) => h.id === r.id);
    if (!h || r.state !== "CONFIRMED") continue;
    const svc = r.dealerServiceId ? serviceMap.get(r.dealerServiceId) : undefined;
    const observations = [svc?.marketingObservation, r.marketingObservation].filter(
      (o): o is NonNullable<typeof o> => !!o,
    );
    const obs = observations.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    const key = svc ? `service:${svc.id}` : `record:${r.id}`;
    const derived = inspectionKind(h, history, completeDates);
    const kind =
      derived === "FREE"
        ? "FREE"
        : derived === "OTHER"
          ? "OTHER"
          : derived === "PAID"
            ? "PAID"
            : "UNKNOWN";
    visits.set(key, {
      key,
      date: h.date,
      source: obs?.source ?? null,
      campaignId: obs?.campaignId ?? null,
      automaticCampaignId: svc?.promoRedemption?.promo.campaignId ?? null,
      kind,
      serviceId: svc?.id ?? null,
      financeEntryId: svc ? null : r.financeEntryId,
    });
  }
  for (const s of services) {
    const o = s.marketingObservation;
    if (!o || o.stationHash !== hash || visits.has(`service:${s.id}`)) continue;
    visits.set(`service:${s.id}`, {
      key: `service:${s.id}`,
      date: s.date,
      source: o.source,
      campaignId: o.campaignId,
      automaticCampaignId: s.promoRedemption?.promo.campaignId ?? null,
      kind: o.inspectionKind,
      serviceId: s.id,
      financeEntryId: null,
    });
  }
  const inPeriod = (date: string) => date >= query.start && date <= query.end;
  const activeVisit = (v: typeof visits extends Map<string, infer V> ? V : never) => {
    const s = v.serviceId ? serviceMap.get(v.serviceId) : null;
    return !s?.voidDate || s.voidDate > query.end;
  };
  const all = [...visits.values()].filter((v) => inPeriod(v.date) && activeVisit(v));
  const effectiveCampaign = (v: (typeof all)[number]) => v.automaticCampaignId ?? v.campaignId;
  const matches = (v: (typeof all)[number]) =>
    !filter || (!!effectiveCampaign(v) && selected.has(effectiveCampaign(v)!));
  const attributed = all.filter((v) => matches(v) && !!effectiveCampaign(v));
  const paid = attributed.filter((v) => v.kind === "PAID");
  const expenses = await tx.marketingExpense.findMany({
    where: {
      stationHash: hash,
      date: { gte: query.start, lte: query.end },
      campaignId: { in: [...selected] },
    },
  });
  const spendingCents = sumMoney(
    expenses
      .filter((e) => !e.voidedAt || businessDate(e.voidedAt) > query.end)
      .map((e) => e.amountCents),
  );
  let collectedCents = 0,
    receiptLinkedPaid = 0;
  for (const v of visits.values()) {
    const cid = effectiveCampaign(v);
    if (!cid || !selected.has(cid) || !v.serviceId || v.kind !== "PAID") continue;
    const s = serviceMap.get(v.serviceId);
    if (!s) continue;
    if (inPeriod(v.date) && s.lines.length) receiptLinkedPaid++;
    for (const line of s.lines) {
      const i = line.invoice;
      if (i.issueDate > query.end || (i.voidDate && i.voidDate <= query.end)) continue;
      const endNet = sumMoney(
        i.payments.filter((p) => p.date <= query.end).map((p) => p.amountCents),
      );
      const startNet = sumMoney(
        i.payments.filter((p) => p.date < query.start).map((p) => p.amountCents),
      );
      collectedCents = sumMoney([
        collectedCents,
        lineReceipts(line.amountCents, i.totalCents, endNet) -
          lineReceipts(line.amountCents, i.totalCents, startNet),
      ]);
    }
  }
  const invoiceCollectedCents = collectedCents;
  let verifiedRetailCollectedCents = 0;
  const usedRetailEntries = new Set<string>();
  const retailReceipts = await tx.financeEntry.findMany({
    where: {
      direction: "REVENUE",
      basis: "MANUAL",
      verifiedAt: { not: null },
      date: { gte: query.start, lte: query.end },
    },
  });
  for (const v of visits.values()) {
    const cid = effectiveCampaign(v);
    if (
      !cid ||
      !selected.has(cid) ||
      v.kind !== "PAID" ||
      !v.financeEntryId ||
      usedRetailEntries.has(v.financeEntryId)
    )
      continue;
    const entry = retailReceipts.find((e) => e.id === v.financeEntryId);
    if (!entry || (entry.voidDate && entry.voidDate <= query.end)) continue;
    const linked = await tx.stationRecord.count({
      where: { financeEntryId: entry.id, state: "CONFIRMED" },
    });
    // Aggregated or duplicated cash evidence is not a per-inspection receipt.
    if (linked !== 1) continue;
    usedRetailEntries.add(entry.id);
    verifiedRetailCollectedCents = sumMoney([verifiedRetailCollectedCents, entry.amountCents]);
    if (inPeriod(v.date)) receiptLinkedPaid++;
  }
  collectedCents = sumMoney([collectedCents, verifiedRetailCollectedCents]);
  const redemptions = services.flatMap((s) => {
    const r = s.promoRedemption;
    if (!r || r.stationHash !== hash || !selected.has(r.promo.campaignId) || !inPeriod(r.date))
      return [];
    const currentLines = s.lines.filter(
      (l) => !l.invoice.voidDate || l.invoice.voidDate > query.end,
    );
    const canceled =
      (!!s.voidDate && s.voidDate <= query.end) ||
      (!!s.invoiceId &&
        !currentLines.length &&
        s.lines.some((l) => !!l.invoice.voidDate && l.invoice.voidDate <= query.end));
    const reversed = currentLines.some((l) =>
      l.invoice.payments.some((p) => p.amountCents < 0 && p.date <= query.end),
    );
    const net = currentLines.reduce(
      (n, l) =>
        n +
        sumMoney(l.invoice.payments.filter((p) => p.date <= query.end).map((p) => p.amountCents)),
      0,
    );
    return [
      {
        id: r.id,
        serviceId: s.id,
        reference: s.reference,
        code: r.promo.code,
        campaignId: r.promo.campaignId,
        date: r.date,
        discountCents: r.discountCents,
        finalCents: r.finalCents,
        status: canceled
          ? "CANCELLED"
          : reversed
            ? net <= 0
              ? "REFUNDED"
              : "PARTIALLY_REFUNDED"
            : "RECORDED",
        terms: r.terms,
      },
    ];
  });
  const unknown = all.filter((v) => v.source === "UNKNOWN").length;
  const missing = all.filter((v) => v.source === null).length;
  const sourceBreakdown = Object.entries(sourceLabels).map(([source, label]) => ({
    source,
    label,
    count: all.filter((v) => v.source === source).length,
  }));
  let covered = 0,
    days = 0;
  for (let d = query.start; d <= query.end; d = addDays(d, 1)) {
    days++;
    if (completeDates.has(d)) covered++;
  }
  const recommendations: { campaignId: string; title: string; rationale: string }[] = [];
  for (const campaign of campaigns.filter((c) => selected.has(c.id))) {
    const spend = sumMoney(
      expenses.filter((e) => e.campaignId === campaign.id && !e.voidedAt).map((e) => e.amountCents),
    );
    const paidCount = paid.filter((v) => effectiveCampaign(v) === campaign.id).length;
    if (campaign.budgetCents > 0 && spend > campaign.budgetCents)
      recommendations.push({
        campaignId: campaign.id,
        title: "Review campaign spending",
        rationale: `Recorded spending of ${spend} cents exceeds the full planned budget of ${campaign.budgetCents} cents during ${query.start}–${query.end}. Check the next planned expense; this does not establish profitability.`,
      });
    if (spend > 0 && paidCount === 0)
      recommendations.push({
        campaignId: campaign.id,
        title: "Check source tracking before spending more",
        rationale: `${spend} cents spent and no attributed paid inspections recorded for ${query.start}–${query.end}. ${missing + unknown} of ${all.length} recorded inspections have unknown/missing responses. This is a reporting gap, not proof that the promotion failed.`,
      });
  }
  return {
    start: query.start,
    end: query.end,
    spendingCents,
    collectedCents,
    invoiceCollectedCents,
    verifiedRetailCollectedCents,
    attributedPaidInspections: paid.length,
    freeRetests: attributed.filter((v) => v.kind === "FREE").length,
    unclassifiedInspections: attributed.filter((v) => v.kind === "UNKNOWN").length,
    recordedRedemptions: redemptions.length,
    activeRedemptions: redemptions.filter((r) => r.status !== "CANCELLED").length,
    discountsCents: sumMoney(
      redemptions.filter((r) => r.status !== "CANCELLED").map((r) => r.discountCents),
    ),
    coverage: {
      recordedInspections: all.length,
      knownResponses: all.length - missing - unknown,
      unknown,
      missing,
      completeDays: covered,
      totalDays: days,
      partial: covered < days || query.end >= businessDate(),
      receiptLinkedPaid,
    },
    costPerAttributedPaidCents:
      spendingCents > 0 && paid.length > 0 ? Math.round(spendingCents / paid.length) : null,
    sourceBreakdown,
    redemptions,
    recommendations,
  };
}
