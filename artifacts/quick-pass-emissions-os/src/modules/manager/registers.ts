import { z } from "zod";
import { businessDate } from "@/lib/time";
import { requiredInteger, id, text, dateString, note } from "@/lib/validation";
import { audit, requireRule } from "../phase2";
import { managerTransaction } from "./service";
export async function financialRegister(actorId: string, page = 1) {
  requireRule(Number.isInteger(page) && page >= 1 && page <= 10000, "Choose a valid page.");
  return managerTransaction(actorId, async (tx) => {
    const kinds = ["PAYROLL", "DEPOSIT"] as const;
    return Promise.all(
      kinds.map(async (kind) => ({
        kind,
        rows: await tx.managerFinancialEvidence.findMany({
          where: { kind },
          orderBy: [{ date: "desc" }, { id: "desc" }],
          take: 15,
          skip: (page - 1) * 15,
        }),
        count: await tx.managerFinancialEvidence.count({ where: { kind } }),
      })),
    );
  });
}
export async function supplyRegister(actorId: string, page = 1) {
  requireRule(Number.isInteger(page) && page >= 1 && page <= 10000, "Choose a valid page.");
  return managerTransaction(actorId, (tx) =>
    tx.supplyItem.findMany({
      include: {
        purchases: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 15,
          skip: (page - 1) * 15,
        },
        _count: { select: { purchases: true } },
      },
      orderBy: { name: "asc" },
    }),
  );
}
const quantity = requiredInteger(0, 2000000000),
  version = requiredInteger(0, 2147483647);
