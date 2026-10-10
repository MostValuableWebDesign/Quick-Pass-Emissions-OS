import { z } from "zod";
import { dateString, id } from "../../lib/validation";
import { businessDate, addDays } from "../../lib/time";
import { audit, phase2, requireRule, financeRoles, approvalRoles, type Tx } from "../phase2";
import { certificateForecast } from "./forecast";
const quantity = z.coerce.number().int().min(1).max(1000000);
const nonnegative = z.coerce.number().int().min(0).max(2000000000);
const reference = z.string().trim().min(1).max(160);
const reason = z.string().trim().min(1).max(2000);
export const settingInput = z.object({
  minimumOrder: z.coerce.number().int().min(300).max(1000000),
  reorderPoint: z.coerce.number().int().min(0).max(1000000),
  leadDays: z.coerce.number().int().min(0).max(365),
  windowDays: z.coerce.number().int().min(7).max(90),
  reason,
});
export const movementInput = z.object({
  kind: z.enum(["USAGE", "VOID"]),
  quantity,
  date: dateString,
  reference,
  reason,
});
export const reconcileInput = z.object({
  observed: nonnegative,
  version: nonnegative,
  date: dateString,
  reference,
  reason,
});
async function dateAllowed(tx: Tx, date: string) {
  requireRule(date <= businessDate(), "Choose a completed or current business date.");
  const stock = await tx.certificateStock.findUnique({ where: { id: "certificates" } });
  requireRule(stock, "Configure opening stock through a physical reconciliation first.");
  requireRule(
    date >= stock.reconciledDate,
    "This date precedes the latest reconciliation. Reconcile current stock with a correction reason instead.",
  );
  return stock;
}
async function uniqueMovement(tx: Tx, ref: string) {
  requireRule(
    !(await tx.certificateMovement.count({ where: { reference: ref } })),
    "This movement reference already exists. Refresh to verify the prior entry; do not record it twice.",
  );
}
export async function saveCertificateSettings(actorId: string, input: unknown) {
  const { reason: why, ...data } = settingInput.parse(input);
  return phase2(actorId, ["OWNER"], async (tx) => {
    const before = await tx.certificateSetting.findUnique({ where: { id: "certificates" } });
    await tx.certificateSetting.upsert({
      where: { id: "certificates" },
      create: data,
      update: data,
    });
    await audit(tx, actorId, "CERTIFICATE_SETTINGS", "certificates", {
      before: before
        ? {
            minimumOrder: before.minimumOrder,
            reorderPoint: before.reorderPoint,
            leadDays: before.leadDays,
            windowDays: before.windowDays,
          }
        : null,
      after: data,
      reason: why,
    });
  });
}
export async function reconcileStock(actorId: string, input: unknown) {
  const data = reconcileInput.parse(input);
  return phase2(actorId, approvalRoles, async (tx) => {
    requireRule(data.date <= businessDate(), "Choose a completed or current business date.");
    await uniqueMovement(tx, data.reference);
    const stock = await tx.certificateStock.findUnique({ where: { id: "certificates" } });
    requireRule(
      stock ? stock.version === data.version : data.version === 0,
      "This stock balance changed. Refresh, recount and reconcile again.",
    );
    if (stock) {
      requireRule(
        data.date >= stock.reconciledDate,
        "This reconciliation precedes the latest physical count.",
      );
      const later = await tx.certificateMovement.count({ where: { date: { gt: data.date } } });
      requireRule(
        !later,
        "This reconciliation date precedes recorded movements. Use a current physical count.",
      );
    }
    const delta = data.observed - (stock?.balance ?? 0);
    const row = await tx.certificateMovement.create({
      data: {
        kind: stock ? "RECONCILE" : "OPENING",
        delta,
        balanceAfter: data.observed,
        date: data.date,
        reference: data.reference,
        reason: data.reason,
        createdBy: actorId,
      },
    });
    await tx.certificateStock.upsert({
      where: { id: "certificates" },
      create: {
        balance: data.observed,
        openingDate: data.date,
        reconciledDate: data.date,
        version: 1,
      },
      update: { balance: data.observed, reconciledDate: data.date, version: { increment: 1 } },
    });
    await audit(tx, actorId, "CERTIFICATE_RECONCILED", row.id, {
      ...data,
      before: stock?.balance ?? null,
      delta,
    });
    return row;
  });
}
export async function recordUsage(actorId: string, input: unknown) {
  const data = movementInput.parse(input);
  return phase2(actorId, approvalRoles, async (tx) => {
    await uniqueMovement(tx, data.reference);
    const stock = await dateAllowed(tx, data.date);
    requireRule(
      stock.balance >= data.quantity,
      "This movement exceeds recorded stock. Reconcile before recording more usage.",
    );
    const row = await tx.certificateMovement.create({
      data: {
        kind: data.kind,
        delta: -data.quantity,
        balanceAfter: stock.balance - data.quantity,
        date: data.date,
        reference: data.reference,
        reason: data.reason,
        createdBy: actorId,
      },
    });
    await tx.certificateStock.update({
      where: { id: stock.id },
      data: { balance: { decrement: data.quantity }, version: { increment: 1 } },
    });
    await audit(tx, actorId, "CERTIFICATE_CONSUMED", row.id, data);
    return row;
  });
}
async function forecast(tx: Tx, today: string) {
  const settings = await tx.certificateSetting.findUnique({ where: { id: "certificates" } });
  const stock = await tx.certificateStock.findUnique({ where: { id: "certificates" } });
  if (
    !settings ||
    !stock ||
    settings.windowDays === null ||
    settings.reorderPoint === null ||
    settings.leadDays === null
  )
    return null;
  const start = [stock.openingDate, addDays(today, 1 - settings.windowDays)].sort().at(-1)!;
  const used = await tx.certificateMovement.aggregate({
    where: { kind: { in: ["USAGE", "VOID"] }, date: { gte: start, lte: today } },
    _sum: { delta: true },
  });
  return certificateForecast({
    ...settings,
    ...stock,
    windowDays: settings.windowDays,
    reorderPoint: settings.reorderPoint,
    leadDays: settings.leadDays,
    today,
    used: -(used._sum.delta ?? 0),
  });
}
export async function requestPurchase(actorId: string, input: unknown) {
  const data = z.object({ quantity, reason }).parse(input);
  return phase2(actorId, financeRoles, async (tx) => {
    const settings = await tx.certificateSetting.findUnique({ where: { id: "certificates" } });
    requireRule(settings, "Configure certificate ordering settings first.");
    requireRule(
      data.quantity >= settings.minimumOrder,
      "Choose at least the configured minimum order quantity.",
    );
    requireRule(
      !(await tx.certificatePurchase.count({
        where: { status: { in: ["REQUESTED", "APPROVED", "ORDERED"] } },
      })),
      "This inventory already has an open purchase request. Review it before requesting more.",
    );
    const row = await tx.certificatePurchase.create({
      data: { ...data, minimumOrder: settings.minimumOrder, requestedBy: actorId },
    });
    await audit(tx, actorId, "CERTIFICATE_PURCHASE_REQUESTED", row.id, data);
    return row;
  });
}
export async function recommendPurchase(actorId: string) {
  return phase2(actorId, financeRoles, async (tx) => {
    const estimate = await forecast(tx, businessDate());
    requireRule(
      estimate?.low,
      "This stock is not currently below its configured or estimated reorder threshold.",
    );
    requireRule(
      estimate.recommendedQuantity <= 1000000,
      "This estimate exceeds the supported order size. Review settings and recorded usage.",
    );
    const existing = await tx.certificatePurchase.findFirst({
      where: { status: { in: ["REQUESTED", "APPROVED", "ORDERED"] } },
    });
    if (existing) return existing;
    const settings = await tx.certificateSetting.findUniqueOrThrow({
      where: { id: "certificates" },
    });
    const row = await tx.certificatePurchase.create({
      data: {
        quantity: estimate.recommendedQuantity,
        minimumOrder: settings.minimumOrder,
        requestedBy: actorId,
        reason: `Estimated reorder from ${estimate.start} through ${businessDate()}: ${estimate.used} recorded certificates consumed over ${estimate.days} calendar days.`,
      },
    });
    await audit(tx, actorId, "CERTIFICATE_REORDER_DRAFTED", row.id, {
      quantity: row.quantity,
      estimate,
    });
    return row;
  });
}
export async function reviewPurchase(actorId: string, input: unknown) {
  const data = z.object({ id, decision: z.enum(["APPROVED", "CANCELLED"]), reason }).parse(input);
  return phase2(actorId, approvalRoles, async (tx) => {
    const row = await tx.certificatePurchase.findUnique({ where: { id: data.id } });
    requireRule(
      row &&
        (row.status === "REQUESTED" ||
          (data.decision === "CANCELLED" && row.status === "APPROVED")),
      "This purchase cannot be reviewed in its current state.",
    );
    requireRule(
      row.requestedBy !== actorId,
      "You cannot approve or review a purchase you requested.",
    );
    await tx.certificatePurchase.update({
      where: { id: row.id },
      data: {
        status: data.decision,
        approvedBy: actorId,
        approvedAt: new Date(),
        reviewReason: data.reason,
      },
    });
    await audit(tx, actorId, `CERTIFICATE_PURCHASE_${data.decision}`, row.id, {
      reason: data.reason,
    });
  });
}
export async function recordOrder(actorId: string, input: unknown) {
  const data = z
    .object({ id, confirmation: reference, paymentReference: z.string().trim().max(160), reason })
    .parse(input);
  return phase2(actorId, financeRoles, async (tx) => {
    const row = await tx.certificatePurchase.findUnique({ where: { id: data.id } });
    requireRule(
      row?.status === "APPROVED",
      "This purchase must be approved before recording an external order.",
    );
    await tx.certificatePurchase.update({
      where: { id: row.id },
      data: {
        status: "ORDERED",
        confirmation: data.confirmation,
        paymentReference: data.paymentReference || null,
      },
    });
    await audit(tx, actorId, "CERTIFICATE_ORDER_RECORDED", row.id, data);
  });
}
export async function receivePurchase(actorId: string, input: unknown) {
  const data = z.object({ id, quantity, date: dateString, reference, reason }).parse(input);
  return phase2(actorId, approvalRoles, async (tx) => {
    await uniqueMovement(tx, data.reference);
    const row = await tx.certificatePurchase.findUnique({ where: { id: data.id } });
    requireRule(
      row?.status === "ORDERED",
      "This purchase must have a recorded external order before receipt.",
    );
    requireRule(
      row.received + data.quantity <= row.quantity,
      "This receipt exceeds the purchase's remaining quantity.",
    );
    const stock = await dateAllowed(tx, data.date);
    requireRule(
      stock.balance + data.quantity <= 2000000000,
      "This receipt exceeds the supported stock range.",
    );
    const received = row.received + data.quantity;
    const movement = await tx.certificateMovement.create({
      data: {
        kind: "RECEIPT",
        delta: data.quantity,
        balanceAfter: stock.balance + data.quantity,
        date: data.date,
        reference: data.reference,
        reason: data.reason,
        createdBy: actorId,
        purchaseId: row.id,
      },
    });
    await tx.certificateStock.update({
      where: { id: stock.id },
      data: { balance: { increment: data.quantity }, version: { increment: 1 } },
    });
    await tx.certificatePurchase.update({
      where: { id: row.id },
      data: { received, status: received === row.quantity ? "RECEIVED" : "ORDERED" },
    });
    await audit(tx, actorId, "CERTIFICATE_RECEIPT", movement.id, data);
    return movement;
  });
}
export async function certificateOverview(actorId: string) {
  return phase2(actorId, financeRoles, async (tx) => ({
    demo: (await tx.employee.count({ where: { demo: true } })) > 0,
    settings: await tx.certificateSetting.findUnique({ where: { id: "certificates" } }),
    stock: await tx.certificateStock.findUnique({ where: { id: "certificates" } }),
    estimate: await forecast(tx, businessDate()),
    movements: await tx.certificateMovement.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
    purchases: await tx.certificatePurchase.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  }));
}
