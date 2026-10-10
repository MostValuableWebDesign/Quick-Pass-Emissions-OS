import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, businessDate, dueInstant } from "../src/lib/time";
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Test database must end in _test.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
(enabled ? describe : describe.skip)("Phase 5 isolated PostgreSQL", () => {
  let db: PrismaClient;
  let s: typeof import("../src/modules/automation/service");
  let jobs: typeof import("../src/modules/automation/jobs");
  let reports: typeof import("../src/modules/automation/reports");
  let chemicals: typeof import("../src/modules/chemicals/service");
  let cert: typeof import("../src/modules/certificates/service");
  let finance: typeof import("../src/modules/finance/service");
  let owner: string,
    manager: string,
    book: string,
    employee: string,
    peer: string,
    empId: string,
    peerId: string;
  const now = new Date(),
    today = businessDate(now),
    past = addDays(today, -10);
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    s = await import("../src/modules/automation/service");
    jobs = await import("../src/modules/automation/jobs");
    reports = await import("../src/modules/automation/reports");
    chemicals = await import("../src/modules/chemicals/service");
    cert = await import("../src/modules/certificates/service");
    finance = await import("../src/modules/finance/service");
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "SummarySchedule","ReminderPolicy","ForecastPolicy","AutomationJob","ActionReminder","User","CarwashBay","ChemicalItem","Dealership","CertificateSetting","CertificateStock","CertificateMovement","BusinessSetting","Closure" CASCADE',
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
    peer = await user("EMPLOYEE");
    empId = (await db.employee.create({ data: { userId: employee, certificationExpires: past } }))
      .id;
    peerId = (await db.employee.create({ data: { userId: peer, certificationExpires: past } })).id;
  });
  async function schedule() {
    return s.saveSchedule(owner, {
      key: "daily",
      frequency: "DAILY",
      weekday: 1,
      time: "00:00",
      openDaysOnly: false,
      active: true,
      revision: 0,
    });
  }
  async function policy(
    kind = "MAINTENANCE",
    recipients = [manager, employee],
    advanceDays = 2,
    escalationDays = 3,
  ) {
    return s.saveReminderPolicy(owner, {
      kind,
      advanceDays,
      escalationDays,
      recipients,
      escalationRecipients: [owner],
      active: true,
      revision: 0,
    });
  }
  async function ticket() {
    const bay = await db.carwashBay.create({
      data: { identifier: randomUUID(), type: "SELF_SERVICE", slot: 1 },
    });
    return db.maintenanceTicket.create({
      data: {
        bayId: bay.id,
        title: "Fixture inspection",
        description: "Fixture",
        priority: "NORMAL",
        assignedId: empId,
        targetDate: past,
        dueAt: dueInstant(past, "17:00"),
        reportedBy: manager,
      },
    });
  }
  it("rejects all protected consolidated reads/config for nonowners and deactivated owners", async () => {
    for (const id of [manager, book, employee]) {
      await expect(s.ownerOverview(id)).rejects.toThrow("permission");
      await expect(s.summaryArchive(id)).rejects.toThrow("permission");
      await expect(s.automationSettings(id)).rejects.toThrow("permission");
      await expect(
        s.saveSchedule(id, {
          key: "daily",
          frequency: "DAILY",
          weekday: 1,
          time: "09:00",
          active: true,
          openDaysOnly: false,
          revision: 0,
        }),
      ).rejects.toThrow("permission");
    }
    await db.user.update({ where: { id: owner }, data: { active: false } });
    await expect(s.ownerOverview(owner)).rejects.toThrow("permission");
  });
  it("produces one immutable summary and owner-only delivery under simultaneous repeated triggers", async () => {
    const scheduleRow = await schedule();
    await Promise.all([jobs.runAutomation(now), jobs.runAutomation(now), jobs.runAutomation(now)]);
    expect(await db.savedSummary.count()).toBe(1);
    expect(await db.automationDelivery.count({ where: { summaryId: { not: null } } })).toBe(1);
    const summary = await db.savedSummary.findFirstOrThrow();
    expect(summary.scheduleId).toBe(scheduleRow.id);
    expect(JSON.stringify(summary.payload)).toContain("Historical snapshot");
    const before = JSON.stringify(summary.payload);
    await ticket();
    await jobs.runAutomation(now);
    expect(JSON.stringify((await s.summaryDetail(owner, summary.id)).payload)).toBe(before);
    expect((await s.ownerOverview(owner)).items.length).toBeGreaterThan(0);
    await expect(s.summaryDetail(employee, summary.id)).rejects.toThrow("permission");
    await db.user.update({ where: { id: owner }, data: { role: "BOOKKEEPER" } });
    await expect(s.summaryDetail(owner, summary.id)).rejects.toThrow("permission");
    await jobs.enqueueAutomation(now);
    expect(
      (await db.automationDelivery.findFirstOrThrow({ where: { summaryId: summary.id } })).status,
    ).toBe("REVOKED");
  });
  it("persists bounded missed-date cursor, skips configured closures and restarts without repeats", async () => {
    const row = await schedule();
    await db.summarySchedule.update({
      where: { id: row.id },
      data: { nextDate: addDays(today, -40), openDaysOnly: true },
    });
    await db.businessSetting.create({
      data: { operatingDays: [1, 2, 3, 4, 5, 6, 7], configured: true },
    });
    await db.closure.create({ data: { date: addDays(today, -35), reason: "Fixture closure" } });
    await jobs.enqueueAutomation(now);
    expect((await db.summarySchedule.findUniqueOrThrow({ where: { id: row.id } })).nextDate).toBe(
      addDays(today, -9),
    );
    expect(await db.automationJob.count({ where: { kind: "SUMMARY" } })).toBe(30);
    await jobs.runAutomation(now);
    await jobs.runAutomation(now);
    expect(await db.savedSummary.count()).toBe(40);
    const fresh = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
    expect(await fresh.savedSummary.count()).toBe(40);
    await fresh.$disconnect();
    await jobs.runAutomation(now);
    expect(await db.savedSummary.count()).toBe(40);
  });
  it("recovers interrupted claims and ignores stale workers after lease replacement", async () => {
    await schedule();
    await jobs.enqueueAutomation(now);
    const claimed = await jobs.claimAutomation(now);
    expect(claimed).not.toBeNull();
    const later = new Date(now.getTime() + 301000);
    const recovered = await jobs.claimAutomation(later);
    expect(recovered!.id).toBe(claimed!.id);
    expect(recovered!.attempts).toBe(2);
    await jobs.processAutomation(claimed!, later);
    expect(await db.savedSummary.count()).toBe(0);
    await jobs.processAutomation(recovered!, later);
    expect(await db.savedSummary.count()).toBe(1);
  });
  it("rolls back partial creation, applies bounded backoff, exposes terminal failure and audited retry", async () => {
    const row = await schedule();
    await db.summarySchedule.update({
      where: { id: row.id },
      data: { createdBy: "missing-fixture-user" },
    });
    await jobs.enqueueAutomation(now);
    let clock = now;
    for (let attempt = 1; attempt <= 4; attempt++) {
      const j = await jobs.claimAutomation(clock);
      expect(j?.kind).toBe("SUMMARY");
      expect(await jobs.processAutomation(j!, clock)).toBe(false);
      expect(await db.savedSummary.count()).toBe(0);
      const state = await db.automationJob.findUniqueOrThrow({ where: { id: j!.id } });
      expect(state.status).toBe(attempt === 4 ? "FAILED" : "PENDING");
      // Isolate summary retry from the independent reminder occurrence.
      await db.automationJob.updateMany({
        where: { kind: "REMINDERS" },
        data: { status: "SUCCESS" },
      });
      clock = new Date(clock.getTime() + 60000 * 2 ** (attempt - 1) + 1);
    }
    const failed = await db.automationJob.findFirstOrThrow({ where: { status: "FAILED" } });
    await db.summarySchedule.update({ where: { id: row.id }, data: { createdBy: owner } });
    await s.retryAutomationJob(owner, { id: failed.id });
    await jobs.runAutomation(clock);
    expect(await db.savedSummary.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: "AUTOMATION_RETRY_AUTHORIZED" } })).toBe(1);
  });
  it("supersedes pending/claimed old schedule revisions without editing saved history", async () => {
    const row = await schedule();
    await jobs.enqueueAutomation(now);
    const oldClaim = await jobs.claimAutomation(now);
    const next = await s.saveSchedule(owner, {
      key: "daily",
      frequency: "DAILY",
      weekday: 1,
      time: "00:00",
      active: true,
      openDaysOnly: false,
      revision: 1,
    });
    expect(next.revision).toBe(2);
    await jobs.processAutomation(oldClaim!, now);
    expect(await db.savedSummary.count()).toBe(0);
    await jobs.runAutomation(now);
    expect(await db.savedSummary.count()).toBe(1);
    expect((await db.automationJob.findUniqueOrThrow({ where: { id: oldClaim!.id } })).status).toBe(
      "SUPERSEDED",
    );
    expect((await db.summarySchedule.findUniqueOrThrow({ where: { id: row.id } })).active).toBe(
      false,
    );
    await expect(
      s.saveSchedule(owner, {
        key: "daily",
        frequency: "DAILY",
        weekday: 1,
        time: "00:00",
        active: true,
        openDaysOnly: false,
        revision: 1,
      }),
    ).rejects.toThrow("changed");
  });
  it("acknowledges separately, suppresses duplicates and immediately hides stale assignment/completion alerts", async () => {
    const t = await ticket();
    await policy();
    await jobs.runAutomation(now);
    const own = await s.remindersForUser(employee);
    expect(own).toHaveLength(1);
    expect(await s.remindersForUser(peer)).toHaveLength(0);
    await s.acknowledgeReminder(employee, { id: own[0].id });
    expect((await db.maintenanceTicket.findUniqueOrThrow({ where: { id: t.id } })).status).toBe(
      "OPEN",
    );
    expect((await s.remindersForUser(employee))[0].acknowledgedAt).not.toBeNull();
    await jobs.runAutomation(now);
    expect(await db.actionReminder.count({ where: { kind: "MAINTENANCE" } })).toBe(3);
    await expect(s.acknowledgeReminder(peer, { id: own[0].id })).rejects.toThrow("not yours");
    await db.maintenanceTicket.update({ where: { id: t.id }, data: { assignedId: peerId } });
    expect(await s.remindersForUser(employee)).toHaveLength(0);
    await jobs.runAutomation(new Date(now.getTime() + 900000));
    expect(await s.remindersForUser(peer)).toHaveLength(0); // Not configured recipient.
    expect(
      (await db.actionReminder.findUniqueOrThrow({ where: { id: own[0].id } })).resolution,
    ).toBe("SUPERSEDED");
    await db.maintenanceTicket.update({
      where: { id: t.id },
      data: { status: "COMPLETED", completedAt: now },
    });
    expect(await s.remindersForUser(manager)).toHaveLength(0);
    await jobs.runAutomation(new Date(now.getTime() + 1800000));
    expect(await db.actionReminder.count({ where: { resolvedAt: null } })).toBe(0);
  });
  it("supersedes stage/due-date and policy changes, rechecks current active recipients", async () => {
    const t = await ticket();
    await db.maintenanceTicket.update({
      where: { id: t.id },
      data: { targetDate: today, dueAt: new Date(now.getTime() + 3600000) },
    });
    const p = await policy();
    await jobs.runAutomation(now);
    expect((await s.remindersForUser(employee))[0].stage).toBe("ADVANCE");
    await db.maintenanceTicket.update({
      where: { id: t.id },
      data: { targetDate: past, dueAt: dueInstant(past, "17:00") },
    });
    expect(await s.remindersForUser(employee)).toHaveLength(0);
    await jobs.runAutomation(new Date(now.getTime() + 900000));
    expect((await s.remindersForUser(employee))[0].stage).toBe("ESCALATED");
    await db.user.update({ where: { id: employee }, data: { active: false } });
    await expect(s.remindersForUser(employee)).rejects.toThrow("permission");
    await s.saveReminderPolicy(owner, {
      kind: p.kind,
      advanceDays: 2,
      escalationDays: 3,
      recipients: [manager],
      escalationRecipients: [owner],
      active: false,
      revision: 1,
    });
    expect(await s.remindersForUser(manager)).toHaveLength(0);
  });
  it("delivers certification only to configured own employee or manager, never bookkeeper or peers", async () => {
    await policy("CERTIFICATION", [employee, manager]);
    await jobs.runAutomation(now);
    const own = await s.remindersForUser(employee);
    expect(own).toHaveLength(1);
    expect(own[0].sourceId).toBe(empId);
    expect(own[0].href).toBe("/reminders/certification");
    expect(await s.remindersForUser(peer)).toHaveLength(0);
    await expect(
      s.saveReminderPolicy(owner, {
        kind: "CERTIFICATION",
        advanceDays: 2,
        escalationDays: 3,
        recipients: [book],
        escalationRecipients: [owner],
        active: true,
        revision: 1,
      }),
    ).rejects.toThrow("permission");
    await db.employee.update({
      where: { id: empId },
      data: { certificationExpires: addDays(today, 30) },
    });
    expect(await s.remindersForUser(employee)).toHaveLength(0);
    await jobs.runAutomation(new Date(now.getTime() + 900000));
    expect(await db.actionReminder.count({ where: { userId: employee, resolvedAt: null } })).toBe(
      0,
    );
  });
  async function invoice() {
    const dealer = await finance.saveDealer(book, {
      id: "",
      version: 0,
      code: randomUUID(),
      name: "Fixture Dealer",
      billingAddress: "Fixture",
      notes: "",
      active: true,
      reason: "Fixture evidence",
    });
    await finance.authorizeTerms(owner, {
      id: dealer.id,
      version: 0,
      termsDays: 0,
      defaultRateCents: 1000,
      taxBps: 0,
      termsReference: "Fixture evidence",
      reason: "Fixture evidence",
    });
    const service = await finance.recordService(book, {
      dealershipId: dealer.id,
      date: past,
      description: "Fixture service",
      quantity: 1,
      unitCents: 1000,
      reference: randomUUID(),
      evidence: "Fixture evidence",
    });
    const inv = await finance.createInvoice(book, {
      dealershipId: dealer.id,
      number: randomUUID(),
      issueDate: past,
      serviceIds: [service.id],
      notes: "",
    });
    await finance.reviewInvoice(manager, {
      id: inv.id,
      version: 0,
      decision: "APPROVE",
      date: today,
      reference: "Fixture evidence",
      reason: "Fixture evidence",
    });
    return inv;
  }
  it("reconciles approved invoice partial/full receipts, reversals and voids without touching payment state", async () => {
    const i = await invoice();
    await policy("DEALER", [book]);
    await jobs.runAutomation(now);
    expect(await s.remindersForUser(employee)).toHaveLength(0);
    const first = (await s.remindersForUser(book))[0];
    expect(first).toBeTruthy();
    await s.acknowledgeReminder(book, { id: first.id });
    expect(await db.dealerPayment.count()).toBe(0);
    const pay = await finance.recordDealerPayment(book, {
      invoiceId: i.id,
      date: today,
      amountCents: 1000,
      reference: randomUUID(),
      evidence: "Fixture receipt",
    });
    expect(await s.remindersForUser(book)).toHaveLength(0);
    await jobs.runAutomation(new Date(now.getTime() + 900000));
    await finance.reverseDealerPayment(manager, {
      id: pay.id,
      date: today,
      reference: randomUUID(),
      evidence: "Fixture reversal",
    });
    await jobs.runAutomation(new Date(now.getTime() + 1800000));
    const reversed = (await s.remindersForUser(book))[0];
    expect(reversed.id).not.toBe(first.id);
    expect(reversed.acknowledgedAt).toBeNull();
    const current = await db.dealerInvoice.findUniqueOrThrow({ where: { id: i.id } });
    await finance.reviewInvoice(manager, {
      id: i.id,
      version: current.version,
      decision: "VOID",
      date: today,
      reference: "Fixture void",
      reason: "Fixture void",
    });
    expect(await s.remindersForUser(book)).toHaveLength(0);
  });
  it("uses genuine certificate consumption including voids, excludes corrections/receipts and keeps changed count baselines explicit", async () => {
    await cert.saveCertificateSettings(owner, {
      minimumOrder: 300,
      reorderPoint: 20,
      leadDays: 2,
      windowDays: 30,
      reason: "Fixture settings",
    });
    await cert.reconcileStock(owner, {
      observed: 100,
      version: 0,
      date: past,
      reference: randomUUID(),
      reason: "Fixture physical count",
    });
    await cert.recordUsage(owner, {
      kind: "USAGE",
      quantity: 10,
      date: past,
      reference: randomUUID(),
      reason: "Fixture",
    });
    await cert.recordUsage(owner, {
      kind: "VOID",
      quantity: 5,
      date: past,
      reference: randomUUID(),
      reason: "Fixture consumed void",
    });
    const stock = await db.certificateStock.findUniqueOrThrow({ where: { id: "certificates" } });
    await cert.reconcileStock(owner, {
      observed: 120,
      version: stock.version,
      date: today,
      reference: randomUUID(),
      reason: "Fixture corrected count",
    });
    await s.saveForecastPolicy(owner, {
      key: "certificates",
      windowDays: 30,
      minimumDays: 7,
      leadDays: 2,
      threshold: 20,
      revision: 0,
    });
    const f = (await s.ownerOverview(owner)).inventory.find((i) => i.key === "certificates")!;
    expect(f.recordedConsumption).toBe(15);
    expect(f.coverageDays).toBe(11);
    expect(f.balance).toBe(120);
    expect(f.state).toBe("ESTIMATE");
  });
  it("estimates each chemical's own units, excludes receipts/adjustments, includes documented disposal", async () => {
    for (const unit of ["ML", "GRAM"] as const) {
      const item = await chemicals.saveChemical(owner, {
        id: "",
        version: 0,
        name: `Fixture ${unit}`,
        unit,
        reorderPoint: 10,
        vendorId: "",
        notes: "",
        active: true,
        reason: "Fixture",
      });
      let version = 0;
      for (const [kind, quantity, date] of [
        ["RECONCILE", 100, past],
        ["USAGE", 10, past],
        ["DISPOSAL", 5, past],
        ["RECEIPT", 30, past],
        ["RECONCILE", 150, today],
      ] as const) {
        await chemicals.moveChemical(owner, {
          id: item.id,
          version: version++,
          kind,
          quantity,
          date,
          reference: randomUUID(),
          reason: "Fixture ledger",
        });
      }
      await s.saveForecastPolicy(owner, {
        key: item.id,
        windowDays: 30,
        minimumDays: 7,
        leadDays: 2,
        threshold: 10,
        revision: 0,
      });
    }
    const f = (await s.ownerOverview(owner)).inventory.filter((i) => i.key !== "certificates");
    expect(f.map((i) => i.unit).sort()).toEqual(["GRAM", "ML"]);
    expect(
      f.every((i) => i.recordedConsumption === 15 && i.balance === 150 && i.coverageDays === 11),
    ).toBe(true);
    const report = await reports.getOperationalReport(owner, {
      dataset: "chemicals",
      start: past,
      end: today,
    });
    expect(Object.values(report.totals).filter((v) => v === 15)).toHaveLength(2);
  });
  it("exports all >100 deterministic responsibility results and exact signed inventory values with no employee leakage", async () => {
    const template = await db.taskTemplate.create({
      data: {
        title: "Fixture",
        frequency: "DAILY",
        startDate: past,
        dueTime: "09:00",
        employeeId: empId,
      },
    });
    await db.taskInstance.createMany({
      data: Array.from({ length: 125 }, (_, i) => ({
        id: `fixture-${String(i).padStart(3, "0")}`,
        templateId: template.id,
        occurrenceDate: addDays(past, -i),
        title: i === 0 ? "=FORMULA" : "Fixture",
        description: "",
        dueAt: dueInstant(today, "09:00"),
        employeeId: empId,
        priority: "NORMAL",
        reviewRequired: true,
        escalationHours: 0,
      })),
    });
    const raw = { dataset: "responsibilities", start: today, end: today };
    expect((await reports.getOperationalReport(manager, raw)).rows).toHaveLength(125);
    const exported = await reports.exportOperational(owner, raw);
    expect(exported.trim().split("\r\n")).toHaveLength(126);
    expect(exported).toContain("'=FORMULA");
    await expect(reports.exportOperational(employee, raw)).rejects.toThrow("permission");
    await expect(reports.getOperationalReport(book, raw)).rejects.toThrow("permission");
    await db.user.update({ where: { id: owner }, data: { active: false } });
    await expect(reports.exportOperational(owner, raw)).rejects.toThrow("permission");
  });
  it("clips open downtime to Eastern period boundaries and generation time without cost/payment inference", async () => {
    const bay = await db.carwashBay.create({
      data: { identifier: "Fixture", type: "SELF_SERVICE", slot: 1 },
    });
    await db.downtimeEvent.create({
      data: {
        bayId: bay.id,
        startedAt: dueInstant(past, "00:00"),
        createdBy: owner,
        reason: "Fixture outage",
      },
    });
    const r = await reports.getOperationalReport(owner, {
      dataset: "downtime",
      start: today,
      end: today,
    });
    expect(r.rows[0].clippedStart).toBe(dueInstant(today, "00:00").toISOString());
    expect(Number(r.rows[0].recordedDurationMilliseconds)).toBeLessThanOrEqual(25 * 3600000);
    expect(r.totals).toEqual({ matched: 1 });
  });
  it("reconciles rental partial/full payment and reversal, and respects dated balance/void semantics", async () => {
    const rent = await import("../src/modules/rentals/service");
    const bay = await db.carwashBay.create({
      data: { identifier: "Fixture rental", type: "DETAILING", slot: 4 },
    });
    const month = addDays(today, -40).slice(0, 7);
    const agreement = await rent.createAgreement(owner, {
      bayId: bay.id,
      tenant: "Fixture tenant",
      contact: "Fixture contact",
      reference: randomUUID(),
      startDate: "2025-01-01",
      endDate: "",
      monthlyCents: 10000,
      dueDay: 1,
      responsibilities: "Fixture maintenance",
      reason: "Fixture terms",
    });
    const charge = await rent.createCharge(book, {
      agreementId: agreement.id,
      month,
      reason: "Fixture charge",
    });
    await policy("RENTAL", [book]);
    await jobs.runAutomation(now);
    const first = (await s.remindersForUser(book))[0];
    expect(first.sourceId).toBe(charge.id);
    await s.acknowledgeReminder(book, { id: first.id });
    const p = await rent.recordPayment(book, {
      chargeId: charge.id,
      amountCents: 3000,
      date: today,
      reference: randomUUID(),
      reason: "Fixture receipt",
    });
    expect(await s.remindersForUser(book)).toHaveLength(0);
    await jobs.runAutomation(new Date(now.getTime() + 900000));
    const partial = (await s.remindersForUser(book))[0];
    expect(partial.acknowledgedAt).toBeNull();
    const r = await reports.getOperationalReport(book, {
      dataset: "rental-charges",
      start: today,
      end: today,
    });
    expect(r.rows).toHaveLength(0);
    expect(r.totals.outstandingAsOfEndCents).toBe(7000);
    await rent.reversePayment(manager, {
      id: p.id,
      date: today,
      reference: randomUUID(),
      reason: "Fixture reversal",
    });
    expect(
      (
        await reports.getOperationalReport(book, {
          dataset: "rental-charges",
          start: `${month}-01`,
          end: today,
        })
      ).totals.outstandingAsOfEndCents,
    ).toBe(10000);
    await rent.voidCharge(manager, { id: charge.id, reason: "Fixture void" });
    expect(await s.remindersForUser(book)).toHaveLength(0);
    const before = await reports.getOperationalReport(book, {
      dataset: "rental-charges",
      start: `${month}-01`,
      end: addDays(today, -1),
    });
    expect(before.totals.outstandingAsOfEndCents).toBe(10000);
    expect(
      (
        await reports.getOperationalReport(book, {
          dataset: "rental-charges",
          start: `${month}-01`,
          end: today,
        })
      ).totals.outstandingAsOfEndCents,
    ).toBe(0);
  });
  it("revalidates role changes at delivery/read and cannot acknowledge an obsolete paid source", async () => {
    const i = await invoice();
    await policy("DEALER", [book]);
    await jobs.runAutomation(now);
    const alert = (await s.remindersForUser(book))[0];
    await db.user.update({ where: { id: book }, data: { role: "EMPLOYEE" } });
    expect(await s.remindersForUser(book)).toHaveLength(0);
    await expect(s.acknowledgeReminder(book, { id: alert.id })).rejects.toThrow("not yours");
    await jobs.runAutomation(new Date(now.getTime() + 900000));
    expect(
      (await db.automationDelivery.findFirstOrThrow({ where: { reminderId: alert.id } })).status,
    ).toBe("REVOKED");
    await db.user.update({ where: { id: book }, data: { role: "BOOKKEEPER" } });
    await finance.recordDealerPayment(book, {
      invoiceId: i.id,
      date: today,
      amountCents: 1000,
      reference: randomUUID(),
      evidence: "Fixture paid",
    });
    await expect(s.acknowledgeReminder(book, { id: alert.id })).rejects.toThrow("not yours");
  });
  it("serializes summary delivery with a concurrent personnel-role edit", async () => {
    await s.saveSchedule(owner, {
      key: "daily",
      frequency: "DAILY",
      weekday: 1,
      time: "00:00",
      active: true,
      openDaysOnly: false,
      revision: 0,
    });
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      ready = new Promise<void>((r) => (entered = r));
    const edit = db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
        await tx.user.update({ where: { id: owner }, data: { role: "EMPLOYEE" } });
        entered();
        await gate;
      },
      { timeout: 15000 },
    );
    await ready;
    const run = jobs.runAutomation(now);
    try {
      // Wait for the committed claim; processing must still wait behind the personnel editor.
      for (let i = 0; i < 50; i++) {
        if (await db.automationJob.count({ where: { kind: "SUMMARY", status: "RUNNING" } })) break;
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(await db.automationJob.count({ where: { kind: "SUMMARY", status: "RUNNING" } })).toBe(
        1,
      );
      expect(await db.savedSummary.count()).toBe(0);
    } finally {
      release();
    }
    await edit;
    await run;
    expect(await db.savedSummary.count()).toBe(1);
    expect(await db.automationDelivery.count({ where: { summaryId: { not: null } } })).toBe(0);
    await expect(s.summaryArchive(owner)).rejects.toThrow("permission");
  });
});
