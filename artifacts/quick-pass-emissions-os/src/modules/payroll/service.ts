import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { dateString, id, requiredInteger } from "../../lib/validation";
import { businessDate } from "../../lib/time";
import {
  audit,
  employeeExists,
  financeRoles,
  approvalRoles,
  phase2,
  requireRule,
  type Tx,
} from "../phase2";
import { MAX_CENTS, commissionCents, periodAmounts, sumCents, csvCell } from "./calculations";
const integer = (max: number) => requiredInteger(0, max);
const reason = z.string().trim().min(1).max(2000);
const version = integer(2147483647);
const cents = integer(MAX_CENTS);
export const arrangementInput = z.object({
  employeeId: id,
  effectiveDate: dateString,
  kind: z.enum(["FIXED", "HOURLY"]),
  amountCents: cents,
  reason,
});
export const policyInput = z.object({
  employeeId: id,
  effectiveDate: dateString,
  eligible: z.boolean(),
  threshold: integer(100000),
  rateCents: cents,
  attribution: z.literal("PERSONAL_APPROVED_DAILY"),
  reason,
});
export const emissionInput = z.object({
  employeeId: id,
  date: dateString,
  count: integer(100000),
  sourceRef: z.string().trim().min(1).max(160),
  reason,
});
export const periodInput = z
  .object({ startDate: dateString, endDate: dateString, label: z.string().trim().min(1).max(160) })
  .refine((v) => {
    try {
      return (
        v.endDate >= v.startDate && Temporal.PlainDate.from(v.startDate).until(v.endDate).days < 366
      );
    } catch {
      return false;
    }
  }, "Choose a period of 1–366 days.");
