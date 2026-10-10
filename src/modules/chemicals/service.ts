import { z } from "zod";
import { id, dateString } from "../../lib/validation";
import { businessDate } from "../../lib/time";
import { phase3, managers, requireRule, audit } from "../phase3";
import { activeVendor } from "../maintenance/service";
import { label, reason, notes, optionalId, version } from "../maintenance/validation";
const amount = z.coerce.number().int().min(0).max(2000000000);
export const itemInput = z.object({
  id: optionalId,
  version,
  name: label,
  unit: z.enum(["ML", "GRAM", "ITEM"]),
  reorderPoint: amount,
  vendorId: optionalId,
  notes,
  active: z.boolean(),
  reason,
});
export const movementInput = z.object({
  id,
  version,
  kind: z.enum(["RECONCILE", "RECEIPT", "USAGE", "DISPOSAL"]),
  quantity: amount,
  date: dateString,
  reference: label,
  reason,
});
export async function saveChemical(actorId: string, input: unknown) {
  const { id: recordId, version: expected, reason: why, ...data } = itemInput.parse(input);
  return phase3(actorId, managers, async (tx) => {
    const before = recordId ? await tx.chemicalItem.findUnique({ where: { id: recordId } }) : null;
    if (recordId)
      requireRule(
        before?.version === expected,
        "Stock or settings changed. Refresh and try again.",
      );
    if (before?.balance !== null && before)
      requireRule(
        before.unit === data.unit,
        "Units cannot change after opening stock. Create a separate item.",
      );
    if (!data.active && before)
      requireRule(
        before.balance === 0 || before.balance === null,
        "Record consumption/disposal or a physical reconciliation to zero before archiving.",
      );
    await activeVendor(tx, data.vendorId);
    const row = recordId
      ? await tx.chemicalItem.update({
          where: { id: recordId },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.chemicalItem.create({ data });
    await audit(tx, actorId, "CHEMICAL_SAVED", row.id, { before, after: data, reason: why });
    return row;
  });
}
export async function moveChemical(actorId: string, input: unknown) {
  const data = movementInput.parse(input);
  return phase3(actorId, managers, async (tx) => {
    const item = await tx.chemicalItem.findUnique({ where: { id: data.id } });
    requireRule(item?.active, "Choose an active chemical item.");
    requireRule(item.version === data.version, "Stock changed. Refresh and verify the quantity.");
    requireRule(
      data.date <= businessDate() && (!item.lastMovementDate || data.date >= item.lastMovementDate),
      "Use a current/past business date on or after the latest stock movement.",
    );
    requireRule(
      !(await tx.chemicalMovement.count({ where: { reference: data.reference } })),
      "This movement reference already exists.",
    );
    requireRule(
      data.kind === "RECONCILE" || item.balance !== null,
      "Record a physical opening count first.",
    );
    requireRule(
      data.kind === "RECONCILE" || data.quantity > 0,
      "Receipt and consumption quantities must be positive.",
    );
    const old = item.balance ?? 0;
    const delta =
      data.kind === "RECONCILE"
        ? data.quantity - old
        : data.kind === "RECEIPT"
          ? data.quantity
          : -data.quantity;
    const balance = old + delta;
    requireRule(
      balance >= 0 && balance <= 2000000000,
      "This movement would exceed supported stock bounds.",
    );
    const row = await tx.chemicalMovement.create({
      data: {
        itemId: item.id,
        kind: item.balance === null ? "OPENING" : data.kind,
        delta,
        balanceAfter: balance,
        date: data.date,
        reference: data.reference,
        reason: data.reason,
        createdBy: actorId,
      },
    });
    await tx.chemicalItem.update({
      where: { id: item.id },
      data: { balance, lastMovementDate: data.date, version: { increment: 1 } },
    });
    await audit(tx, actorId, "CHEMICAL_MOVEMENT", row.id, {
      ...data,
      delta,
      balanceAfter: balance,
    });
    return row;
  });
}
export async function chemicalOverview(actorId: string) {
  return phase3(actorId, managers, async (tx) => ({
    items: await tx.chemicalItem.findMany({
      orderBy: { name: "asc" },
      include: {
        vendor: { select: { name: true } },
        movements: { orderBy: { createdAt: "desc" }, take: 30 },
      },
    }),
    vendors: await tx.vendor.findMany({
      where: { active: true },
      select: { id: true, name: true },
    }),
    demo: (await tx.employee.count({ where: { demo: true } })) > 0,
  }));
}
