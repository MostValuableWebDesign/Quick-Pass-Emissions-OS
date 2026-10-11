import { businessDate, addDays } from "@/lib/time";
import { automation } from "../automation/transaction";
import { forecasts } from "../automation/forecasts";
import { report } from "../finance/service";
import { sumCents } from "../finance/rules";
import { commissionCents, periodAmounts } from "../payroll/calculations";
import { currentRecords, stationConfig } from "../station/service";
import { BusinessError } from "../phase2";

export type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  severity: "critical" | "urgent" | "soon";
  date: string;
};
const urgency = { critical: 0, urgent: 1, soon: 2 };
export function sortAttention(items: AttentionItem[]) {
  return items.sort(
    (a, b) =>
      urgency[a.severity] - urgency[b.severity] ||
      a.date.localeCompare(b.date) ||
      a.id.localeCompare(b.id),
  );
}
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);

/** Read only. Share mutation locks and recheck the actor before reading business records. */
export async function businessDashboard(actorId: string, now = new Date()) {
  return automation(actorId, ["OWNER", "ADMIN"], async (tx, actor) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183507)`;
    const today = businessDate(now);
    let hash: string | null = null;
    try {
      hash = stationConfig().hash;
    } catch (error) {
      if (!(error instanceof BusinessError)) throw error;
    }
    const [
      finance,
      inventory,
      employees,
      counts,
      policies,
      arrangements,
      periods,
      rentals,
      reminder,
    ] = await Promise.all([
      report(tx, today, today),
      forecasts(tx, today),
      tx.employee.findMany({
        select: {
          id: true,
          demo: true,
          certificationExpires: true,
          user: { select: { name: true, active: true } },
        },
      }),
      tx.dailyEmission.findMany({ where: { date: today } }),
      tx.commissionPolicy.findMany({
        where: { effectiveDate: { lte: today } },
        orderBy: { effectiveDate: "desc" },
      }),
      tx.payArrangement.findMany({
        where: { effectiveDate: { lte: today } },
        orderBy: { effectiveDate: "desc" },
      }),
      // Aggregate weekly/period hours cannot establish hours worked today.
      tx.payrollPeriod.findMany({
        where: { startDate: today, endDate: today, status: { not: "CANCELLED" } },
        include: {
          inputs: true,
          drafts: { where: { status: "APPROVED" }, include: { lines: true } },
        },
      }),
      tx.rentalCharge.findMany({
        where: { voidedAt: null, dueDate: { lt: today } },
        include: { payments: true, agreement: { select: { id: true, tenant: true } } },
      }),
      tx.reminderPolicy.findFirst({
        where: { kind: "CERTIFICATION" },
        orderBy: { revision: "desc" },
      }),
    ]);
    const records = hash ? await currentRecords(tx, hash, today, today) : [];
    const importedToday = hash
      ? await tx.stationImport.findFirst({
          where: {
            stationHash: hash,
            status: "IMPORTED",
            startDate: { lte: today },
            endDate: { gte: today },
          },
          select: { id: true },
        })
      : null;
    const rules = hash
      ? await tx.stationRule.findMany({
          where: { stationHash: hash, effectiveDate: { lte: today } },
          orderBy: { effectiveDate: "desc" },
        })
      : [];
    const retail = records.filter((r) => r.state === "CONFIRMED" && r.disposition === "RETAIL");
    const prices = retail.map((r) => rules.find((p) => p.outcome === r.source.outcome)?.priceCents);
    const priced = prices.filter((p): p is number => p !== undefined);
    const roster = employees.filter(
      (e) =>
        e.user.active ||
        counts.some((c) => c.employeeId === e.id) ||
        periods.some(
          (p) =>
            p.inputs.some((i) => i.employeeId === e.id) ||
            p.drafts.some((d) => d.lines.some((l) => l.employeeId === e.id)),
        ),
    );
    const pay = roster.map((employee) => {
      const count = counts.find((c) => c.employeeId === employee.id);
      const policy = policies.find((p) => p.employeeId === employee.id);
      const arrangement = arrangements.find((a) => a.employeeId === employee.id) ?? null;
      const singleDay = periods.length === 1 ? periods[0] : null;
      const input = singleDay?.inputs.find((i) => i.employeeId === employee.id);
      const snapshots = singleDay?.drafts.flatMap((d) =>
        d.lines.filter((l) => l.employeeId === employee.id),
      );
      const snapshot = snapshots?.length === 1 ? snapshots[0] : null;
      let commission: number | null =
        snapshot?.commissionCents ?? (policy?.eligible === false ? 0 : null);
      let calculationUnavailable = false;
      if (!snapshot && policy?.eligible && count?.approvedAt) {
        try {
          commission = commissionCents(
            count.count,
            policy.threshold,
            policy.rateCents,
            true,
            policy,
          );
        } catch {
          calculationUnavailable = true;
        }
      }
      let base: number | null = snapshot?.baseCents ?? null;
      let baseCalculationUnavailable = false;
      if (!snapshot) {
        try {
          base = periodAmounts(arrangement, input?.approvedAt ? input.minutes : null, [], {
            paidDays: input?.paidDays,
            periodDays: 1,
          }).baseCents;
        } catch {
          baseCalculationUnavailable = true;
        }
      }
      return {
        id: employee.id,
        name: employee.user.name,
        baseCents: base,
        commissionCents: commission,
        missing: [
          ...(base === null
            ? [
                baseCalculationUnavailable
                  ? "base-pay calculation exceeds supported range"
                  : "approved daily base-pay inputs",
              ]
            : []),
          ...(commission === null
            ? [
                calculationUnavailable
                  ? "commission calculation exceeds supported range"
                  : !policy
                    ? "commission policy"
                    : "approved test count",
              ]
            : []),
        ],
      };
    });
    const completeBase = pay.length > 0 && pay.every((p) => p.baseCents !== null);
    const completeCommission = pay.length > 0 && pay.every((p) => p.commissionCents !== null);
    const baseCents = completeBase ? sumCents(pay.map((p) => p.baseCents!)) : null;
    const commissionTotal = completeCommission
      ? sumCents(pay.map((p) => p.commissionCents!))
      : null;
    const attention: AttentionItem[] = [];
    for (const item of inventory) {
      // Unknown balances/thresholds are a setup gap, not evidence of low stock.
      if (item.balance === null || item.threshold === null || !item.low) continue;
      if (item.key === "certificates" && item.state === "UNCONFIGURED") continue;
      attention.push({
        id: `stock:${item.key}`,
        title:
          item.key === "certificates"
            ? "Certificate reorder needed"
            : `${item.name}: reorder needed`,
        detail: `${item.balance} ${item.unit.toLowerCase().replaceAll("_", " ")} remaining · reorder at ${item.threshold}`,
        href: item.key === "certificates" ? "/certificates" : "/chemicals",
        severity: item.balance === 0 ? "critical" : "urgent",
        date: today,
      });
    }
    // Display window only; this does not create or enable a reminder policy.
    const certificationDays = reminder?.advanceDays ?? 30;
    for (const employee of employees) {
      const expires = employee.certificationExpires;
      if (!employee.user.active || !expires || expires > addDays(today, certificationDays))
        continue;
      attention.push({
        id: `certification:${employee.id}`,
        title: `${employee.user.name}: certification ${expires < today ? "expired" : "expiring"}`,
        detail: `${expires < today ? "Expired" : "Expires"} ${expires}`,
        href: `/employees/${employee.id}`,
        severity: expires <= today ? "critical" : "soon",
        date: expires,
      });
    }
    for (const invoice of finance.aging.filter((i) => i.days > 0))
      attention.push({
        id: `invoice:${invoice.id}`,
        title: `${invoice.dealership.name}: overdue invoice ${invoice.number}`,
        detail: `${money(invoice.remainingCents)} outstanding · due ${invoice.dueDate}`,
        href: `/invoices/${invoice.id}`,
        severity: "urgent",
        date: invoice.dueDate,
      });
    for (const charge of rentals) {
      const remaining =
        charge.amountCents -
        sumCents(charge.payments.filter((p) => p.date <= today).map((p) => p.amountCents));
      if (remaining <= 0) continue;
      attention.push({
        id: `rental:${charge.id}`,
        title: `${charge.agreement.tenant}: overdue rental balance`,
        detail: `${money(remaining)} outstanding · due ${charge.dueDate}`,
        href: `/rentals/${charge.agreement.id}`,
        severity: "urgent",
        date: charge.dueDate,
      });
    }
    return {
      today,
      role: actor.role,
      demo: employees.some((e) => e.demo),
      tests: {
        performed: records.length || importedToday ? records.length : null,
        eligible: records.filter((r) => r.state === "CONFIRMED" && r.eligible === true).length,
        awaitingReview: records.filter((r) => r.state !== "CONFIRMED" || r.eligible === null)
          .length,
        approvedEmployeeCounts: sumCents(counts.filter((c) => c.approvedAt).map((c) => c.count)),
      },
      revenue: {
        received: sumCents([finance.totals.dealerReceipts, finance.totals.rentalReceipts]),
        billed: finance.totals.billed,
        retailEstimate: priced.length ? sumCents(priced) : null,
        unpricedRetail: retail.length - priced.length,
        otherEstimates: finance.totals.estimatedRevenue,
        verifiedManual: finance.totals.verifiedRevenue,
        unverifiedManual: finance.totals.manualRevenue,
      },
      pay: {
        baseCents,
        commissionCents: commissionTotal,
        knownBaseCents: sumCents(pay.flatMap((p) => (p.baseCents === null ? [] : [p.baseCents]))),
        knownCommissionCents: sumCents(
          pay.flatMap((p) => (p.commissionCents === null ? [] : [p.commissionCents])),
        ),
        grossCents:
          baseCents !== null && commissionTotal !== null
            ? sumCents([baseCents, commissionTotal])
            : null,
        missing: pay.filter((p) => p.missing.length),
        employees: pay.length,
      },
      attention: sortAttention(attention),
      certificationDays,
      unknownInventory: inventory.filter(
        (i) => i.balance === null || i.threshold === null || i.state === "UNCONFIGURED",
      ).length,
    };
  });
}
