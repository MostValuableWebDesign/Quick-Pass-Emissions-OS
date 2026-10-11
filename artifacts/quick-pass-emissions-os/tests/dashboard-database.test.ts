import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { businessDate, addDays, dueInstant } from "../src/lib/time";
import { fixtureStation, reportFixture } from "./station-fixtures";
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Disposable _test database required.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
(enabled ? describe : describe.skip)("Business dashboard isolated PostgreSQL", () => {
  let db: PrismaClient;
  let dashboard: typeof import("../src/modules/dashboard/service").businessDashboard;
  let station: typeof import("../src/modules/station/service");
  let owner: string, manager: string, staff: string, employee: string;
  const today = businessDate(),
    yesterday = addDays(today, -1),
    now = dueInstant(today, "12:00");
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    dashboard = (await import("../src/modules/dashboard/service")).businessDashboard;
    station = await import("../src/modules/station/service");
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "StationReconciliation","StationRevision","StationRecord","StationImport","StationSetting","StationMapping","StationRule","PayrollPeriod","DailyEmission","FinanceEntry","BayRentalAgreement","SummarySchedule","ReminderPolicy","ForecastPolicy","AutomationJob","ActionReminder","User","CarwashBay","ChemicalItem","Dealership","CertificateSetting","CertificateStock","CertificateMovement","BusinessSetting","Closure" CASCADE',
    );
    process.env.GA_STATION_ID = fixtureStation;
    const user = async (role: "OWNER" | "ADMIN" | "EMPLOYEE") =>
      (
        await db.user.create({
          data: { name: `Fixture ${role}`, email: `${randomUUID()}@example.test`, role },
        })
      ).id;
    owner = await user("OWNER");
    manager = await user("ADMIN");
    staff = await user("EMPLOYEE");
    employee = (await db.employee.create({ data: { userId: staff } })).id;
  });
  async function commission(count = 65, approved = true) {
    await db.commissionPolicy.create({
      data: {
        employeeId: employee,
        effectiveDate: yesterday,
        eligible: true,
        threshold: 50,
        rateCents: 100,
        volumeThreshold: 60,
        volumeIncreaseCents: 50,
        attribution: "PERSONAL_APPROVED_DAILY",
        reason: "Fixture",
        createdBy: owner,
      },
    });
    await db.dailyEmission.create({
      data: {
        employeeId: employee,
        date: today,
        count,
        sourceRef: randomUUID(),
        reason: "Fixture",
        createdBy: manager,
        approvedBy: approved ? owner : null,
        approvedAt: approved ? now : null,
      },
    });
  }
  async function invoice(
    name: string,
    dueDate = yesterday,
    issueDate = yesterday,
    approved = true,
  ) {
    const dealer = await db.dealership.create({
      data: { code: randomUUID(), name, billingAddress: "Fixture" },
    });
    return db.dealerInvoice.create({
      data: {
        number: randomUUID(),
        dealershipId: dealer.id,
        issueDate,
        dueDate,
        state: approved ? "APPROVED" : "DRAFT",
        subtotalCents: 10000,
        taxBps: 0,
        taxCents: 0,
        totalCents: 10000,
        snapshot: {},
        notes: "Fixture",
        createdBy: manager,
        approvedBy: approved ? owner : null,
        approvedAt: approved ? now : null,
      },
    });
  }
  async function rental() {
    const bay = await db.carwashBay.create({
      data: { identifier: randomUUID(), type: "SELF_SERVICE", slot: 1 },
    });
    const agreement = await db.bayRentalAgreement.create({
      data: {
        bayId: bay.id,
        tenant: "Fixture tenant",
        contact: "Fixture",
        reference: randomUUID(),
        startDate: addDays(today, -60),
        monthlyCents: 10000,
        dueDay: 1,
        responsibilities: "Fixture",
        authorizedBy: owner,
      },
    });
    return db.rentalCharge.create({
      data: {
        agreementId: agreement.id,
        month: today.slice(0, 7),
        dueDate: yesterday,
        amountCents: 10000,
        snapshot: {},
        createdBy: manager,
      },
    });
  }
  it("keeps missing inputs unknown, renders without station configuration, reads only, and rechecks management access", async () => {
    delete process.env.GA_STATION_ID;
    const before = {
      audits: await db.auditLog.count(),
      reminders: await db.actionReminder.count(),
    };
    const data = await dashboard(manager, now);
    expect(data).toMatchObject({
      today,
      role: "ADMIN",
      tests: { performed: null },
      pay: { grossCents: null, baseCents: null, commissionCents: null },
      attention: [],
    });
    expect(data.pay.missing[0].missing).toContain("approved daily base-pay inputs");
    expect({
      audits: await db.auditLog.count(),
      reminders: await db.actionReminder.count(),
    }).toEqual(before);
    await expect(dashboard(staff, now)).rejects.toThrow("permission");
    await db.user.update({ where: { id: manager }, data: { active: false } });
    await expect(dashboard(manager, now)).rejects.toThrow("permission");
    await db.user.update({ where: { id: owner }, data: { role: "EMPLOYEE" } });
    await expect(dashboard(owner, now)).rejects.toThrow("permission");
  });
  it("deduplicates today's imported tests, distinguishes eligibility review and prices only reviewed retail", async () => {
    await station.saveMapping(owner, {
      inspector: "Fixture Inspector",
      employeeId: employee,
      effectiveDate: yesterday,
      reason: "Fixture",
    });
    await station.saveRule(owner, {
      outcome: "Pass",
      effectiveDate: yesterday,
      eligible: true,
      priceCents: 2501,
      reason: "Fixture",
    });
    const body = reportFixture(today, [
      {
        vin: "1SYNTHETIC0000001",
        inspector: "Fixture Inspector",
        certificate: "SYN00001",
        result: "Pass",
        time: "09:00 AM",
      },
      {
        vin: "1SYNTHETIC0000002",
        inspector: "Fixture Inspector",
        certificate: "SYN00002",
        result: "Pass",
        time: "09:01 AM",
      },
    ]);
    await station.importReport(owner, { body, reason: "Fixture" });
    await station.importReport(owner, { body, reason: "Duplicate source" });
    const rows = await db.stationRecord.findMany({ orderBy: { id: "asc" } });
    await station.reviewRecord(owner, {
      recordId: rows[0].id,
      version: rows[0].version,
      disposition: "RETAIL",
      eligibility: "RULE",
      reattribute: true,
      reason: "Fixture",
    });
    const data = await dashboard(manager, now);
    expect(data.tests).toMatchObject({ performed: 2, eligible: 1, awaitingReview: 1 });
    expect(data.revenue.retailEstimate).toBe(2501);
    expect(data.pay.grossCents).toBeNull(); // Station counts are not payroll approval.
    await db.stationRecord.update({ where: { id: rows[1].id }, data: { state: "SUPERSEDED" } });
    expect((await dashboard(owner, now)).tests.performed).toBe(1);
  });
  it("calculates approved personal commissions with volume tiers without prorating weekly base or using pending counts", async () => {
    await commission();
    await db.payArrangement.create({
      data: {
        employeeId: employee,
        effectiveDate: yesterday,
        kind: "WEEKLY",
        amountCents: 80000,
        scheduledDaysPerWeek: 5,
        reason: "Fixture",
        createdBy: owner,
      },
    });
    let data = await dashboard(owner, now);
    expect(data.pay).toMatchObject({
      baseCents: null,
      commissionCents: 1750,
      knownCommissionCents: 1750,
      grossCents: null,
    });
    await db.dailyEmission.updateMany({ data: { approvedAt: null, approvedBy: null } });
    data = await dashboard(owner, now);
    expect(data.pay.commissionCents).toBeNull();
    expect(data.pay.knownCommissionCents).toBe(0);
    expect(data.pay.missing[0].missing).toContain("approved test count");
    await db.dailyEmission.updateMany({ data: { count: 0, approvedAt: now, approvedBy: owner } });
    expect((await dashboard(owner, now)).pay.commissionCents).toBe(0);
    await db.dailyEmission.updateMany({ data: { count: 100000 } });
    await db.commissionPolicy.updateMany({ data: { rateCents: 2000000000 } });
    expect((await dashboard(owner, now)).pay.missing[0].missing).toContain(
      "commission calculation exceeds supported range",
    );
  });
  it("uses approved daily inputs and frozen daily snapshots, never aggregate multi-day hours", async () => {
    await commission();
    await db.payArrangement.create({
      data: {
        employeeId: employee,
        effectiveDate: yesterday,
        kind: "HOURLY",
        amountCents: 1200,
        reason: "Fixture",
        createdBy: owner,
      },
    });
    const period = await db.payrollPeriod.create({
      data: {
        startDate: today,
        endDate: today,
        label: "Fixture daily evidence",
        createdBy: manager,
      },
    });
    const input = await db.payrollInput.create({
      data: {
        periodId: period.id,
        employeeId: employee,
        minutes: 60,
        emissionsComplete: true,
        reason: "Fixture",
        createdBy: manager,
      },
    });
    expect((await dashboard(owner, now)).pay.baseCents).toBeNull();
    await db.payrollInput.update({
      where: { id: input.id },
      data: { approvedBy: owner, approvedAt: now },
    });
    expect((await dashboard(owner, now)).pay).toMatchObject({
      baseCents: 1200,
      commissionCents: 1750,
      grossCents: 2950,
    });
    await db.payrollDraft.create({
      data: {
        periodId: period.id,
        revision: 1,
        status: "APPROVED",
        preparedBy: manager,
        reviewedBy: owner,
        totalCents: 2200,
        lines: {
          create: {
            employeeId: employee,
            employeeName: "Frozen fixture",
            baseCents: 1000,
            commissionCents: 1200,
            totalCents: 2200,
            snapshot: {},
          },
        },
      },
    });
    expect((await dashboard(owner, now)).pay).toMatchObject({
      baseCents: 1000,
      commissionCents: 1200,
      grossCents: 2200,
    });
    await db.payrollPeriod.update({ where: { id: period.id }, data: { startDate: yesterday } });
    expect((await dashboard(owner, now)).pay.baseCents).toBeNull();
  });
  it("separates billing, receipts, reversals, manual evidence and estimates; hides paid, void, draft and not-yet-overdue balances", async () => {
    const overdue = await invoice("Overdue");
    const paid = await invoice("Paid");
    const dueToday = await invoice("Due today", today, today);
    await invoice("Draft", yesterday, yesterday, false);
    const voided = await invoice("Voided");
    await db.dealerInvoice.update({
      where: { id: voided.id },
      data: { voidDate: today, voidReason: "Fixture", state: "VOIDED" },
    });
    await db.dealerPayment.create({
      data: {
        invoiceId: paid.id,
        amountCents: 10000,
        date: today,
        reference: randomUUID(),
        evidence: "Fixture",
        createdBy: manager,
      },
    });
    const charge = await rental();
    const payment = await db.rentalPayment.create({
      data: {
        chargeId: charge.id,
        amountCents: 10000,
        date: today,
        reference: randomUUID(),
        reason: "Fixture",
        createdBy: manager,
      },
    });
    let data = await dashboard(manager, now);
    expect(data.revenue).toMatchObject({ received: 20000, billed: 10000, retailEstimate: null });
    expect(data.attention.map((i) => i.id)).toEqual([`invoice:${overdue.id}`]);
    await db.rentalPayment.create({
      data: {
        chargeId: charge.id,
        amountCents: -10000,
        date: today,
        reference: randomUUID(),
        reason: "Fixture reversal",
        createdBy: manager,
        reversesId: payment.id,
      },
    });
    await db.financeEntry.createMany({
      data: [
        {
          direction: "REVENUE",
          basis: "MANUAL",
          amountCents: 123,
          date: today,
          category: "OTHER",
          reference: randomUUID(),
          description: "Fixture",
          evidence: "Fixture",
          createdBy: manager,
          verifiedBy: owner,
          verifiedAt: now,
        },
        {
          direction: "REVENUE",
          basis: "ESTIMATE",
          amountCents: 456,
          date: today,
          category: "OTHER",
          reference: randomUUID(),
          description: "Fixture",
          evidence: "Fixture",
          createdBy: manager,
        },
      ],
    });
    data = await dashboard(manager, now);
    expect(data.revenue).toMatchObject({
      received: 10000,
      billed: dueToday.totalCents,
      verifiedManual: 123,
      otherEstimates: 456,
    });
    expect(data.attention.map((i) => i.id)).toContain(`rental:${charge.id}`);
    await db.dealerInvoice.update({
      where: { id: overdue.id },
      data: { voidDate: today, voidReason: "Fixture", state: "VOIDED" },
    });
    await db.rentalCharge.update({
      where: { id: charge.id },
      data: { voidedAt: now, voidReason: "Fixture" },
    });
    expect((await dashboard(owner, now)).attention).toHaveLength(0);
  });
  it("orders actionable stock and certification issues by urgency and removes resolved records without hiding other pages", async () => {
    await db.certificateSetting.create({
      data: { minimumOrder: 300, reorderPoint: 10, windowDays: 7, leadDays: 1 },
    });
    await db.certificateStock.create({
      data: { balance: 0, openingDate: yesterday, reconciledDate: today },
    });
    const chemical = await db.chemicalItem.create({
      data: { name: "Fixture chemical", unit: "ML", reorderPoint: 5, balance: 2 },
    });
    await db.chemicalItem.create({ data: { name: "Unknown stock", unit: "ML", reorderPoint: 5 } });
    await db.employee.update({
      where: { id: employee },
      data: { certificationExpires: yesterday },
    });
    const soonUser = await db.user.create({
      data: { name: "Soon", email: `${randomUUID()}@example.test`, role: "EMPLOYEE" },
    });
    const soon = await db.employee.create({
      data: { userId: soonUser.id, certificationExpires: addDays(today, 25) },
    });
    let data = await dashboard(owner, now);
    expect(data.attention.map((i) => i.id)).toEqual([
      `certification:${employee}`,
      "stock:certificates",
      `stock:${chemical.id}`,
      `certification:${soon.id}`,
    ]);
    await db.certificateStock.updateMany({ data: { balance: 50 } });
    await db.chemicalItem.update({ where: { id: chemical.id }, data: { balance: 20 } });
    await db.employee.update({
      where: { id: employee },
      data: { certificationExpires: addDays(today, 60) },
    });
    await db.user.update({ where: { id: soonUser.id }, data: { active: false } });
    expect((await dashboard(owner, now)).attention).toHaveLength(0);
    for (let n = 0; n < 16; n++) await invoice(`Paged fixture ${n}`);
    data = await dashboard(owner, now);
    expect(data.attention).toHaveLength(16); // Page limits belong to rendering, not totals.
  });
});
