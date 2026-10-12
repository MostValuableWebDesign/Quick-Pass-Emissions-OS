import { z } from "zod";
import { audit, requireRule, type Tx } from "../phase4";
import { stationConfig } from "../station/service";
import { discountCents, promoAllowed, sources, notes, optionalId } from "./rules";

export const serviceMarketingInput = z.object({
  customerSource: z
    .union([z.enum(sources), z.literal("")])
    .default("")
    .transform((v) => v || null),
  reportedCampaignId: optionalId,
  inspectionKind: z.enum(["PAID", "FREE", "UNKNOWN", "OTHER"]).default("UNKNOWN"),
  sourceEvidence: notes,
  promoCode: z
    .string()
    .trim()
    .max(30)
    .default("")
    .transform((v) => v.toUpperCase()),
});
/** Called inside the existing financial transaction; the lock orders after finance locks. */
export async function serviceMarketing(
  tx: Tx,
  actorId: string,
  input: unknown,
  service: { id: string; date: string; quantity: number; unitCents: number; evidence: string },
) {
  const data = serviceMarketingInput.parse(input);
  if (
    !data.customerSource &&
    !data.reportedCampaignId &&
    !data.promoCode &&
    data.inspectionKind === "UNKNOWN"
  )
    return service.unitCents;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183518)`;
  const hash = stationConfig().hash;
  requireRule(
    data.inspectionKind !== "FREE",
    "Free retests must not be entered as charged dealership services.",
  );
  requireRule(
    data.inspectionKind !== "PAID" || !!(data.sourceEvidence || service.evidence),
    "Paid inspection classification requires evidence.",
  );
  requireRule(
    service.quantity === 1 ||
      (!data.promoCode &&
        !data.reportedCampaignId &&
        data.inspectionKind === "UNKNOWN" &&
        !data.customerSource),
    "Customer source and promotions require a single inspection, not a batch.",
  );
  requireRule(
    !data.reportedCampaignId || (data.customerSource && data.customerSource !== "UNKNOWN"),
    "Missing or unknown responses cannot identify a campaign.",
  );
  if (data.reportedCampaignId) {
    const campaign = await tx.marketingCampaign.findUnique({
      where: { id: data.reportedCampaignId },
    });
    requireRule(
      campaign &&
        Array.isArray(campaign.stationHashes) &&
        campaign.stationHashes.includes(hash) &&
        service.date >= campaign.startDate &&
        service.date <= campaign.endDate,
      "Reported campaign does not include this date/station.",
    );
  }
  let finalCents = service.unitCents;
  if (data.promoCode) {
    // Spending / offer administration remains owner-only, including manual application.
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    requireRule(actor?.active && actor.role === "OWNER", "Only an owner may apply an offer.");
    requireRule(
      service.quantity === 1 &&
        data.inspectionKind === "PAID" &&
        !!(data.sourceEvidence || service.evidence),
      "Offers require one paid emissions inspection and supporting evidence. Free retests are not eligible.",
    );
    const promo = await tx.marketingPromo.findUnique({
      where: { code: data.promoCode },
      include: { campaign: true, _count: { select: { redemptions: true } } },
    });
    requireRule(
      promo && promoAllowed(promo, promo.campaign, service.date, hash, promo._count.redemptions),
      "Promo is unavailable, outside its dates/station, archived, or its lifetime usage limit was reached.",
    );
    const discount = discountCents(service.unitCents, promo.kind, promo.value);
    requireRule(
      discount > 0 && discount < service.unitCents,
      "Offers must leave a positive charge in the existing billing workflow.",
    );
    finalCents -= discount;
    const redemption = await tx.marketingRedemption.create({
      data: {
        promoId: promo.id,
        serviceId: service.id,
        date: service.date,
        stationHash: hash,
        baseCents: service.unitCents,
        discountCents: discount,
        finalCents,
        terms: {
          code: promo.code,
          kind: promo.kind,
          value: promo.value,
          startDate: promo.startDate,
          endDate: promo.endDate,
          stationHashes: promo.stationHashes,
          usageLimit: promo.usageLimit,
          offer: promo.campaign.offer,
          campaignId: promo.campaignId,
        },
        createdBy: actorId,
      },
    });
    await audit(tx, actorId, "MARKETING_PROMO_REDEEMED", redemption.id, {
      serviceId: service.id,
      promoId: promo.id,
      baseCents: service.unitCents,
      discountCents: discount,
      finalCents,
    });
  }
  if (
    service.quantity === 1 &&
    (data.customerSource ||
      data.reportedCampaignId ||
      data.promoCode ||
      data.inspectionKind !== "UNKNOWN")
  ) {
    const observation = await tx.marketingObservation.create({
      data: {
        serviceId: service.id,
        stationHash: hash,
        date: service.date,
        source: data.customerSource,
        campaignId: data.reportedCampaignId ?? null,
        inspectionKind: data.inspectionKind,
        evidence: data.sourceEvidence || service.evidence,
        createdBy: actorId,
      },
    });
    await audit(tx, actorId, "MARKETING_SOURCE_RECORDED", observation.id, {
      serviceId: service.id,
      source: data.customerSource,
      campaignId: data.reportedCampaignId ?? null,
      inspectionKind: data.inspectionKind,
    });
  }
  return finalCents;
}