const optionalQuantity = z.union([quantity, z.null()]);
export async function saveSupply(actorId: string, input: unknown) {
  const data = z
    .object({
      id: id.optional(),
      version,
      name: text,
      unit: text,
      balance: optionalQuantity,
      reorderLevel: optionalQuantity,
      preferredVendor: z.string().trim().max(160),
    })
    .parse(input);
  return managerTransaction(actorId, async (tx, actor) => {
    const { id: key, version: v, ...values } = data;
    const before = key ? await tx.supplyItem.findUnique({ where: { id: key } }) : null;
    requireRule(!key || before?.version === v, "Supply changed. Refresh.");
    requireRule(
      !before ||
        before.unit === values.unit ||
        !(await tx.supplyPurchase.count({ where: { itemId: before.id } })),
      "Units are frozen after a purchase record. Create a new supply type for a different unit.",
    );
    requireRule(
      actor.role === "OWNER" ||
        (before &&
          before.reorderLevel === data.reorderLevel &&
          before.unit === data.unit &&
          before.preferredVendor === data.preferredVendor &&
          before.name === data.name),
      "Only an owner configures supply units, reorder levels and vendors. Managers can record stock counts.",
    );
    const countedAt = values.balance === null ? null : new Date();
    const row = key
      ? await tx.supplyItem.update({
          where: { id: key },
          data: { ...values, countedAt, version: { increment: 1 } },
        })
      : await tx.supplyItem.create({ data: { ...values, countedAt } });
    await audit(tx, actorId, "SUPPLY_COUNT_CONFIG", row.id, { before, ...data });
    return row;
  });
}
export async function preparePurchase(actorId: string, input: unknown) {
  const data = z
    .object({ itemId: id, quantity: requiredInteger(1, 2000000000), vendor: text, reference: text })
    .parse(input);
  return managerTransaction(actorId, async (tx) => {
    await tx.supplyItem.findUniqueOrThrow({ where: { id: data.itemId } });
    requireRule(
      !(await tx.supplyPurchase.count({ where: { reference: data.reference } })),
      "Purchase reference already recorded.",
    );
    const row = await tx.supplyPurchase.create({ data: { ...data, createdBy: actorId } });
    await audit(tx, actorId, "SUPPLY_PURCHASE_PREPARED", row.id, data);
    return row;
  });
}
export async function advancePurchase(actorId: string, input: unknown) {
  const data = z
    .object({ id, version, status: z.enum(["SUBMITTED", "RECEIVED", "RECONCILED"]), note: text })
    .parse(input);
  return managerTransaction(actorId, async (tx) => {
    const row = await tx.supplyPurchase.findUniqueOrThrow({
      where: { id: data.id },
      include: { item: true },
    });
    requireRule(row.version === data.version, "Purchase changed. Refresh.");
    const next = { PREPARED: "SUBMITTED", SUBMITTED: "RECEIVED", RECEIVED: "RECONCILED" };
    requireRule(
      next[row.status as keyof typeof next] === data.status,
      "Record preparation, external submission, receipt and reconciliation in order.",
    );
    if (data.status === "RECEIVED") {
      requireRule(
        row.item.balance !== null,
        "Record an opening stock count before receiving supplies.",
      );
      const balance = quantity.parse(row.item.balance + row.quantity);
      await tx.supplyItem.update({
        where: { id: row.itemId },
        data: { balance, version: { increment: 1 } },
      });
    }
    await tx.supplyPurchase.update({
      where: { id: row.id },
      data: {
        status: data.status,
        version: { increment: 1 },
        ...(data.status === "RECEIVED" ? { receivedAt: new Date() } : {}),
        ...(data.status === "RECONCILED" ? { reconciledAt: new Date() } : {}),
      },
    });
    await audit(tx, actorId, `SUPPLY_PURCHASE_${data.status}`, row.id, {
      from: row.status,
      note: data.note,
    });
  });
}
export async function saveBankLimit(actorId: string, input: unknown) {
  const data = z
    .object({ version, remoteLimitCents: z.union([requiredInteger(1, 2147483647), z.null()]) })
    .parse(input);
  return managerTransaction(actorId, async (tx, actor) => {
    requireRule(actor.role === "OWNER", "Owner approval required.");
    const before = await tx.managerBankPolicy.findUnique({ where: { id: "business" } });
    requireRule((before?.version ?? 0) === data.version, "Bank policy changed. Refresh.");
    await tx.managerBankPolicy.upsert({
      where: { id: "business" },
      create: { remoteLimitCents: data.remoteLimitCents, version: 1 },
      update: { remoteLimitCents: data.remoteLimitCents, version: { increment: 1 } },
    });
    await audit(tx, actorId, "MANAGER_BANK_LIMIT", "business", { before, ...data });
  });
}
export async function recordFinancialEvidence(actorId: string, input: unknown) {
  const data = z
    .object({
      kind: z.enum(["PAYROLL", "DEPOSIT"]),
      sourceId: id,
      amountCents: requiredInteger(1, 2147483647),
      date: dateString,
      method: z.enum(["CHECK", "REMOTE", "BANK", "OTHER"]),
      reference: text,
      notes: note.min(5),
    })
    .parse(input);
  return managerTransaction(actorId, async (tx, actor) => {
    requireRule(data.date <= businessDate(), "Evidence cannot be future dated.");
    let sourceKey = data.sourceId;
    if (data.kind === "PAYROLL") {
      requireRule(actor.role === "OWNER", "Only an owner can confirm payroll payment.");
      const draft = await tx.payrollDraft.findUnique({
        where: { id: data.sourceId },
        include: { period: true },
      });
      requireRule(
        draft?.status === "APPROVED" && draft.period.status !== "CANCELLED",
        "Select an independently approved payroll draft.",
      );
      requireRule(
        draft.totalCents === data.amountCents,
        "Payment evidence must match the approved gross draft. Record deductions/net-pay differences in notes; this is not a bank transfer.",
      );
      sourceKey = `payroll:${draft.periodId}`;
    } else {
      requireRule(data.method !== "OTHER", "Choose check, remote deposit or bank deposit.");
      sourceKey = `deposit:${data.sourceId}`;
      if (data.method === "REMOTE") {
        const policy = await tx.managerBankPolicy.findUnique({ where: { id: "business" } });
        requireRule(
          policy?.remoteLimitCents !== null && policy?.remoteLimitCents !== undefined,
          "Configure the bank remote-deposit limit first.",
        );
        requireRule(
          data.amountCents <= policy.remoteLimitCents,
          "Amount exceeds configured remote-deposit limit; record a bank deposit instead.",
        );
      }
    }
    requireRule(
      !(await tx.managerFinancialEvidence.count({
        where: { OR: [{ sourceKey }, { reference: data.reference }] },
      })),
      "This payroll period, deposit/check identifier or reference is already recorded.",
    );
    const { sourceId, ...values } = data;
    void sourceId;
    const row = await tx.managerFinancialEvidence.create({
      data: { ...values, sourceKey, createdBy: actorId },
    });
    await audit(tx, actorId, "MANAGER_FINANCIAL_EVIDENCE", row.id, {
      ...data,
      sourceKey,
      state: "RECORDED_UNRECONCILED",
    });
    return row;
  });
}
export async function reconcileFinancialEvidence(actorId: string, input: unknown) {
  const data = z.object({ id, notes: text }).parse(input);
  return managerTransaction(actorId, async (tx, actor) => {
    requireRule(actor.role === "OWNER", "Owner reconciliation required.");
    const row = await tx.managerFinancialEvidence.findUniqueOrThrow({ where: { id: data.id } });
    requireRule(!row.reconciledAt, "Already reconciled.");
    requireRule(
      row.kind !== "DEPOSIT" || ["REMOTE", "BANK"].includes(row.method),
      "Record the external deposit before bank reconciliation.",
    );
    requireRule(
      row.createdBy !== actorId,
      "Another owner must independently reconcile this evidence.",
    );
    await tx.managerFinancialEvidence.update({
      where: { id: row.id },
      data: { reconciledAt: new Date(), reconciledBy: actorId },
    });
    await audit(tx, actorId, "MANAGER_FINANCIAL_RECONCILED", row.id, data);
  });
}
export async function recordDepositSubmission(actorId: string, input: unknown) {
  const data = z
    .object({
      id,
      method: z.enum(["REMOTE", "BANK"]),
      reference: text,
      date: dateString,
      notes: text,
    })
    .parse(input);
  return managerTransaction(actorId, async (tx) => {
    const row = await tx.managerFinancialEvidence.findUniqueOrThrow({ where: { id: data.id } });
    requireRule(
      row.kind === "DEPOSIT" && row.method === "CHECK" && !row.reconciledAt,
      "Only an unreconciled check awaiting deposit can be submitted.",
    );
    requireRule(
      data.date >= row.date && data.date <= businessDate(),
      "Deposit date must be on/after check receipt and not in the future.",
    );
    if (data.method === "REMOTE") {
      const policy = await tx.managerBankPolicy.findUnique({ where: { id: "business" } });
      requireRule(
        policy?.remoteLimitCents && row.amountCents <= policy.remoteLimitCents,
        "Remote deposit needs a configured bank limit covering this amount.",
      );
    }
    const duplicate = await tx.managerFinancialEvidence.findFirst({
      where: { reference: data.reference, id: { not: row.id } },
    });
    requireRule(!duplicate, "External reference already used.");
    await tx.managerFinancialEvidence.update({
      where: { id: row.id },
      data: {
        method: data.method,
        reference: data.reference,
        date: data.date,
        notes: `${row.notes}\nDeposit evidence: ${data.notes}`,
      },
    });
    await audit(tx, actorId, "MANAGER_DEPOSIT_SUBMITTED", row.id, { before: row, ...data });
  });
}
