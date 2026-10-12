import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const actorMock = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/access", () => ({ currentUser: actorMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { addDays, businessDate } from "../src/lib/time";
import { reportFixture, fixtureStation } from "./station-fixtures";
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Requires disposable _test database.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.GA_STATION_ID = fixtureStation;
}
(enabled ? describe : describe.skip)("Station history isolated PostgreSQL", () => {
  let db: PrismaClient;
  let s: typeof import("../src/modules/station/service");
  let p: typeof import("../src/modules/station/performance");
  let payroll: typeof import("../src/modules/payroll/service");
  let owner: string, manager: string, book: string, employee: string, empId: string;
  const date = addDays(businessDate(), -10);
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    s = await import("../src/modules/station/service");
    p = await import("../src/modules/station/performance");
    payroll = await import("../src/modules/payroll/service");
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "StationReconciliation","StationRevision","StationRecord","StationImport","StationSetting","StationMapping","StationRule","PayrollPeriod","DailyEmission","FinanceEntry","BayRentalAgreement","SummarySchedule","ReminderPolicy","ForecastPolicy","AutomationJob","ActionReminder","User","CarwashBay","ChemicalItem","Dealership","CertificateSetting","CertificateStock","CertificateMovement","BusinessSetting","Closure" CASCADE',
    );
    const user = async (role: "OWNER" | "ADMIN" | "BOOKKEEPER" | "EMPLOYEE") =>
      (
        await db.user.create({
          data: { name: `Fixture ${role}`, email: `${randomUUID()}@example.test`, role },
        })
      ).id;
    owner = await user("OWNER");
    manager = await user("ADMIN");
    book = await user("BOOKKEEPER");
    employee = await user("EMPLOYEE");
    empId = (await db.employee.create({ data: { userId: employee } })).id;
  });
  it("persists owner pace settings with audit revisions, rejects other roles and stale concurrent writes", async () => {
    const pace = await import("../src/modules/station/dashboard-service");
    const query = { start: date, end: date, trendDays: 7 as const };
    const initial = await pace.readDashboard(owner, query);
    expect(initial.paceSettings).toEqual({ revision: 0, longGapMinutes: null });
    for (const actor of [manager, book, employee]) {
      await expect(
        pace.saveDashboardPaceSettings(actor, { revision: 0, longGapMinutes: 30 }, query),
      ).rejects.toThrow("permission");
    }
    const writes = await Promise.allSettled([
      pace.saveDashboardPaceSettings(owner, { revision: 0, longGapMinutes: 30 }, query),
      pace.saveDashboardPaceSettings(owner, { revision: 0, longGapMinutes: 45 }, query),
    ]);
    expect(writes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(writes.filter((result) => result.status === "rejected")).toHaveLength(1);
    const saved = await pace.readDashboard(owner, query);
    expect(saved.paceSettings.revision).toBe(1);
    expect([30, 45]).toContain(saved.paceSettings.longGapMinutes);
    expect(saved.payPlan).toEqual(initial.payPlan);
    const cleared = await pace.saveDashboardPaceSettings(
      owner,
      { revision: 1, longGapMinutes: null },
      query,
    );
    expect(cleared.paceSettings).toEqual({ revision: 2, longGapMinutes: null });
    expect(
      await db.auditLog.count({ where: { action: "STATION_PERFORMANCE_PACE_SETTINGS" } }),
    ).toBe(2);
    await db.user.update({ where: { id: owner }, data: { active: false } });
    await expect(
      pace.saveDashboardPaceSettings(owner, { revision: 2, longGapMinutes: 20 }, query),
    ).rejects.toThrow("permission");
  });
  async function setup() {
    await s.saveSettings(owner, {
      revision: 0,
      effectiveDate: date,
      weekStart: 1,
      hours: [],
      observationDays: 7,
      minimumDays: 2,
      sourceTimezoneConfirmed: true,
      reason: "Fixture confirmation",
    });
    await s.saveMapping(owner, {
      inspector: "Fixture Inspector",
      employeeId: empId,
      effectiveDate: date,
      reason: "Exact label confirmed",
    });
    await s.saveRule(owner, {
      outcome: "Pass",
      effectiveDate: date,
      eligible: true,
      priceCents: 2501,
      reason: "Fixture price, not actual business rule",
    });
  }
  async function imported(body = reportFixture(date)) {
    return s.importReport(owner, { body, reason: "Synthetic fixture" });
  }
  async function records() {
    return (await p.performance(owner, { start: date, end: date })).records;
  }
  async function review(key: string, override = {}) {
    const r = (await records()).find((r) => r.id === key)!;
    return s.reviewRecord(owner, {
      recordId: r.id,
      version: r.version,
      disposition: "RETAIL",
      eligibility: "RULE",
      reattribute: false,
      dealerServiceId: "",
      financeEntryId: "",
      reason: "Owner confirmed distinct identity and retail exception evidence",
      ...override,
    });
  }
  async function confirmed() {
    await setup();
    const run = await imported();
    const row = (await records())[0];
    await review(row.id);
    await s.attestCoverage(owner, {
      importId: run.id,
      expectedRows: 1,
      reason: "Compared all source pages",
    });
    return run;
  }
  it("imports repeat/concurrent/overlapping fragments idempotently with no live completeness claim", async () => {
    const results = await Promise.all([imported(), imported()]);
    expect(results.reduce((n, r) => n + r.inserted, 0)).toBe(1);
    expect(results.reduce((n, r) => n + r.duplicates, 0)).toBe(1);
    expect(results.every((r) => r.coverage === "PARTIAL")).toBe(true);
    const row = (await records())[0];
    expect(row.employeeId).toBeNull();
    expect(row.state).toBe("PENDING");
    expect(
      (await imported(reportFixture(date, undefined, fixtureStation, addDays(date, 1)))).duplicates,
    ).toBe(1);
    const overview = await p.performance(owner, { start: date, end: date });
    expect(overview.stationRecorded).toBe(0);
    expect(overview.stationPending).toBe(1);
    expect(overview.breakdown).toEqual([{ outcome: "Pass", confirmed: 0, pending: 1 }]);
    expect(overview.trends.testsPerHour).toBeNull();
    expect(overview.comparison.ready).toBe(false);
    expect(overview.groups[0].label).toContain("Unmapped");
    expect(overview.days[0].attested).toBe(false);
  });
  it("accepts an actual File/FormData through the protected server action", async () => {
    actorMock.mockResolvedValue({ id: owner });
    const actions = await import("../src/app/station-actions");
    const form = new FormData();
    form.set(
      "report",
      new File([reportFixture(date)], "synthetic.xls", { type: "application/ms-excel" }),
    );
    form.set("reason", "Owned synthetic browser input");
    expect(await actions.importStationAction({}, form)).toMatchObject({
      ok: true,
      message: expect.stringContaining("Imported 1"),
    });
    expect(await records()).toHaveLength(1);
  });
  it("compares reviewed station-wide history with equal prior dates and preserves employee filtering", async () => {
    const prior = addDays(date, -1);
    await s.saveSettings(owner, {
      revision: 0,
      effectiveDate: prior,
      weekStart: 1,
      hours: Array.from({ length: 7 }, (_, i) => ({
        weekday: i + 1,
        open: "08:00",
        close: "16:00",
      })),
      observationDays: 7,
      minimumDays: 2,
      sourceTimezoneConfirmed: true,
      reason: "Synthetic schedule",
    });
    await s.saveMapping(owner, {
      inspector: "Fixture Inspector",
      employeeId: empId,
      effectiveDate: prior,
      reason: "Synthetic attribution",
    });
    await s.saveRule(owner, {
      outcome: "Pass",
      effectiveDate: prior,
      eligible: true,
      priceCents: 2501,
      reason: "Synthetic policy",
    });
    for (const [day, certificate] of [
      [prior, "SYN00001"],
      [date, "SYN00002"],
    ]) {
      const run = await imported(
        reportFixture(day, [
          {
            vin: `1SYNTHETIC${certificate.slice(-7)}`,
            inspector: "Fixture Inspector",
            certificate,
            result: "Pass",
            time: "12:00 AM",
          },
        ]),
      );
      const row = (await p.performance(owner, { start: day, end: day })).records[0];
      await s.reviewRecord(owner, {
        recordId: row.id,
        version: row.version,
        disposition: "RETAIL",
        eligibility: "RULE",
        reattribute: false,
        dealerServiceId: "",
        financeEntryId: "",
        reason: "Synthetic identity review",
      });
      await s.attestCoverage(owner, {
        importId: run.id,
        expectedRows: 1,
        reason: "Synthetic complete day",
      });
    }
    const result = await p.performance(owner, { start: date, end: date, employeeId: empId });
    expect(result.trends.days[0]).toMatchObject({ status: "Covered", confirmed: 1, minutes: 480 });
    expect(result.priorTrends).toMatchObject({
      start: prior,
      end: prior,
      confirmed: 1,
      complete: true,
    });
    expect(result.comparison).toMatchObject({
      ready: true,
      countChange: 0,
      rateChange: 0,
      percentRateChange: 0,
    });
    expect(result.trends.hours[0].confirmed).toBe(1);
    expect(result.employeePerformance).toHaveLength(1);
    expect(result.employeePerformance[0]).toMatchObject({
      employeeId: empId,
      commissionCents: null,
      status: "No payroll period",
    });
    const other = await db.employee.create({ data: { userId: manager } });
    const filtered = await p.performance(owner, { start: date, end: date, employeeId: other.id });
    expect(filtered.records).toHaveLength(0);
    expect(filtered.trends.confirmed).toBe(1);
    expect(filtered.breakdown[0].confirmed).toBe(1);
    expect(await db.dailyEmission.count()).toBe(0);
  });
  it("invalidates both dates when a correction leaves a previously attested day", async () => {
    await setup();
    const run = await imported();
    const original = (await records())[0];
    await review(original.id);
    await s.attestCoverage(owner, {
      importId: run.id,
      expectedRows: 1,
      reason: "Original full-day comparison",
    });
    expect((await p.performance(owner, { start: date, end: date })).days[0].attested).toBe(true);
    const next = addDays(date, 1);
    await imported(reportFixture(next));
    const incoming = (await p.performance(owner, { start: next, end: next })).records[0];
    const current = (await records())[0];
    await s.mergeCorrection(owner, {
      recordId: incoming.id,
      version: incoming.version,
      originalId: current.id,
      originalVersion: current.version,
      reason: "Corrected business date",
    });
    const old = await p.performance(owner, { start: date, end: date });
    expect(old.records).toHaveLength(0);
    expect(old.days[0].attested).toBe(false);
    expect(old.projection.status).toBe("Insufficient data");
    await expect(
      s.reconcileCount(owner, {
        employeeId: empId,
        date,
        expectedVersion: 0,
        reason: "Must not infer a completed zero from an old attestation",
      }),
    ).rejects.toThrow("attestation");
    const audit = await db.auditLog.findFirst({ where: { action: "STATION_CORRECTION_LINKED" } });
    expect(audit!.details).toMatchObject({ oldDate: date, newDate: next });
    await expect(
      s.attestCoverage(owner, {
        importId: run.id,
        expectedRows: 0,
        reason: "Old nonempty report must not become new zero-test evidence",
      }),
    ).rejects.toThrow("Zero-test report evidence");
    // Even a legacy/imported attestation newer than the correction cannot prove zero.
    await db.stationImport.update({
      where: { id: run.id },
      data: { reviewedAt: new Date(Date.now() + 60_000), coverage: "OWNER_ATTESTED" },
    });
    expect((await p.performance(owner, { start: date, end: date })).days[0].attested).toBe(false);
    await expect(
      s.reconcileCount(owner, {
        employeeId: empId,
        date,
        expectedVersion: 0,
        reason: "Reject renewed legacy zero-day attestation",
      }),
    ).rejects.toThrow("zero-report semantics");
    expect(await db.dailyEmission.count()).toBe(0);
    expect(await db.stationReconciliation.count()).toBe(0);
    // Legacy events without explicit dates also fail closed.
    await db.auditLog.update({
      where: { id: audit!.id },
      data: { details: { originalId: current.id } },
    });
    expect((await p.performance(owner, { start: date, end: date })).days[0].attested).toBe(false);
  });
  it("keeps empty days in a nonempty range unverified, while allowing evidenced employee zero counts", async () => {
    await setup();
    const next = addDays(date, 1);
    const run = await imported(reportFixture(date, undefined, fixtureStation, next));
    const original = (await records())[0];
    await review(original.id);
    await s.attestCoverage(owner, {
      importId: run.id,
      expectedRows: 1,
      reason: "Compared the nonempty report range",
    });
    const overview = await p.performance(owner, { start: date, end: next });
    expect(overview.days.map((d) => d.attested)).toEqual([true, false]);
    await expect(
      s.reconcileCount(owner, {
        employeeId: empId,
        date: next,
        expectedVersion: 0,
        reason: "No station-day zero evidence",
      }),
    ).rejects.toThrow("zero-report semantics");
    const peerUser = await db.user.create({
      data: { name: "Synthetic peer", email: `${randomUUID()}@example.test`, role: "EMPLOYEE" },
    });
    const peer = await db.employee.create({ data: { userId: peerUser.id } });
    const reconciliation = await s.reconcileCount(owner, {
      employeeId: peer.id,
      date,
      expectedVersion: 0,
      reason: "All evidenced tests belong to another mapped employee",
    });
    expect(reconciliation.countVersion).toBe(0);
    const count = await db.dailyEmission.findUnique({
      where: { id: reconciliation.dailyEmissionId },
    });
    expect(count?.count).toBe(0);
    expect(count?.approvedBy).toBeNull();
  });
  it("rejections retain only fixed diagnostics, never invalidate last successful import or fabricate zero coverage", async () => {
    await imported();
    await expect(imported(reportFixture(date, undefined, "OTHER"))).rejects.toThrow(/station/);
    const overview = await p.performance(owner, { start: date, end: date });
    expect(overview.imports[0].status).toBe("FAILED");
    expect(overview.lastSuccessfulImport?.status).toBe("IMPORTED");
    expect(overview.days[0].attested).toBe(false);
    expect(JSON.stringify(overview.imports)).not.toContain("<html>");
  });
  it("preserves historical mapping and requires explicit reattribution", async () => {
    await setup();
    await imported();
    const row = (await records())[0];
    const peer = (await db.employee.create({ data: { userId: manager } })).id;
    await s.saveMapping(owner, {
      inspector: "Fixture Inspector",
      employeeId: peer,
      effectiveDate: addDays(date, 1),
      reason: "Later mapping",
    });
    expect((await records())[0].employeeId).toBe(empId);
    await review(row.id, { reattribute: true });
    expect((await records())[0].employeeId).toBe(empId);
    await expect(
      s.saveMapping(book, {
        inspector: "Fixture Inspector",
        employeeId: peer,
        effectiveDate: date,
        reason: "Denied",
      }),
    ).rejects.toThrow(/permission/);
  });
  it("requires confirmed identities/all-page counts and treats corrections as explicit versioned review", async () => {
    const run = await confirmed();
    const old = (await records())[0];
    await imported(
      reportFixture(date, [
        {
          vin: "1SYNTHETIC0000001",
          inspector: "Fixture Inspector",
          certificate: "SYN00001",
          result: "Fail",
          time: "09:00 AM",
        },
      ]),
    );
    let overview = await p.performance(owner, { start: date, end: date });
    expect(overview.days[0].attested).toBe(false);
    const incoming = overview.records.find((r) => r.id !== old.id)!;
    await expect(
      s.attestCoverage(owner, { importId: run.id, expectedRows: 1, reason: "False coverage" }),
    ).rejects.toThrow();
    await s.mergeCorrection(owner, {
      recordId: incoming.id,
      version: incoming.version,
      originalId: old.id,
      originalVersion: old.version,
      reason: "External record identity checked",
    });
    const merged = (await records())[0];
    expect(merged.revisions).toHaveLength(2);
    expect(merged.state).toBe("PENDING");
    expect(merged.eligible).toBeNull();
    expect((await imported()).duplicates).toBe(1);
    expect(await records()).toHaveLength(1);
    await review(merged.id, { eligibility: "NO", disposition: "EXCLUDED", reattribute: true });
    await s.attestCoverage(owner, {
      importId: run.id,
      expectedRows: 1,
      reason: "Corrected result checked against all pages",
    });
    overview = await p.performance(owner, { start: date, end: date });
    expect(overview.stationRecorded).toBe(1);
    expect(overview.days[0].attested).toBe(true);
  });
  it("explicitly replaces unique personal counts, retains independent approval and detects source changes", async () => {
    await confirmed();
    await payroll.importEmissions(manager, [
      {
        employeeId: empId,
        date,
        count: 15,
        sourceRef: "manual-original",
        reason: "Old independent source",
      },
    ]);
    let c = (await db.dailyEmission.findFirst())!;
    await payroll.approveEmissions(owner, { id: c.id, version: c.version });
    c = (await db.dailyEmission.findFirst())!;
    await s.reconcileCount(owner, {
      employeeId: empId,
      date,
      expectedVersion: c.version,
      reason: "Replace manual total; not additive",
    });
    c = (await db.dailyEmission.findFirst())!;
    expect(c.count).toBe(1);
    expect(c.sourceRef).toBe("manual-original");
    expect(c.approvedAt).toBeNull();
    await expect(payroll.approveEmissions(owner, { id: c.id, version: c.version })).rejects.toThrow(
      /own/,
    );
    await payroll.approveEmissions(manager, { id: c.id, version: c.version });
    const row = (await records())[0];
    await review(row.id, { eligibility: "NO" });
    const overview = await p.performance(owner, { start: date, end: date });
    expect(overview.reconciliations[0].needsReview).toBe(true);
    expect((await db.dailyEmission.findFirst())!.count).toBe(1);
    expect((await db.dailyEmission.findFirst())!.approvedAt).not.toBeNull();
  });
  it("preserves frozen drafts/approved payroll and independent source rules", async () => {
    await confirmed();
    await payroll.saveArrangement(owner, {
      employeeId: empId,
      effectiveDate: date,
      kind: "HOURLY",
      amountCents: 1001,
      reason: "Fixture",
    });
    await payroll.savePolicy(owner, {
      employeeId: empId,
      effectiveDate: date,
      eligible: true,
      threshold: 0,
      rateCents: 101,
      attribution: "PERSONAL_APPROVED_DAILY",
      reason: "Fixture",
    });
    await s.reconcileCount(owner, {
      employeeId: empId,
      date,
      expectedVersion: 0,
      reason: "Review evidence",
    });
    const c = (await db.dailyEmission.findFirst())!;
    await payroll.approveEmissions(manager, { id: c.id, version: c.version });
    const period = await payroll.createPeriod(owner, {
      startDate: date,
      endDate: date,
      label: "Fixture actual period",
    });
    await payroll.savePayrollInput(owner, {
      periodId: period.id,
      employeeId: empId,
      minutes: 1,
      emissionsComplete: true,
      version: 0,
      reason: "Worked, not scheduled",
    });
    const input = (await db.payrollInput.findFirst())!;
    await payroll.approvePayrollInput(manager, { id: input.id, version: input.version });
    const draft = await payroll.generateDraft(owner, period.id);
    const before = JSON.stringify(
      await db.payrollDraft.findUnique({ where: { id: draft.id }, include: { lines: true } }),
    );
    await expect(
      s.reconcileCount(owner, {
        employeeId: empId,
        date,
        expectedVersion: 1,
        reason: "Forbidden frozen correction",
      }),
    ).rejects.toThrow(/frozen/);
    await payroll.reviewDraft(manager, {
      id: draft.id,
      decision: "APPROVED",
      reason: "Fixture independent approval",
    });
    const overview = await p.performance(owner, { start: date, end: date });
    expect(overview.pay.periods[0].snapshot?.baseCents).toBe(17);
    expect(overview.pay.periods[0].snapshot?.commissionCents).toBe(101);
    expect(overview.pay.periods[0].snapshot?.totalCents).toBe(118);
    expect(overview.employeePerformance.find((r) => r.employeeId === empId)).toMatchObject({
      commissionCents: 101,
      baseCents: 17,
      grossCents: 118,
      status: "Approved payroll snapshots",
    });
    await review((await records())[0].id, { eligibility: "NO" });
    expect((await db.payrollLine.findFirst())!.totalCents).toBe(118);
    expect(before).toContain('"totalCents":118');
  });
  it("shares daily base and progressive volume calculations with payroll drafts", async () => {
    await setup();
    await payroll.saveArrangement(owner, {
      employeeId: empId,
      effectiveDate: date,
      kind: "DAILY",
      amountCents: 10000,
      reason: "Daily base",
    });
    await payroll.savePolicy(owner, {
      employeeId: empId,
      effectiveDate: date,
      eligible: true,
      threshold: 1,
      rateCents: 101,
      volumeThreshold: 2,
      volumeIncreaseCents: 50,
      attribution: "PERSONAL_APPROVED_DAILY",
      reason: "Progressive volume",
    });
    await payroll.importEmissions(owner, [
      {
        employeeId: empId,
        date,
        count: 3,
        sourceRef: "volume-commission",
        reason: "Personal count",
      },
    ]);
    const count = await db.dailyEmission.findFirstOrThrow();
    await payroll.approveEmissions(manager, { id: count.id, version: count.version });
    const period = await payroll.createPeriod(owner, {
      startDate: date,
      endDate: date,
      label: "Daily pay",
    });
    const input = await payroll.savePayrollInput(owner, {
      periodId: period.id,
      employeeId: empId,
      minutes: 0,
      paidDays: 1,
      emissionsComplete: true,
      version: 0,
      reason: "Verified paid day",
    });
    await payroll.approvePayrollInput(manager, { id: input.id, version: input.version });
    const provisional = await p.performance(owner, { start: date, end: date });
    expect(provisional.pay.daily[0].commissionCents).toBe(252);
    expect(provisional.pay.periods[0]).toMatchObject({
      baseCents: 10000,
      commissionCents: 252,
      grossCents: 10252,
    });
    expect((await payroll.generateDraft(owner, period.id)).totalCents).toBe(10252);
  });
  it("never invents worked time or period totals from a daily/weekly screen", async () => {
    await setup();
    await payroll.saveArrangement(owner, {
      employeeId: empId,
      effectiveDate: date,
      kind: "HOURLY",
      amountCents: 1001,
      reason: "Fixture",
    });
    await payroll.savePolicy(owner, {
      employeeId: empId,
      effectiveDate: date,
      eligible: true,
      threshold: 1,
      rateCents: 101,
      attribution: "PERSONAL_APPROVED_DAILY",
      reason: "Fixture",
    });
    const period = await payroll.createPeriod(owner, {
      startDate: date,
      endDate: addDays(date, 1),
      label: "Two-day actual period",
    });
    await payroll.importEmissions(owner, [
      { employeeId: empId, date, count: 2, sourceRef: "d1", reason: "Fixture" },
      { employeeId: empId, date: addDays(date, 1), count: 2, sourceRef: "d2", reason: "Fixture" },
    ]);
    const overview = await p.performance(owner, { start: date, end: addDays(date, 1) });
    expect(overview.pay.periods[0].periodId).toBe(period.id);
    expect(overview.pay.periods[0].commissionCents).toBe(202); // daily threshold, not a weekly reset/inference
    expect(overview.pay.periods[0].baseCents).toBeNull();
    expect(overview.pay.periods[0].grossCents).toBeNull();
    expect(overview.pay.periods[0].status).toBe("Incomplete");
    expect(overview.employeePerformance.find((r) => r.employeeId === empId)).toMatchObject({
      commissionCents: null,
      baseCents: null,
      grossCents: null,
      unapprovedDays: 2,
      status: "Incomplete inputs",
    });
    const partial = await p.performance(owner, { start: date, end: date });
    expect(partial.employeePerformance.find((r) => r.employeeId === empId)).toMatchObject({
      baseCents: null,
      grossCents: null,
      partialPeriods: 1,
      status: "Partial period — pay not allocated",
    });
    expect(overview.projection.projected).toBeNull();
  });
  it("separates estimated charges from finance and rejects duplicate evidence allocation", async () => {
    await confirmed();
    let overview = await p.performance(owner, { start: date, end: date });
    expect(overview.estimatedRevenueCents).toBe(2501);
    expect(overview.finance.totals.billed).toBe(0);
    const dealer = await db.dealership.create({
      data: { code: "SYN", name: "Fixture", billingAddress: "Synthetic" },
    });
    const service = await db.dealerService.create({
      data: {
        dealershipId: dealer.id,
        date,
        description: "Fixture",
        quantity: 1,
        unitCents: 2000,
        reference: "dealer-fixture",
        evidence: "Synthetic",
        createdBy: owner,
      },
    });
    await review((await records())[0].id, { disposition: "DEALER", dealerServiceId: service.id });
    overview = await p.performance(owner, { start: date, end: date });
    expect(overview.estimatedRevenueCents).toBeNull();
    expect(overview.excluded).toBe(1);
    const run = await imported(
      reportFixture(date, [
        {
          vin: "1SYNTHETIC0000002",
          inspector: "Fixture Inspector",
          certificate: "SYN00002",
          result: "Pass",
          time: "10:00 AM",
        },
      ]),
    );
    expect(run.inserted).toBe(1);
    await expect(
      review((await records()).find((r) => r.source.vehicleSuffix === "0002")!.id, {
        disposition: "DEALER",
        dealerServiceId: service.id,
      }),
    ).rejects.toThrow(/already linked/);
    await db.dealerService.update({
      where: { id: service.id },
      data: { voidDate: date, voidReason: "Fixture void" },
    });
    await expect(
      review((await records())[0].id, { disposition: "DEALER", dealerServiceId: service.id }),
    ).rejects.toThrow(/unvoided/);
  });
  it("protects every read/write/export against role or active-status changes and exports all matching rows", async () => {
    await confirmed();
    for (const actor of [manager, book, employee]) {
      await expect(p.performance(actor, { start: date, end: date })).rejects.toThrow(/permission/);
      await expect(p.exportPerformance(actor, { start: date, end: date })).rejects.toThrow(
        /permission/,
      );
      await expect(s.recordDetail(actor, (await records())[0].id)).rejects.toThrow(/permission/);
      await expect(
        s.importReport(actor, { body: reportFixture(date), reason: "Denied" }),
      ).rejects.toThrow(/permission/);
    }
    const body = reportFixture(
      date,
      Array.from({ length: 125 }, (_, i) => ({
        vin: `1SYNTHETIC${String(i + 2).padStart(7, "0")}`,
        inspector: "=FORMULA",
        certificate: `SYN${i + 2}`,
        result: "Pass",
        time: "09:00 AM",
      })),
    );
    await imported(body);
    const csv = await p.exportPerformance(owner, { start: date, end: date });
    expect(csv.split("\r\n")).toHaveLength(127);
    expect(csv).toContain("'=FORMULA");
    expect(csv).not.toContain("1SYNTHETIC0000001");
    await db.user.update({ where: { id: owner }, data: { active: false } });
    await expect(p.exportPerformance(owner, { start: date, end: date })).rejects.toThrow(
      /permission/,
    );
  });
});
