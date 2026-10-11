import { z } from "zod";
import { dateString, requiredInteger } from "../../lib/validation";
import { businessDate } from "../../lib/time";
import { phase2, financeRoles } from "../phase2";
import { weekBounds } from "../station/projections";
import { baseRateSummary, commissionCents, exactCents, sumCents } from "./calculations";

export const PAYROLL_PAGE_SIZE = 15;
export const dashboardInput = z.object({
  date: dateString.default(() => businessDate()),
  weekStart: requiredInteger(1, 7).default(1),
  employeesPage: requiredInteger(1, 1000000000).default(1),
  historyPage: requiredInteger(1, 1000000000).default(1),
  periodsPage: requiredInteger(1, 1000000000).default(1),
});
export function pageInfo(total: number, requested: number) {
  const totalPages = Math.max(1, Math.ceil(total / PAYROLL_PAGE_SIZE));
  return { total, totalPages, page: Math.min(requested, totalPages), pageSize: PAYROLL_PAGE_SIZE };
}
/** Keep missing approvals/policies distinct from explicit, approved zero commission. */
export function commissionSummary(
  date: string,
  counts: { date: string; count: number; approvedAt: Date | null }[],
  policies: {
    effectiveDate: string;
    threshold: number;
    rateCents: number;
    eligible: boolean;
    volumeThreshold?: number | null;
    volumeIncreaseCents?: number | null;
  }[],
) {
  const ordered = [...policies].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  const approved = counts.filter((c) => c.approvedAt);
  const amount = (c: (typeof counts)[number]) => {
    const p = ordered.find((p) => p.effectiveDate <= c.date);
    if (!p) return null;
    try {
      return commissionCents(c.count, p.threshold, p.rateCents, p.eligible, p);
    } catch {
      return null;
    }
  };
  const values = approved.map(amount);
  const missing = values.filter((v) => v === null).length;
  let weekly: number | null = null;
  if (approved.length && !missing) {
    try {
      weekly = sumCents(values as number[]);
    } catch {
      /* Unavailable rather than a false balance. */
    }
  }
  const daily = approved.find((c) => c.date === date);
  return {
    daily: daily ? amount(daily) : null,
    weekly,
    average:
      weekly === null
        ? null
        : exactCents(
            (BigInt(weekly) + BigInt(Math.floor(approved.length / 2))) / BigInt(approved.length),
          ),
    approvedDays: approved.length,
    pendingDays: counts.length - approved.length,
    missingPolicies: missing,
  };
}
const historyWhere = {
  OR: ["PAY_", "PAYROLL_", "COMMISSION_", "EMISSIONS_", "EMISSION_"].map((prefix) => ({
    action: { startsWith: prefix },
  })),
};
export async function payrollDashboard(actorId: string, input: unknown = {}) {
  const filter = dashboardInput.parse(input);
  const week = weekBounds(filter.date, filter.weekStart);
  return phase2(actorId, financeRoles, async (tx) => {
    const employeesPaging = pageInfo(await tx.employee.count(), filter.employeesPage);
    const historyPaging = pageInfo(
      await tx.auditLog.count({ where: historyWhere }),
      filter.historyPage,
    );
    const periodsPaging = pageInfo(await tx.payrollPeriod.count(), filter.periodsPage);
    const employees = await tx.employee.findMany({
      orderBy: [{ user: { name: "asc" } }, { id: "asc" }],
      take: PAYROLL_PAGE_SIZE,
      skip: (employeesPaging.page - 1) * PAYROLL_PAGE_SIZE,
      include: {
        user: { select: { name: true, active: true } },
        payArrangements: {
          where: { effectiveDate: { lte: filter.date } },
          orderBy: { effectiveDate: "desc" },
          take: 1,
        },
        commissionPolicies: {
          where: { effectiveDate: { lte: week.end > filter.date ? week.end : filter.date } },
          orderBy: { effectiveDate: "desc" },
        },
        emissions: {
          where: { date: { gte: week.start, lte: week.end } },
          orderBy: { date: "asc" },
        },
        payrollLines: {
          where: { draft: { status: "APPROVED", period: { endDate: { lte: filter.date } } } },
          orderBy: [{ draft: { period: { endDate: "desc" } } }, { id: "asc" }],
          take: 1,
          include: {
            draft: {
              select: {
                period: { select: { id: true, label: true, startDate: true, endDate: true } },
              },
            },
          },
        },
      },
    });
    return {
      filter,
      week,
      employeesPaging,
      historyPaging,
      periodsPaging,
      employees: employees.map((e) => {
        const arrangement = e.payArrangements[0] ?? null;
        const policy = e.commissionPolicies.find((p) => p.effectiveDate <= filter.date) ?? null;
        let base: ReturnType<typeof baseRateSummary> = { daily: null, weekly: null };
        try {
          base = baseRateSummary(arrangement);
        } catch {
          /* Display unavailable for unsupported totals. */
        }
        return {
          id: e.id,
          name: e.user.name,
          active: e.user.active,
          arrangement,
          policy,
          base,
          commission: commissionSummary(filter.date, e.emissions, e.commissionPolicies),
          approvedPayroll: e.payrollLines[0] ?? null,
        };
      }),
      history: await tx.auditLog.findMany({
        where: historyWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: PAYROLL_PAGE_SIZE,
        skip: (historyPaging.page - 1) * PAYROLL_PAGE_SIZE,
        include: { actor: { select: { name: true } } },
      }),
      periods: await tx.payrollPeriod.findMany({
        orderBy: [{ startDate: "desc" }, { id: "asc" }],
        take: PAYROLL_PAGE_SIZE,
        skip: (periodsPaging.page - 1) * PAYROLL_PAGE_SIZE,
      }),
    };
  });
}
