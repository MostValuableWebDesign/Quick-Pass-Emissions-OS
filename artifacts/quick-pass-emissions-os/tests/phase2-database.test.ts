import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Test database name must end in _test");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
(enabled ? describe : describe.skip)("Phase 2 PostgreSQL approval and ledger workflows", () => {
  let db: PrismaClient;
  let pay: typeof import("../src/modules/payroll/service");
  let cert: typeof import("../src/modules/certificates/service");
  let owner: string, manager: string, bookkeeper: string, employee: string, employeeUser: string;
  const date = "2026-10-01";
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    pay = await import("../src/modules/payroll/service");
    cert = await import("../src/modules/certificates/service");
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "User", "CertificateStock", "CertificateSetting", "CertificatePurchase", "PayrollPeriod" CASCADE',
    );
    owner = (
      await db.user.create({
        data: { name: "Owner", email: `${randomUUID()}@example.test`, role: "OWNER" },
      })
    ).id;
    manager = (
      await db.user.create({
        data: { name: "Manager", email: `${randomUUID()}@example.test`, role: "ADMIN" },
      })
    ).id;
    bookkeeper = (
      await db.user.create({
        data: { name: "Preparing manager", email: `${randomUUID()}@example.test`, role: "ADMIN" },
      })
    ).id;
    const e = await db.employee.create({
      data: {
        user: {
          create: {
            name: "=Formula Employee",
            email: `${randomUUID()}@example.test`,
            role: "EMPLOYEE",
          },
        },
      },
    });
    employee = e.id;
    employeeUser = e.userId;
  });
  async function setupPay(kind: "FIXED" | "HOURLY" = "FIXED", amountCents = 10000) {
    await pay.saveArrangement(owner, {
      employeeId: employee,
      effectiveDate: date,
      kind,
      amountCents,
      reason: "Owner confirmed pay",
    });
    await pay.savePolicy(owner, {
      employeeId: employee,
      effectiveDate: date,
      eligible: true,
      threshold: 50,
      rateCents: 100,
      attribution: "PERSONAL_APPROVED_DAILY",
      reason: "Owner confirmed personal attribution",
    });
    const period = await pay.createPeriod(bookkeeper, {
      startDate: date,
      endDate: "2026-10-02",
      label: "Test period",
    });
    await pay.importEmissions(bookkeeper, [
      {
        employeeId: employee,
        date,
        count: 65,
        sourceRef: "personal-1",
        reason: "Confirmed personal report",
      },
    ]);
    const count = await db.dailyEmission.findFirstOrThrow();
    await pay.approveEmissions(owner, { id: count.id, version: count.version });
    const input = await pay.savePayrollInput(bookkeeper, {
      periodId: period.id,
      employeeId: employee,
      minutes: kind === "HOURLY" ? 1 : 0,
      emissionsComplete: true,
      reason: "Time and count report complete",
      version: 0,
    });
    await pay.approvePayrollInput(owner, { id: input.id, version: input.version });
    return { period, count, input };
  }
  async function setupStock(balance = 1000) {
    await cert.saveCertificateSettings(owner, {
      minimumOrder: 300,
      reorderPoint: 150,
      leadDays: 7,
      windowDays: 30,
      reason: "Confirmed ordering terms",
    });
    await cert.reconcileStock(owner, {
      observed: balance,
      version: 0,
      date,
      reference: "opening",
      reason: "Physical opening count",
    });
  }
  it("pages every count, drains 101 pending approvals, and generates the reviewed period", async () => {
    const { addDays } = await import("../src/lib/time");
    const startDate = "2026-01-01",
      endDate = addDays(startDate, 100);
    await pay.saveArrangement(owner, {
      employeeId: employee,
      effectiveDate: startDate,
      kind: "FIXED",
      amountCents: 1000,
      reason: "Confirmed",
    });
    await pay.savePolicy(owner, {
      employeeId: employee,
      effectiveDate: startDate,
      eligible: false,
      threshold: 0,
      rateCents: 0,
      attribution: "PERSONAL_APPROVED_DAILY",
      reason: "Confirmed",
    });
    const period = await pay.createPeriod(bookkeeper, {
      startDate,
      endDate,
      label: "101-count period",
    });
    const rows = Array.from({ length: 101 }, (_, i) => ({
      employeeId: employee,
      date: addDays(startDate, i),
      count: 0,
      sourceRef: `paged-${i}`,
      reason: "Explicit zero",
    }));
    await pay.importEmissions(bookkeeper, [
      ...rows,
      { ...rows[0], date, sourceRef: "outside-period" },
    ]);
    const first = await pay.payrollOverview(owner, { periodId: period.id });
    const second = await pay.payrollOverview(owner, { periodId: period.id, page: 2 });
    expect(first.countReview.total).toBe(101);
    expect(first.counts).toHaveLength(100);
    expect(second.counts).toHaveLength(1);
    expect(new Set([...first.counts, ...second.counts].map((c) => c.id)).size).toBe(101);
    for (const c of first.counts)
      await pay.approveEmissions(owner, { id: c.id, version: c.version });
    const remaining = await pay.payrollOverview(owner, {
      status: "PENDING",
      periodId: period.id,
      page: 2,
    });
    expect(remaining.countReview).toMatchObject({ total: 1, page: 1 });
    expect(remaining.counts[0].id).toBe(second.counts[0].id);
    await pay.approveEmissions(owner, {
      id: remaining.counts[0].id,
      version: remaining.counts[0].version,
    });
    expect(
      (await pay.payrollOverview(owner, { status: "PENDING", periodId: period.id })).counts,
    ).toHaveLength(0);
    expect((await pay.payrollOverview(owner, { status: "PENDING" })).counts).toHaveLength(1);
    const input = await pay.savePayrollInput(bookkeeper, {
      periodId: period.id,
      employeeId: employee,
      minutes: 0,
      emissionsComplete: true,
      reason: "All 101 days verified",
      version: 0,
    });
    await pay.approvePayrollInput(owner, { id: input.id, version: input.version });
    const draft = await pay.generateDraft(bookkeeper, period.id);
    expect(draft.totalCents).toBe(1000);
  });
  it.each(["", null, false])(
    "rolls back an import containing a missing numeric count: %j",
    async (count) => {
      const row = {
        employeeId: employee,
        date,
        sourceRef: "missing-number",
        reason: "Verified",
        count,
      };
      await expect(pay.importEmissions(bookkeeper, [row])).rejects.toThrow();
      expect(await db.dailyEmission.count()).toBe(0);
    },
  );
  it("re-reads role and active status for all protected reads/mutations", async () => {
    await expect(pay.payrollOverview(employeeUser)).rejects.toThrow("permission");
    await expect(cert.certificateOverview(employeeUser)).rejects.toThrow("permission");
    await expect(pay.exportPayroll(employeeUser, "unknown")).rejects.toThrow("permission");
    await expect(
      pay.saveArrangement(manager, {
        employeeId: employee,
        effectiveDate: date,
        kind: "FIXED",
        amountCents: 100,
        reason: "x",
      }),
    ).rejects.toThrow("permission");
    await db.user.update({ where: { id: owner }, data: { active: false } });
    await expect(cert.certificateOverview(owner)).rejects.toThrow("permission");
    await db.user.update({ where: { id: manager }, data: { role: "EMPLOYEE" } });
    await expect(pay.payrollOverview(manager)).rejects.toThrow("permission");
    expect(await db.auditLog.count()).toBe(0);
  });
  it("imports atomically, retries identical sources and rejects station-total substitution", async () => {
    const row = {
      employeeId: employee,
      date,
      count: 65,
      sourceRef: "one",
      reason: "Personal report",
    };
    expect(await pay.importEmissions(bookkeeper, [row, row])).toEqual({
      inserted: 1,
      duplicates: 1,
    });
    await expect(
      pay.importEmissions(bookkeeper, [
        { ...row, date: "2026-10-02", sourceRef: "two" },
        { ...row, count: 66 },
      ]),
    ).rejects.toThrow("conflicts");
    expect(await db.dailyEmission.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: "EMISSIONS_RECORDED" } })).toBe(1);
    await expect(
      pay.importEmissions(bookkeeper, [{ ...row, date: "2099-01-01", sourceRef: "future" }]),
    ).rejects.toThrow("completed");
  });
  it("requires independent source approval and resets it after versioned corrections", async () => {
    await pay.importEmissions(manager, [
      { employeeId: employee, date, count: 65, sourceRef: "one", reason: "Personal report" },
    ]);
    const row = await db.dailyEmission.findFirstOrThrow();
    await expect(pay.approveEmissions(manager, { id: row.id, version: 0 })).rejects.toThrow(
      "own entry",
    );
    await pay.approveEmissions(owner, { id: row.id, version: 0 });
    await expect(
      pay.correctEmissions(bookkeeper, { id: row.id, version: 0, count: 70, reason: "Correction" }),
    ).rejects.toThrow("changed");
    await pay.correctEmissions(bookkeeper, {
      id: row.id,
      version: 1,
      count: 70,
      reason: "Correct personal count",
    });
    const corrected = await db.dailyEmission.findUniqueOrThrow({ where: { id: row.id } });
    expect(corrected).toMatchObject({
      count: 70,
      version: 2,
      approvedBy: null,
      approvedAt: null,
      createdBy: bookkeeper,
    });
    await db.user.update({ where: { id: employeeUser }, data: { role: "ADMIN" } });
    await expect(pay.approveEmissions(employeeUser, { id: row.id, version: 2 })).rejects.toThrow(
      "own entry or test",
    );
  });
  it("calculates effective daily policies, preserves historical snapshots and exports approved cents", async () => {
    const { period, count, input } = await setupPay();
    await pay.savePolicy(owner, {
      employeeId: employee,
      effectiveDate: "2026-10-02",
      eligible: true,
      threshold: 50,
      rateCents: 200,
      attribution: "PERSONAL_APPROVED_DAILY",
      reason: "New dated rate",
    });
    await pay.importEmissions(bookkeeper, [
      {
        employeeId: employee,
        date: "2026-10-02",
        count: 60,
        sourceRef: "personal-2",
        reason: "Personal report",
      },
    ]);
    const second = await db.dailyEmission.findUniqueOrThrow({ where: { sourceRef: "personal-2" } });
    await pay.approveEmissions(owner, { id: second.id, version: 0 });
    const draft = await pay.generateDraft(bookkeeper, period.id);
    expect(draft.totalCents).toBe(13500);
    await expect(pay.exportPayroll(bookkeeper, draft.id)).rejects.toThrow("Only approved");
    await expect(
      pay.correctEmissions(bookkeeper, { id: count.id, version: 1, count: 99, reason: "Try edit" }),
    ).rejects.toThrow("frozen");
    await expect(
      pay.savePayrollInput(bookkeeper, {
        periodId: period.id,
        employeeId: employee,
        version: input.version + 1,
        minutes: 0,
        emissionsComplete: true,
        reason: "Try edit",
      }),
    ).rejects.toThrow("frozen");
    await expect(
      pay.reviewDraft(bookkeeper, { id: draft.id, decision: "APPROVED", reason: "Self" }),
    ).rejects.toThrow("prepared");
    await pay.reviewDraft(owner, {
      id: draft.id,
      decision: "APPROVED",
      reason: "Reviewed gross compensation",
    });
    const before = await db.payrollLine.findFirstOrThrow();
    await pay.saveArrangement(owner, {
      employeeId: employee,
      effectiveDate: "2026-10-03",
      kind: "FIXED",
      amountCents: 20000,
      reason: "Future compensation",
    });
    await pay.savePolicy(owner, {
      employeeId: employee,
      effectiveDate: "2026-10-03",
      eligible: false,
      threshold: 0,
      rateCents: 0,
      attribution: "PERSONAL_APPROVED_DAILY",
      reason: "Future eligibility",
    });
    expect((await db.payrollLine.findUniqueOrThrow({ where: { id: before.id } })).snapshot).toEqual(
      before.snapshot,
    );
    const csv = await pay.exportPayroll(bookkeeper, draft.id);
    expect(csv).toContain('"10000","3500","13500","USD"');
    expect(csv).toContain("'=Formula Employee");
    await expect(
      pay.savePolicy(owner, {
        employeeId: employee,
        effectiveDate: "2026-09-30",
        eligible: false,
        threshold: 0,
        rateCents: 0,
        attribution: "PERSONAL_APPROVED_DAILY",
        reason: "Historical rewrite",
      }),
    ).rejects.toThrow("frozen");
    expect(await db.auditLog.count({ where: { action: "PAYROLL_EXPORTED" } })).toBe(1);
  });
  it("retains returned draft history, allows corrections, and rejects a preparer's review", async () => {
    const { period, count } = await setupPay();
    const draft = await pay.generateDraft(owner, period.id);
    await expect(
      pay.reviewDraft(owner, { id: draft.id, decision: "APPROVED", reason: "Self" }),
    ).rejects.toThrow("you prepared");
    await pay.reviewDraft(manager, {
      id: draft.id,
      decision: "RETURNED",
      reason: "Correct a personal count",
    });
    await pay.correctEmissions(bookkeeper, {
      id: count.id,
      version: 1,
      count: 66,
      reason: "Reviewed official personal count",
    });
    await expect(pay.generateDraft(bookkeeper, period.id)).rejects.toThrow(
      "approve every recorded",
    );
    await pay.approveEmissions(owner, { id: count.id, version: 2 });
    const revised = await pay.generateDraft(bookkeeper, period.id);
    expect(revised).toMatchObject({ revision: 2, totalCents: 11600 });
    expect(await db.payrollDraft.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({
      status: "RETURNED",
      totalCents: 11500,
    });
  });
  it("serializes overlapping periods and duplicate draft generation", async () => {
    const { period } = await setupPay();
    const result = await Promise.allSettled([
      pay.generateDraft(bookkeeper, period.id),
      pay.generateDraft(bookkeeper, period.id),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.payrollDraft.count()).toBe(1);
    const periods = await Promise.allSettled([
      pay.createPeriod(bookkeeper, { startDate: "2026-10-03", endDate: "2026-10-05", label: "A" }),
      pay.createPeriod(bookkeeper, { startDate: "2026-10-04", endDate: "2026-10-06", label: "B" }),
    ]);
    expect(periods.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("requires owner configuration, source completeness and the configured employee roster", async () => {
    const period = await pay.createPeriod(bookkeeper, {
      startDate: date,
      endDate: date,
      label: "x",
    });
    await expect(
      pay.savePayrollInput(bookkeeper, {
        periodId: period.id,
        employeeId: employee,
        version: 0,
        minutes: 0,
        emissionsComplete: false,
        reason: "Incomplete",
      }),
    ).rejects.toThrow();
    const row = await pay.savePayrollInput(bookkeeper, {
      periodId: period.id,
      employeeId: employee,
      version: 0,
      minutes: 0,
      emissionsComplete: true,
      reason: "All records checked",
    });
    await expect(pay.generateDraft(bookkeeper, period.id)).rejects.toThrow(
      "approve every payroll input",
    );
    await pay.approvePayrollInput(owner, { id: row.id, version: row.version });
    await expect(pay.generateDraft(bookkeeper, period.id)).rejects.toThrow("pay arrangement");
    await pay.saveArrangement(owner, {
      employeeId: employee,
      effectiveDate: date,
      kind: "FIXED",
      amountCents: 10,
      reason: "Confirmed",
    });
    await expect(pay.generateDraft(bookkeeper, period.id)).rejects.toThrow(
      "commission eligibility",
    );
    await pay.savePolicy(owner, {
      employeeId: employee,
      effectiveDate: date,
      eligible: false,
      threshold: 0,
      rateCents: 0,
      attribution: "PERSONAL_APPROVED_DAILY",
      reason: "Not eligible",
    });
    const other = await db.employee.create({
      data: { user: { create: { email: `${randomUUID()}@example.test`, name: "Other" } } },
    });
    await pay.saveArrangement(owner, {
      employeeId: other.id,
      effectiveDate: date,
      kind: "FIXED",
      amountCents: 10,
      reason: "Confirmed other",
    });
    await expect(pay.generateDraft(bookkeeper, period.id)).rejects.toThrow("every active employee");
  });
  it("calculates hourly cents and blocks approval of one's own compensation", async () => {
    const { period } = await setupPay("HOURLY", 1001);
    const draft = await pay.generateDraft(bookkeeper, period.id);
    expect(draft.totalCents).toBe(1517);
    await db.user.update({ where: { id: employeeUser }, data: { role: "ADMIN" } });
    await expect(
      pay.reviewDraft(employeeUser, { id: draft.id, decision: "APPROVED", reason: "Self wages" }),
    ).rejects.toThrow("own compensation");
  });
  it("cancels mistaken open periods without deleting their history", async () => {
    const period = await pay.createPeriod(bookkeeper, {
      startDate: date,
      endDate: "2026-10-02",
      label: "Mistake",
    });
    await pay.cancelPeriod(manager, { id: period.id, reason: "Wrong period length" });
    expect((await db.payrollPeriod.findUniqueOrThrow({ where: { id: period.id } })).status).toBe(
      "CANCELLED",
    );
    const replacement = await pay.createPeriod(bookkeeper, {
      startDate: date,
      endDate: "2026-10-02",
      label: "Replacement",
    });
    expect(replacement.id).not.toBe(period.id);
  });
  it("never infers opening stock, protects stale reconciliation and leaves an immutable ledger", async () => {
    await expect(
      cert.recordUsage(owner, { kind: "USAGE", quantity: 1, date, reference: "one", reason: "x" }),
    ).rejects.toThrow("opening stock");
    await setupStock();
    await expect(
      cert.reconcileStock(owner, {
        observed: 10,
        version: 0,
        date,
        reference: "stale",
        reason: "Stale opening form",
      }),
    ).rejects.toThrow("changed");
    await cert.recordUsage(manager, {
      kind: "VOID",
      quantity: 5,
      date,
      reference: "void",
      reason: "Spoiled certificates",
    });
    await expect(
      cert.reconcileStock(owner, {
        observed: 1000,
        version: 1,
        date,
        reference: "stale2",
        reason: "Stale",
      }),
    ).rejects.toThrow("changed");
    const stock = await db.certificateStock.findUniqueOrThrow({ where: { id: "certificates" } });
    await cert.reconcileStock(owner, {
      observed: 990,
      version: stock.version,
      date,
      reference: "physical",
      reason: "Counted stock",
    });
    const sum = await db.certificateMovement.aggregate({ _sum: { delta: true } });
    expect(sum._sum.delta).toBe(990);
    expect(await db.certificateMovement.count()).toBe(3);
  });
  it("serializes concurrent usage, duplicate references and balance updates", async () => {
    await setupStock();
    const input = { kind: "USAGE", quantity: 600, date, reason: "Personal recorded usage" };
    const result = await Promise.allSettled([
      cert.recordUsage(manager, { ...input, reference: "one" }),
      cert.recordUsage(owner, { ...input, reference: "two" }),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await db.certificateStock.findUniqueOrThrow({ where: { id: "certificates" } })).balance,
    ).toBe(400);
    const duplicate = await Promise.allSettled([
      cert.recordUsage(manager, { ...input, quantity: 1, reference: "same" }),
      cert.recordUsage(owner, { ...input, quantity: 1, reference: "same" }),
    ]);
    expect(duplicate.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await db.certificateStock.findUniqueOrThrow({ where: { id: "certificates" } })).balance,
    ).toBe(399);
    expect(await db.auditLog.count({ where: { action: "CERTIFICATE_CONSUMED" } })).toBe(2);
  });
  it("requires independent purchase approval, records external orders, and receives partial deliveries once", async () => {
    await setupStock(100);
    const request = await cert.requestPurchase(manager, {
      quantity: 300,
      reason: "Confirmed low stock",
    });
    await expect(
      cert.reviewPurchase(manager, { id: request.id, decision: "APPROVED", reason: "Self" }),
    ).rejects.toThrow("you requested");
    await expect(
      cert.recordOrder(bookkeeper, {
        id: request.id,
        confirmation: "order",
        paymentReference: "",
        reason: "x",
      }),
    ).rejects.toThrow("approved");
    await cert.reviewPurchase(owner, {
      id: request.id,
      decision: "APPROVED",
      reason: "Authorized purchase",
    });
    await expect(
      cert.receivePurchase(owner, {
        id: request.id,
        quantity: 300,
        date,
        reference: "delivery",
        reason: "Received",
      }),
    ).rejects.toThrow("external order");
    await cert.recordOrder(bookkeeper, {
      id: request.id,
      confirmation: "external-1",
      paymentReference: "paid-1",
      reason: "Placed through approved channel",
    });
    const receipt = {
      id: request.id,
      quantity: 100,
      date,
      reference: "delivery",
      reason: "Physical delivery checked",
    };
    await cert.receivePurchase(manager, receipt);
    await expect(cert.receivePurchase(manager, receipt)).rejects.toThrow(
      "reference already exists",
    );
    await expect(
      cert.receivePurchase(manager, { ...receipt, quantity: 201, reference: "excess" }),
    ).rejects.toThrow("remaining quantity");
    await cert.receivePurchase(manager, { ...receipt, quantity: 200, reference: "delivery2" });
    expect(
      await db.certificatePurchase.findUniqueOrThrow({ where: { id: request.id } }),
    ).toMatchObject({ status: "RECEIVED", received: 300, paymentReference: "paid-1" });
    expect(
      (await db.certificateStock.findUniqueOrThrow({ where: { id: "certificates" } })).balance,
    ).toBe(400);
  });
  it("recommends one reviewable request for low stock and enforces ordering permissions", async () => {
    await setupStock(10);
    const results = await Promise.all([
      cert.recommendPurchase(manager),
      cert.recommendPurchase(manager),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(results[0].quantity).toBe(300);
    await expect(
      cert.requestPurchase(bookkeeper, { quantity: 300, reason: "Duplicate" }),
    ).rejects.toThrow("open purchase");
    await expect(
      cert.recordUsage(employeeUser, {
        kind: "USAGE",
        quantity: 1,
        date,
        reference: "denied",
        reason: "x",
      }),
    ).rejects.toThrow("permission");
    await expect(
      cert.reviewPurchase(employeeUser, { id: results[0].id, decision: "APPROVED", reason: "x" }),
    ).rejects.toThrow("permission");
    await expect(
      cert.saveCertificateSettings(manager, {
        minimumOrder: 300,
        reorderPoint: 10,
        leadDays: 7,
        windowDays: 30,
        reason: "x",
      }),
    ).rejects.toThrow("permission");
  });
  it("rejects backdated consumption before reconciliation and verifies database nonnegative checks", async () => {
    await setupStock(100);
    const stock = await db.certificateStock.findUniqueOrThrow({ where: { id: "certificates" } });
    await cert.reconcileStock(owner, {
      observed: 100,
      version: stock.version,
      date: "2026-10-02",
      reference: "later",
      reason: "Fresh count",
    });
    await expect(
      cert.recordUsage(manager, {
        kind: "USAGE",
        quantity: 1,
        date,
        reference: "old",
        reason: "x",
      }),
    ).rejects.toThrow("precedes");
    await expect(
      db.certificateStock.update({ where: { id: "certificates" }, data: { balance: -1 } }),
    ).rejects.toThrow();
    expect(
      (await db.certificateStock.findUniqueOrThrow({ where: { id: "certificates" } })).balance,
    ).toBe(100);
  });
});
