import { z } from "zod";
import { addDays, businessDate, dueInstant } from "@/lib/time";
import { csv, reportRange, sumCents } from "../finance/rules";
import { exportFinance } from "../finance/service";
import { audit, financeRoles, requireRule, type Tx } from "../phase2";
import { automation } from "./transaction";
export const operationalDatasets = [
  "responsibilities",
  "maintenance",
  "downtime",
  "certificates",
  "chemicals",
  "rental-charges",
] as const;
export type OperationalDataset = (typeof operationalDatasets)[number];
export const datasetSemantics: Record<OperationalDataset, string> = {
  responsibilities:
    "Matches any due, completion or review instant within the inclusive Eastern range. Each timestamp remains separate. Overdue is current state, not a reconstructed historical status.",
  maintenance:
    "Matches target business date, opened instant or completion instant. Repair costs are recorded cost notes, never paid expenses. Blank cost means unknown.",
  downtime:
    "Intervals intersect the Eastern range and are clipped to its boundaries and generation time. Open outages end provisionally at generation. Bay and equipment intervals remain separate: do not add overlapping targets into availability or lost revenue.",
  certificates:
    "Effective movement date. USAGE and consumed VOID count as consumption; receipts and physical adjustments do not. Recording order and balance-after are not a reconstructed chronological ledger.",
  chemicals:
    "Effective movement date. USAGE plus DISPOSAL depletes stock; each item/unit remains separate. Receipts and reconciliations excluded from consumption; no conversion.",
  "rental-charges":
    "Due dates select displayed charges. Balance is as of end date across all charges due through end, including before start. Dated signed receipts and Eastern dated voids apply through end. Terms are snapshots; current entry history can change prior-date views.",
};
export async function operationalReport(
  tx: Tx,
  dataset: OperationalDataset,
  start: string,
  end: string,
  now = new Date(),
) {
  const from = dueInstant(start, "00:00"),
    until = dueInstant(addDays(end, 1), "00:00");
  type Row = Record<string, string | number | null>;
  let rows: Row[] = [];
  let totals: Record<string, number> = {};
  const range = { gte: from, lt: until },
    dates = { gte: start, lte: end };
  if (dataset === "responsibilities") {
    const tasks = await tx.taskInstance.findMany({
      where: { OR: [{ dueAt: range }, { completedAt: range }, { reviewedAt: range }] },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    });
    rows = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      employeeId: t.employeeId,
      dueAt: t.dueAt.toISOString(),
      completedAt: t.completedAt?.toISOString() ?? null,
      reviewedAt: t.reviewedAt?.toISOString() ?? null,
      status: t.status,
      currentlyOverdue: Number(t.dueAt < now && !["COMPLETED", "CANCELLED"].includes(t.status)),
      href: `/tasks/${t.id}`,
    }));
    totals = {
      matched: rows.length,
      completedInPeriod: tasks.filter(
        (t) => t.completedAt && t.completedAt >= from && t.completedAt < until,
      ).length,
      reviewedInPeriod: tasks.filter(
        (t) => t.reviewedAt && t.reviewedAt >= from && t.reviewedAt < until,
      ).length,
      currentlyOverdue: rows.reduce((s, r) => s + Number(r.currentlyOverdue), 0),
    };
  } else if (dataset === "maintenance") {
    const tickets = await tx.maintenanceTicket.findMany({
      where: { OR: [{ targetDate: dates }, { createdAt: range }, { completedAt: range }] },
      orderBy: [{ targetDate: "asc" }, { id: "asc" }],
    });
    rows = tickets.map((t) => ({
      id: t.id,
      title: t.title,
      targetDate: t.targetDate,
      openedAt: t.createdAt.toISOString(),
      completedAt: t.completedAt?.toISOString() ?? null,
      status: t.status,
      recordedCostCents: t.repairCostCents,
      currency: "USD",
      href: `/maintenance/${t.id}`,
    }));
    totals = {
      matched: rows.length,
      knownRecordedCostCents: sumCents(
        tickets.flatMap((t) => (t.repairCostCents === null ? [] : [t.repairCostCents])),
      ),
      unknownCosts: tickets.filter((t) => t.repairCostCents === null).length,
    };
  } else if (dataset === "downtime") {
    const events = await tx.downtimeEvent.findMany({
      where: { startedAt: { lt: until }, OR: [{ endedAt: null }, { endedAt: { gt: from } }] },
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
    });
    rows = events.map((e) => {
      const clippedStart = Math.max(from.getTime(), e.startedAt.getTime());
      const clippedEnd = Math.min(
        until.getTime(),
        now.getTime(),
        e.endedAt?.getTime() ?? now.getTime(),
      );
      return {
        id: e.id,
        bayId: e.bayId,
        equipmentId: e.equipmentId,
        startedAt: e.startedAt.toISOString(),
        endedAt: e.endedAt?.toISOString() ?? null,
        clippedStart: new Date(clippedStart).toISOString(),
        clippedEnd: new Date(Math.max(clippedStart, clippedEnd)).toISOString(),
        recordedDurationMilliseconds: Math.max(0, clippedEnd - clippedStart),
        reason: e.reason,
        href: e.bayId ? "/carwash" : "/equipment",
      };
    });
    totals = { matched: rows.length }; // Deliberately no cross-target availability total.
  } else if (dataset === "certificates") {
    const movements = await tx.certificateMovement.findMany({
      where: { date: dates },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    rows = movements.map((m) => ({
      id: m.id,
      date: m.date,
      recordedAt: m.createdAt.toISOString(),
      kind: m.kind,
      delta: m.delta,
      balanceAfter: m.balanceAfter,
      consumption: ["USAGE", "VOID"].includes(m.kind) ? -m.delta : 0,
      unit: "ITEM",
      reference: m.reference,
      href: "/certificates",
    }));
    totals = {
      matched: rows.length,
      recordedConsumption: sumCents(rows.map((r) => Number(r.consumption))),
    };
  } else if (dataset === "chemicals") {
    const movements = await tx.chemicalMovement.findMany({
      where: { date: dates },
      include: { item: { select: { name: true, unit: true } } },
      orderBy: [{ itemId: "asc" }, { date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    rows = movements.map((m) => ({
      id: m.id,
      itemId: m.itemId,
      name: m.item.name,
      unit: m.item.unit,
      date: m.date,
      recordedAt: m.createdAt.toISOString(),
      kind: m.kind,
      delta: m.delta,
      balanceAfter: m.balanceAfter,
      consumption: ["USAGE", "DISPOSAL"].includes(m.kind) ? -m.delta : 0,
      reference: m.reference,
      href: "/chemicals",
    }));
    totals = { matched: rows.length };
    for (const m of movements)
      if (["USAGE", "DISPOSAL"].includes(m.kind))
        totals[`consumption:${m.itemId}:${m.item.unit}`] =
          (totals[`consumption:${m.itemId}:${m.item.unit}`] ?? 0) - m.delta;
  } else {
    const charges = await tx.rentalCharge.findMany({
      where: { dueDate: { lte: end } },
      include: { payments: true },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    });
    const balances = charges.map((c) => {
      const paid = sumCents(c.payments.filter((p) => p.date <= end).map((p) => p.amountCents));
      const voided = c.voidedAt && businessDate(c.voidedAt) <= end;
      return {
        id: c.id,
        agreementId: c.agreementId,
        month: c.month,
        dueDate: c.dueDate,
        amountCents: c.amountCents,
        paidCents: paid,
        balanceCents: voided ? 0 : c.amountCents - paid,
        currency: "USD",
        voidDate: c.voidedAt ? businessDate(c.voidedAt) : null,
        snapshot: JSON.stringify(c.snapshot),
        href: `/rentals/${c.agreementId}`,
      };
    });
    rows = balances.filter((c) => c.dueDate >= start);
    totals = {
      matched: rows.length,
      periodChargesCents: sumCents(
        balances
          .filter((c) => c.dueDate >= start && (!c.voidDate || c.voidDate > end))
          .map((c) => c.amountCents),
      ),
      outstandingAsOfEndCents: sumCents(balances.map((c) => c.balanceCents)),
    };
  }
  return {
    dataset,
    start,
    end,
    generatedAt: now.toISOString(),
    semantics: datasetSemantics[dataset],
    limits:
      "Entered operational records, not complete frozen books. Late records/reviews may change historical views. Zero matches does not prove business zero.",
    rows,
    totals,
  };
}
const input = z.object({
  dataset: z.enum(operationalDatasets),
  start: z.string(),
  end: z.string(),
});
export async function getOperationalReport(actorId: string, raw: unknown) {
  const v = input.parse(raw);
  reportRange.parse(v);
  requireRule(v.end <= businessDate(), "Future reporting dates are not supported.");
  return automation(
    actorId,
    v.dataset === "certificates" || v.dataset === "rental-charges"
      ? financeRoles
      : ["OWNER", "ADMIN"],
    (tx) => operationalReport(tx, v.dataset, v.start, v.end),
  );
}
export async function exportOperational(actorId: string, raw: unknown) {
  const v = input.parse(raw);
  reportRange.parse(v);
  requireRule(v.end <= businessDate(), "Future reporting dates are not supported.");
  return automation(
    actorId,
    v.dataset === "certificates" || v.dataset === "rental-charges"
      ? financeRoles
      : ["OWNER", "ADMIN"],
    async (tx) => {
      const report = await operationalReport(tx, v.dataset, v.start, v.end);
      await audit(tx, actorId, "OPERATIONAL_REPORT_EXPORTED", v.dataset, {
        start: v.start,
        end: v.end,
        rows: report.rows.length,
      });
      const headers = report.rows.length
        ? Object.keys(report.rows[0])
        : ["dataset", "start", "end", "noMatchingRecords"];
      return csv([
        ["reportStart", "reportEnd", "generatedAt", "dateSemantics", ...headers],
        ...report.rows.map((r) => [
          v.start,
          v.end,
          report.generatedAt,
          report.semantics,
          ...headers.map((k) => r[k] ?? null),
        ]),
      ]);
    },
  );
}
// Phase 4 remains the sole implementation of financial date/reversal/aging exports.
export { exportFinance };
