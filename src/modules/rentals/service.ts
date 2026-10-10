import { z } from "zod";
import { uniqueReceiptReference } from "../finance/references";
import { id, dateString, optionalDate } from "../../lib/validation";
import { businessDate } from "../../lib/time";
import { phase3, managers, rentalRoles, requireRule, audit } from "../phase3";
import { label, reason, version } from "../maintenance/validation";
import { rentalMonth, paymentSummary } from "./rules";
const positive = z.coerce.number().int().min(1).max(2000000000);
export const agreementInput = z
  .object({
    bayId: id,
    tenant: label,
    contact: reason,
    reference: label,
    startDate: dateString,
    endDate: optionalDate,
    monthlyCents: positive,
    dueDay: z.coerce.number().int().min(1).max(31),
    responsibilities: reason,
    reason,
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, "End date must follow start date.");
export async function createAgreement(actorId: string, input: unknown) {
  const { reason: why, ...data } = agreementInput.parse(input);
  return phase3(actorId, ["OWNER"], async (tx) => {
    const bay = await tx.carwashBay.findUnique({ where: { id: data.bayId } });
    requireRule(bay?.type === "DETAILING", "Rental agreements require a detailing bay.");
    requireRule(
      !(await tx.bayRentalAgreement.count({ where: { reference: data.reference } })),
      "Agreement reference already exists.",
    );
    const overlap = await tx.bayRentalAgreement.count({
      where: {
        bayId: data.bayId,
        status: { not: "CANCELLED" },
        startDate: { lte: data.endDate ?? "9999-12-31" },
        OR: [{ endDate: null }, { endDate: { gte: data.startDate } }],
      },
    });
    requireRule(!overlap, "This bay already has an agreement covering these dates.");
    const row = await tx.bayRentalAgreement.create({ data: { ...data, authorizedBy: actorId } });
    await audit(tx, actorId, "RENTAL_AUTHORIZED", row.id, { ...data, reason: why });
    return row;
  });
}
export async function endAgreement(actorId: string, input: unknown) {
  const data = z
    .object({ id, version, decision: z.enum(["ENDED", "CANCELLED"]), endDate: dateString, reason })
    .parse(input);
  return phase3(actorId, ["OWNER"], async (tx) => {
    const row = await tx.bayRentalAgreement.findUnique({
      where: { id: data.id },
      include: { charges: true },
    });
    requireRule(
      row?.version === data.version && row.status === "ACTIVE",
      "Agreement changed or is already closed. Refresh and review it.",
    );
    if (data.decision === "CANCELLED")
      requireRule(
        !row.charges.length,
        "An agreement with charges cannot be cancelled. End it while preserving charges.",
      );
    else {
      requireRule(
        data.endDate >= row.startDate && data.endDate <= businessDate(),
        "End on a current/past date on or after agreement start.",
      );
      requireRule(
        !row.endDate || data.endDate <= row.endDate,
        "An end action cannot extend the authorized agreement.",
      );
      requireRule(
        row.charges.every(
          (c) => c.voidedAt || rentalMonth(c.month, row.dueDay).end <= data.endDate,
        ),
        "Void unpaid later charges before ending. Paid periods require external reconciliation.",
      );
    }
    const changed = await tx.bayRentalAgreement.update({
      where: { id: data.id },
      data: {
        status: data.decision,
        ...(data.decision === "ENDED" ? { endDate: data.endDate } : {}),
        version: { increment: 1 },
      },
    });
    await audit(tx, actorId, "RENTAL_CLOSED", row.id, {
      before: { endDate: row.endDate, status: row.status },
      ...data,
    });
    return changed;
  });
}
export async function createCharge(actorId: string, input: unknown) {
  const data = z
    .object({ agreementId: id, month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), reason })
    .parse(input);
  return phase3(actorId, rentalRoles, async (tx) => {
    const a = await tx.bayRentalAgreement.findUnique({ where: { id: data.agreementId } });
    requireRule(a && a.status !== "CANCELLED", "Choose a valid agreement.");
    const dates = rentalMonth(data.month, a.dueDay);
    requireRule(
      dates.start >= a.startDate && (!a.endDate || dates.end <= a.endDate),
      "Only a full calendar month within the authorized agreement can be charged. Handle partial months through your accounting process.",
    );
    requireRule(
      dates.start <= businessDate(),
      "Create charges only for a current or past rental month.",
    );
    const existing = await tx.rentalCharge.findUnique({
      where: { agreementId_month: { agreementId: a.id, month: data.month } },
    });
    if (existing) return existing;
    const row = await tx.rentalCharge.create({
      data: {
        agreementId: a.id,
        month: data.month,
        dueDate: dates.dueDate,
        amountCents: a.monthlyCents,
        snapshot: {
          tenant: a.tenant,
          bayId: a.bayId,
          reference: a.reference,
          monthlyCents: a.monthlyCents,
          dueDay: a.dueDay,
          startDate: a.startDate,
          endDate: a.endDate,
          responsibilities: a.responsibilities,
        },
        createdBy: actorId,
      },
    });
    await audit(tx, actorId, "RENTAL_CHARGE", row.id, data);
    return row;
  });
}
export async function recordPayment(actorId: string, input: unknown) {
  const data = z
    .object({ chargeId: id, amountCents: positive, date: dateString, reference: label, reason })
    .parse(input);
  return phase3(actorId, rentalRoles, async (tx) => {
    const c = await tx.rentalCharge.findUnique({
      where: { id: data.chargeId },
      include: { payments: true, agreement: true },
    });
    requireRule(c && !c.voidedAt, "Choose an active rental charge.");
    requireRule(
      data.date <= businessDate() && data.date >= c.agreement.startDate,
      "Choose a current/past payment date within or after the agreement start.",
    );
    await uniqueReceiptReference(tx, data.reference);
    const { remainingCents } = paymentSummary(c.amountCents, c.payments, c.dueDate, businessDate());
    requireRule(data.amountCents <= remainingCents, "Payment exceeds the outstanding charge.");
    const row = await tx.rentalPayment.create({ data: { ...data, createdBy: actorId } });
    await audit(tx, actorId, "RENTAL_PAYMENT", row.id, data);
    return row;
  });
}
export async function reversePayment(actorId: string, input: unknown) {
  const data = z.object({ id, date: dateString, reference: label, reason }).parse(input);
  return phase3(actorId, managers, async (tx) => {
    const row = await tx.rentalPayment.findUnique({
      where: { id: data.id },
      include: { reversal: true },
    });
    requireRule(
      row && row.amountCents > 0 && !row.reversal,
      "This payment is not eligible for reversal.",
    );
    requireRule(
      data.date >= row.date && data.date <= businessDate(),
      "Use a current/past reversal date on or after the payment.",
    );
    await uniqueReceiptReference(tx, data.reference);
    const reversal = await tx.rentalPayment.create({
      data: {
        chargeId: row.chargeId,
        amountCents: -row.amountCents,
        date: data.date,
        reference: data.reference,
        reason: data.reason,
        createdBy: actorId,
        reversesId: row.id,
      },
    });
    await audit(tx, actorId, "RENTAL_PAYMENT_REVERSED", reversal.id, data);
    return reversal;
  });
}
export async function voidCharge(actorId: string, input: unknown) {
  const data = z.object({ id, reason }).parse(input);
  return phase3(actorId, managers, async (tx) => {
    const row = await tx.rentalCharge.findUnique({
      where: { id: data.id },
      include: { payments: true },
    });
    requireRule(row && !row.voidedAt, "Choose an active charge.");
    requireRule(
      paymentSummary(row.amountCents, row.payments, row.dueDate, businessDate()).paidCents === 0,
      "Reverse recorded payments before voiding a charge.",
    );
    await tx.rentalCharge.update({
      where: { id: data.id },
      data: { voidedAt: new Date(), voidReason: data.reason },
    });
    await audit(tx, actorId, "RENTAL_CHARGE_VOIDED", row.id, data);
  });
}
export async function rentalOverview(actorId: string) {
  return phase3(actorId, rentalRoles, async (tx) => ({
    agreements: await tx.bayRentalAgreement.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { bay: true, charges: { include: { payments: true } } },
    }),
    bays: await tx.carwashBay.findMany({ where: { type: "DETAILING" }, orderBy: { slot: "asc" } }),
    demo: (await tx.employee.count({ where: { demo: true } })) > 0,
  }));
}
export async function rentalDetail(actorId: string, agreementId: string) {
  return phase3(actorId, rentalRoles, async (tx) => ({
    demo: (await tx.employee.count({ where: { demo: true } })) > 0,
    agreement: await tx.bayRentalAgreement.findUnique({
      where: { id: id.parse(agreementId) },
      include: {
        bay: true,
        charges: {
          orderBy: { month: "desc" },
          include: { payments: { orderBy: { createdAt: "asc" }, include: { reversal: true } } },
        },
      },
    }),
  }));
}