export const payrollInput = z.object({
  periodId: id,
  employeeId: id,
  minutes: integer(60 * 24 * 366),
  emissionsComplete: z.literal(true),
  reason,
  version,
});
async function assertDatesOpen(tx: Tx, start: string, end: string) {
  const frozen = await tx.payrollPeriod.count({
    where: {
      startDate: { lte: end },
      endDate: { gte: start },
      OR: [{ status: "APPROVED" }, { drafts: { some: { status: "DRAFT" } } }],
    },
  });
  requireRule(
    !frozen,
    "This date is frozen by a payroll draft or approval. Return the draft before correcting its sources.",
  );
}
// Shared count correction path for explicit owner station reconciliation.
// The caller holds personnel -> Phase 2 -> finance -> station locks; no nested transaction.
export async function reconcileStationCount(
  tx: Tx,
  actorId: string,
  data: {
    employeeId: string;
    date: string;
    count: number;
    expectedVersion: number;
    sourceRef: string;
    reason: string;
  },
) {
  emissionInput.parse(data);
  const actor = await tx.user.findUnique({ where: { id: actorId } });
  requireRule(actor?.active && actor.role === "OWNER", "Owner access is required.");
  await assertDatesOpen(tx, data.date, data.date);
  const old = await tx.dailyEmission.findUnique({
    where: { employeeId_date: { employeeId: data.employeeId, date: data.date } },
  });
  requireRule(
    old ? old.version === data.expectedVersion : data.expectedVersion === 0,
    "Personal count changed. Refresh before replacing it.",
  );
  if (!old) {
    const row = await tx.dailyEmission.create({
      data: {
        employeeId: data.employeeId,
        date: data.date,
        count: data.count,
        sourceRef: data.sourceRef,
        reason: data.reason,
        createdBy: actorId,
      },
    });
    await audit(tx, actorId, "EMISSIONS_RECORDED", row.id, data);
    return row;
  }
  const row = await tx.dailyEmission.update({
    where: { id: old.id },
    data: {
      count: data.count,
      reason: data.reason,
      version: { increment: 1 },
      createdBy: actorId,
      approvedBy: null,
      approvedAt: null,
    },
  });
  await audit(tx, actorId, "EMISSIONS_CORRECTED", row.id, {
    before: {
      count: old.count,
      version: old.version,
      approvedBy: old.approvedBy,
      sourceRef: old.sourceRef,
    },
    after: data,
    sourceRefRetained: true,
    approval: "Independent approval required again.",
  });
  return row;
}
async function openPeriod(tx: Tx, periodId: string) {
  const period = await tx.payrollPeriod.findUnique({
    where: { id: periodId },
    include: { drafts: { where: { status: "DRAFT" } } },
  });
  requireRule(
    period && period.status === "OPEN" && !period.drafts.length,
    "This payroll period is frozen. Return the draft before editing.",
  );
  return period;
}
export async function saveArrangement(actorId: string, input: unknown) {
  const data = arrangementInput.parse(input);
  return phase2(actorId, ["OWNER"], async (tx) => {
    await employeeExists(tx, data.employeeId);
    // A later policy must not change the effective selection of any frozen historical period.
    const next = await tx.payArrangement.findFirst({
      where: { employeeId: data.employeeId, effectiveDate: { gt: data.effectiveDate } },
      orderBy: { effectiveDate: "asc" },
    });
    await assertDatesOpen(tx, data.effectiveDate, next?.effectiveDate ?? "9999-12-31");
    requireRule(
      !(await tx.payArrangement.count({
        where: { employeeId: data.employeeId, effectiveDate: data.effectiveDate },
      })),
      "This effective date already has a pay arrangement. Create a new dated version.",
    );
    const row = await tx.payArrangement.create({ data: { ...data, createdBy: actorId } });
    await audit(tx, actorId, "PAY_ARRANGEMENT_CREATED", row.id, data);
    return row;
  });
}
export async function savePolicy(actorId: string, input: unknown) {
  const data = policyInput.parse(input);
  return phase2(actorId, ["OWNER"], async (tx) => {
    await employeeExists(tx, data.employeeId);
    const next = await tx.commissionPolicy.findFirst({
      where: { employeeId: data.employeeId, effectiveDate: { gt: data.effectiveDate } },
      orderBy: { effectiveDate: "asc" },
    });
    await assertDatesOpen(tx, data.effectiveDate, next?.effectiveDate ?? "9999-12-31");
    requireRule(
      !(await tx.commissionPolicy.count({
        where: { employeeId: data.employeeId, effectiveDate: data.effectiveDate },
      })),
      "This effective date already has a commission policy. Create a new dated version.",
    );
    const row = await tx.commissionPolicy.create({ data: { ...data, createdBy: actorId } });
    await audit(tx, actorId, "COMMISSION_POLICY_CREATED", row.id, data);
    return row;
  });
}
export async function importEmissions(actorId: string, input: unknown) {
  const rows = z.array(emissionInput).min(1).max(1000).parse(input);
  return phase2(actorId, financeRoles, async (tx) => {
    let inserted = 0,
      duplicates = 0;
    for (const data of rows) {
      requireRule(data.date <= businessDate(), "Choose a completed business date for test counts.");
      await employeeExists(tx, data.employeeId);
      const old = await tx.dailyEmission.findFirst({
        where: {
          OR: [{ sourceRef: data.sourceRef }, { employeeId: data.employeeId, date: data.date }],
        },
      });
      if (old) {
        requireRule(
          old.sourceRef === data.sourceRef &&
            old.employeeId === data.employeeId &&
            old.date === data.date &&
            old.count === data.count,
          "This import conflicts with an existing source reference or employee/date. Use a documented correction.",
        );
        duplicates++;
        continue;
      }
      await assertDatesOpen(tx, data.date, data.date);
      const row = await tx.dailyEmission.create({ data: { ...data, createdBy: actorId } });
      await audit(tx, actorId, "EMISSIONS_RECORDED", row.id, data);
      inserted++;
    }
    return { inserted, duplicates };
  });
}
export async function correctEmissions(actorId: string, input: unknown) {
  const data = z.object({ id, count: integer(100000), version, reason }).parse(input);
  return phase2(actorId, financeRoles, async (tx) => {
    const old = await tx.dailyEmission.findUnique({ where: { id: data.id } });
    requireRule(
      old && old.version === data.version,
      "This count changed. Refresh before correcting.",
    );
    await assertDatesOpen(tx, old.date, old.date);
    const row = await tx.dailyEmission.update({
      where: { id: old.id },
      data: {
        count: data.count,
        reason: data.reason,
        version: { increment: 1 },
        createdBy: actorId,
        approvedBy: null,
        approvedAt: null,
      },
    });
    await audit(tx, actorId, "EMISSIONS_CORRECTED", row.id, {
      before: { count: old.count, version: old.version, approvedBy: old.approvedBy },
      after: data,
    });
    return row;
  });
}
export async function approveEmissions(actorId: string, input: unknown) {
  const data = z.object({ id, version }).parse(input);
  return phase2(actorId, approvalRoles, async (tx) => {
    const row = await tx.dailyEmission.findUnique({ where: { id: data.id } });
    requireRule(
      row && !row.approvedAt && row.version === data.version,
      "This count changed or was already approved.",
    );
    const employee = await employeeExists(tx, row.employeeId);
    requireRule(
      row.createdBy !== actorId && employee.userId !== actorId,
      "You cannot approve your own entry or test counts.",
    );
    await assertDatesOpen(tx, row.date, row.date);
    await tx.dailyEmission.update({
      where: { id: row.id },
      data: { approvedBy: actorId, approvedAt: new Date(), version: { increment: 1 } },
    });
    await audit(tx, actorId, "EMISSIONS_APPROVED", row.id, {
      version: row.version,
      count: row.count,
    });
  });
}
export async function createPeriod(actorId: string, input: unknown) {
  const data = periodInput.parse(input);
  return phase2(actorId, financeRoles, async (tx) => {
    requireRule(
      !(await tx.payrollPeriod.count({
        where: {
          status: { not: "CANCELLED" },
          startDate: { lte: data.endDate },
          endDate: { gte: data.startDate },
        },
      })),
      "This period overlaps an existing period.",
    );
    const row = await tx.payrollPeriod.create({ data: { ...data, createdBy: actorId } });
    await audit(tx, actorId, "PAYROLL_PERIOD_CREATED", row.id, data);
    return row;
  });
}
export async function savePayrollInput(actorId: string, input: unknown) {
  const data = payrollInput.parse(input);
  return phase2(actorId, financeRoles, async (tx) => {
    await employeeExists(tx, data.employeeId);
    const period = await openPeriod(tx, data.periodId);
    requireRule(
      period.endDate < businessDate(),
      "This period has not ended. Complete the business day before preparing payroll.",
    );
    const days = Temporal.PlainDate.from(period.startDate).until(period.endDate).days + 1;
    requireRule(
      data.minutes <= days * 24 * 60,
      "Choose minutes within the payroll period's duration.",
    );
    const old = await tx.payrollInput.findUnique({
      where: { periodId_employeeId: { periodId: data.periodId, employeeId: data.employeeId } },
    });
    requireRule(
      old ? old.version === data.version : data.version === 0,
      "This payroll input changed. Refresh before editing.",
    );
    const values = {
      periodId: data.periodId,
      employeeId: data.employeeId,
      minutes: data.minutes,
      emissionsComplete: data.emissionsComplete,
      reason: data.reason,
    };
    const row = old
      ? await tx.payrollInput.update({
          where: { id: old.id },
          data: {
            ...values,
            version: { increment: 1 },
            createdBy: actorId,
            approvedBy: null,
            approvedAt: null,
          },
        })
      : await tx.payrollInput.create({ data: { ...values, version: 1, createdBy: actorId } });
    await audit(tx, actorId, "PAYROLL_INPUT_SAVED", row.id, {
      before: old
        ? { minutes: old.minutes, version: old.version, approvedBy: old.approvedBy }
        : null,
      after: data,
    });
    return row;
  });
}
export async function approvePayrollInput(actorId: string, input: unknown) {
  const data = z.object({ id, version }).parse(input);
  return phase2(actorId, approvalRoles, async (tx) => {
    const row = await tx.payrollInput.findUnique({ where: { id: data.id } });
    requireRule(
      row && !row.approvedAt && row.version === data.version,
      "This payroll input changed or was already approved.",
    );
    await openPeriod(tx, row.periodId);
    const employee = await employeeExists(tx, row.employeeId);
    requireRule(
      row.createdBy !== actorId && employee.userId !== actorId,
      "You cannot approve your own payroll entry or compensation.",
    );
    await tx.payrollInput.update({
      where: { id: row.id },
      data: { approvedBy: actorId, approvedAt: new Date(), version: { increment: 1 } },
    });
    await audit(tx, actorId, "PAYROLL_INPUT_APPROVED", row.id, { version: row.version });
  });
}
export async function generateDraft(actorId: string, periodId: string) {
  id.parse(periodId);
  return phase2(actorId, financeRoles, async (tx) => {
    const period = await openPeriod(tx, periodId);
    requireRule(period.endDate < businessDate(), "This payroll period has not ended.");
    const inputs = await tx.payrollInput.findMany({
      where: { periodId },
      include: { employee: { include: { user: true } } },
      orderBy: { employeeId: "asc" },
    });
    requireRule(
      inputs.length > 0 && inputs.every((i) => i.approvedAt && i.emissionsComplete),
      "Please approve every payroll input and attest that test counts are complete.",
    );
    const roster = await tx.employee.findMany({
      where: {
        user: { active: true },
        payArrangements: { some: { effectiveDate: { lte: period.endDate } } },
      },
      select: { id: true },
    });
    requireRule(
      roster.every((e) => inputs.some((i) => i.employeeId === e.id)),
      "Please include every active employee with an effective pay arrangement in this period.",
    );
    const counts = await tx.dailyEmission.findMany({
      where: { date: { gte: period.startDate, lte: period.endDate } },
      orderBy: { date: "asc" },
    });
    requireRule(
      counts.every((c) => inputs.some((i) => i.employeeId === c.employeeId)),
      "Please include a payroll input for every employee with recorded counts in this period.",
    );
    requireRule(
      counts.every((c) => c.approvedAt),
      "Please approve every recorded test count in this period.",
    );
    const lines = [];
    for (const input of inputs) {
      const arrangements = await tx.payArrangement.findMany({
        where: { employeeId: input.employeeId, effectiveDate: { lte: period.endDate } },
        orderBy: { effectiveDate: "desc" },
      });
      const arrangement = arrangements.find((a) => a.effectiveDate <= period.startDate);
      requireRule(
        arrangement,
        `Configure a pay arrangement for ${input.employee.user.name} before this period starts.`,
      );
      requireRule(
        !arrangements.some((a) => a.effectiveDate > period.startDate),
        "This period crosses a pay arrangement change. Use periods that do not cross rate changes.",
      );
      requireRule(
        arrangement.kind === "HOURLY" || input.minutes === 0,
        "Choose zero minutes for fixed compensation; the configured amount covers one entire period.",
      );
      const policies = await tx.commissionPolicy.findMany({
        where: { employeeId: input.employeeId, effectiveDate: { lte: period.endDate } },
        orderBy: { effectiveDate: "desc" },
      });
      requireRule(
        policies.some((p) => p.effectiveDate <= period.startDate),
        "Configure explicit commission eligibility for every payroll employee before the period starts.",
      );
      const daily = counts
        .filter((c) => c.employeeId === input.employeeId)
        .map((c) => {
          const policy = policies.find((p) => p.effectiveDate <= c.date);
          requireRule(policy, "Configure a commission policy for every test date.");
          return {
            id: c.id,
            date: c.date,
            count: c.count,
            sourceRef: c.sourceRef,
            version: c.version,
            approvedBy: c.approvedBy,
            approvedAt: c.approvedAt!.toISOString(),
            policy: {
              id: policy.id,
              effectiveDate: policy.effectiveDate,
              eligible: policy.eligible,
              threshold: policy.threshold,
              rateCents: policy.rateCents,
              attribution: policy.attribution,
            },
            cents: commissionCents(c.count, policy.threshold, policy.rateCents, policy.eligible),
          };
        });
      const amounts = periodAmounts(
        arrangement,
        input.minutes,
        daily.map((d) => d.cents),
      );
      requireRule(
        amounts.baseCents !== null &&
          amounts.commissionCents !== null &&
          amounts.totalCents !== null,
        "Payroll period inputs are incomplete.",
      );
      lines.push({
        employeeId: input.employeeId,
        employeeName: input.employee.user.name,
        baseCents: amounts.baseCents,
        commissionCents: amounts.commissionCents,
        totalCents: amounts.totalCents,
        snapshot: {
          period: { startDate: period.startDate, endDate: period.endDate },
          arrangement: {
            id: arrangement.id,
            effectiveDate: arrangement.effectiveDate,
            kind: arrangement.kind,
            amountCents: arrangement.amountCents,
          },
          input: {
            id: input.id,
            version: input.version,
            minutes: input.minutes,
            emissionsComplete: input.emissionsComplete,
            approvedBy: input.approvedBy,
            approvedAt: input.approvedAt!.toISOString(),
          },
          daily,
          rounding:
            "Hourly cents rounded half up once per employee/period. Daily commission exact cents.",
        },
      });
    }
    const revision = (await tx.payrollDraft.count({ where: { periodId } })) + 1;
    const draft = await tx.payrollDraft.create({
      data: {
        periodId,
        revision,
        preparedBy: actorId,
        totalCents: sumCents(lines.map((l) => l.totalCents)),
        lines: { create: lines },
      },
    });
    await audit(tx, actorId, "PAYROLL_DRAFT_GENERATED", draft.id, {
      revision,
      periodId,
      totalCents: draft.totalCents,
    });
    return draft;
  });
}
export async function reviewDraft(actorId: string, input: unknown) {
  const data = z.object({ id, decision: z.enum(["APPROVED", "RETURNED"]), reason }).parse(input);
  return phase2(actorId, approvalRoles, async (tx) => {
    const draft = await tx.payrollDraft.findUnique({
      where: { id: data.id },
      include: { lines: { include: { employee: true } } },
    });
    requireRule(draft?.status === "DRAFT", "This draft was already reviewed.");
    requireRule(draft.preparedBy !== actorId, "You cannot review a payroll draft you prepared.");
    requireRule(
      !draft.lines.some((l) => l.employee.userId === actorId),
      "You cannot review a payroll draft containing your own compensation.",
    );
    await tx.payrollDraft.update({
      where: { id: draft.id },
      data: {
        status: data.decision,
        reviewedBy: actorId,
        reviewedAt: new Date(),
        reviewReason: data.reason,
      },
    });
    if (data.decision === "APPROVED")
      await tx.payrollPeriod.update({
        where: { id: draft.periodId },
        data: { status: "APPROVED" },
      });
    await audit(tx, actorId, `PAYROLL_${data.decision}`, draft.id, { reason: data.reason });
  });
}
export const countReviewInput = z.object({
  page: requiredInteger(1, 1000000000).default(1),
  status: z.enum(["ALL", "PENDING"]).default("ALL"),
  periodId: z.preprocess((v) => (v === "" ? undefined : v), id.optional()),
});
export async function payrollOverview(actorId: string, review: unknown = {}) {
  const filter = countReviewInput.parse(review);
  return phase2(actorId, financeRoles, async (tx) => {
    const period = filter.periodId
      ? await tx.payrollPeriod.findUnique({ where: { id: filter.periodId } })
      : null;
    requireRule(!filter.periodId || period, "Choose an existing payroll period.");
    const where = {
      ...(filter.status === "PENDING" ? { approvedAt: null } : {}),
      ...(period ? { date: { gte: period.startDate, lte: period.endDate } } : {}),
    };
    const total = await tx.dailyEmission.count({ where });
    const pageSize = 100;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    // Pending approvals disappear as they are reviewed; keep the current page reachable.
    const page = Math.min(filter.page, totalPages);
    return {
      countReview: { ...filter, page, pageSize, total, totalPages, period },
      employees: await tx.employee.findMany({
        select: { id: true, demo: true, user: { select: { name: true, active: true } } },
        orderBy: { user: { name: "asc" } },
      }),
      arrangements: await tx.payArrangement.findMany({
        orderBy: { effectiveDate: "desc" },
        take: 100,
        include: { employee: { select: { user: { select: { name: true } } } } },
      }),
      policies: await tx.commissionPolicy.findMany({
        orderBy: { effectiveDate: "desc" },
        take: 100,
        include: { employee: { select: { user: { select: { name: true } } } } },
      }),
      periods: await tx.payrollPeriod.findMany({ orderBy: [{ startDate: "desc" }, { id: "asc" }] }),
      counts: await tx.dailyEmission.findMany({
        where,
        orderBy: [{ date: "desc" }, { id: "asc" }],
        take: pageSize,
        skip: (page - 1) * pageSize,
        include: { employee: { select: { user: { select: { name: true } } } } },
      }),
    };
  });
}
export async function payrollDetail(actorId: string, periodId: string) {
  return phase2(actorId, financeRoles, (tx) =>
    tx.payrollPeriod.findUnique({
      where: { id: id.parse(periodId) },
      include: {
        inputs: { include: { employee: { select: { user: { select: { name: true } } } } } },
        drafts: {
          orderBy: { revision: "desc" },
          include: { lines: { orderBy: { employeeName: "asc" } } },
        },
      },
    }),
  );
}
export async function exportPayroll(actorId: string, draftId: string) {
  return phase2(actorId, financeRoles, async (tx) => {
    const draft = await tx.payrollDraft.findUnique({
      where: { id: id.parse(draftId) },
      include: { period: true, lines: { orderBy: { employeeId: "asc" } } },
    });
    requireRule(draft?.status === "APPROVED", "Only approved payroll drafts can be exported.");
    const rows: (string | number)[][] = [
      [
        "draft_id",
        "revision",
        "period_start",
        "period_end",
        "employee_id",
        "employee_name",
        "base_cents",
        "commission_cents",
        "gross_cents",
        "currency",
        "approved_by",
        "approved_at",
      ],
    ];
    for (const line of draft.lines)
      rows.push([
        draft.id,
        draft.revision,
        draft.period.startDate,
        draft.period.endDate,
        line.employeeId,
        line.employeeName,
        line.baseCents,
        line.commissionCents,
        line.totalCents,
        "USD",
        draft.reviewedBy!,
        draft.reviewedAt!.toISOString(),
      ]);
    await audit(tx, actorId, "PAYROLL_EXPORTED", draft.id, {
      revision: draft.revision,
      rows: draft.lines.length,
    });
    return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  });
}

export async function cancelPeriod(actorId: string, input: unknown) {
  const data = z.object({ id, reason }).parse(input);
  return phase2(actorId, approvalRoles, async (tx) => {
    const period = await openPeriod(tx, data.id);
    await tx.payrollPeriod.update({
      where: { id: period.id },
      data: { status: "CANCELLED", cancelledReason: data.reason },
    });
    await audit(tx, actorId, "PAYROLL_PERIOD_CANCELLED", period.id, { reason: data.reason });
  });
}
