import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { addDays, businessDate, dueInstant } from "../src/lib/time";
import { Temporal } from "@js-temporal/polyfill";
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Requires isolated _test database");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
(enabled ? describe : describe.skip)("Persistent manager workspace", () => {
  let db: PrismaClient,
    s: typeof import("../src/modules/manager/service"),
    r: typeof import("../src/modules/manager/registers"),
    t: typeof import("../src/modules/tasks/service");
  let owner: string, admin: string, staff: string, person: string;
  const date = businessDate(),
    future = addDays(date, 2),
    now = new Date();
  const values = (extra: Record<string, unknown> = {}) => ({
    title: "Manager project",
    description: "Synthetic test",
    employeeId: person,
    oversightId: owner,
    area: "WEBSITE",
    station: "Test property",
    date: future,
    time: "17:00",
    frequency: "ONCE",
    priority: "NORMAL",
    durationMinutes: 30,
    reviewRequired: true,
    checklist: [],
    ...extra,
  });
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    s = await import("../src/modules/manager/service");
    r = await import("../src/modules/manager/registers");
    t = await import("../src/modules/tasks/service");
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "TaskTemplate", "User", "ManagerAvailability", "ManagerCommitment", "ManagerSchedule", "SupplyItem", "ManagerFinancialEvidence", "ManagerBankPolicy", "ForecastPolicy", "CertificateStock", "CertificateSetting", "ChemicalItem", "MaintenanceTicket" CASCADE',
    );
    const account = async (role: "OWNER" | "ADMIN" | "EMPLOYEE") =>
      db.user.create({
        data: { name: role, email: `${randomUUID()}@example.test`, role, employee: { create: {} } },
        include: { employee: true },
      });
    const a = await account("OWNER"),
      b = await account("ADMIN"),
      c = await account("EMPLOYEE");
    owner = a.id;
    admin = b.id;
    staff = c.id;
    person = a.employee!.id;
  });
  const getTask = () => db.taskInstance.findFirstOrThrow({ orderBy: { id: "asc" } });
  const change = async (
    actor: string,
    taskId: string,
    status: "COMPLETED" | "IN_PROGRESS" | "PENDING",
    note = "Fixture update",
  ) => {
    const task = await db.taskInstance.findUniqueOrThrow({ where: { id: taskId } });
    return t.changeTask(
      { id: actor, name: "Forged stale role", role: "OWNER" },
      { taskId, version: task.version, status, note },
    );
  };
  const available = async () =>
    s.saveAvailability(owner, {
      version: 0,
      reservePercent: 20,
      days: [
        {
          weekday: Temporal.PlainDate.from(future).dayOfWeek,
          start: "09:00",
          end: "17:00",
          breaks: [{ start: "12:00", end: "13:00" }],
        },
      ],
    });
  const supply = () =>
    r.saveSupply(owner, {
      version: 0,
      name: "Paper towels",
      unit: "rolls",
      balance: 2,
      reorderLevel: 3,
      preferredVendor: "Walmart",
    });
  it("populates one persistent proposed week without creating a payroll-facing profile", async () => {
    const user = await db.user.create({
      data: {
        name: "Manager without profile",
        email: `${randomUUID()}@example.test`,
        role: "OWNER",
      },
    });
    const [first, repeated] = await Promise.all([
      s.ensureOperationsSchedule(user.id, now),
      s.ensureOperationsSchedule(user.id, now),
    ]);
    expect(first.id).toBe(repeated.id);
    expect(first.status).toBe("DRAFT");
    expect((first.payload as { blocks: unknown[] }).blocks).toHaveLength(23);
    expect(await db.managerSchedule.count({ where: { userId: user.id } })).toBe(1);
    expect(await db.employee.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.taskTemplate.count()).toBe(0);
    await expect(
      s.updateOperationsScheduleBlock(admin, {
        scheduleId: first.id,
        revision: 0,
        blockId: "opening-review",
        start: "08:00",
        end: "08:15",
      }),
    ).rejects.toThrow(/proposed weekly schedule/);
    await s.approveOperationsSchedule(user.id, { scheduleId: first.id, revision: 0 }, now);
    expect(await db.employee.count({ where: { userId: user.id } })).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe("OWNER");
    expect(
      await db.taskTemplate.count({
        where: { workspaceKey: { startsWith: `schedule-duty:${user.id}:` } },
      }),
    ).toBe(23);
    const duties = await db.taskInstance.findMany({ where: { oversightId: user.id } });
    expect(duties.length).toBeGreaterThan(23);
    expect(
      duties.every((duty) => Temporal.PlainDate.from(duty.occurrenceDate).dayOfWeek !== 7),
    ).toBe(true);
    expect(duties.every((duty) => Array.isArray(duty.checklist) && duty.checklist.length > 0)).toBe(
      true,
    );
  });
  it("saves time edits, rejects stale/overlapping edits, and preserves an approved snapshot on revision", async () => {
    const week = await s.ensureOperationsSchedule(owner, now);
    const input = {
      scheduleId: week.id,
      revision: 0,
      blockId: "opening-review",
      start: "08:00",
      end: "08:15",
    };
    await s.updateOperationsScheduleBlock(owner, input);
    await expect(s.updateOperationsScheduleBlock(owner, input)).rejects.toThrow(/changed/);
    await expect(
      s.updateOperationsScheduleBlock(owner, {
        ...input,
        revision: 1,
        end: "08:30",
      }),
    ).rejects.toThrow(/overlaps/);
    await s.approveOperationsSchedule(owner, { scheduleId: week.id, revision: 1 }, now);
    await expect(
      s.approveOperationsSchedule(
        owner,
        {
          scheduleId: week.id,
          revision: 1,
        },
        now,
      ),
    ).rejects.toThrow(/not found/);
    await s.reviseOperationsSchedule(owner, week.id);
    const revised = await s.ensureOperationsSchedule(owner, now);
    expect(revised.id).not.toBe(week.id);
    expect(revised.status).toBe("DRAFT");
    expect(
      (revised.payload as { blocks: { id: string; end: string }[] }).blocks.find(
        (block) => block.id === "opening-review",
      )?.end,
    ).toBe("08:15");
    expect((await db.managerSchedule.findUniqueOrThrow({ where: { id: week.id } })).status).toBe(
      "APPROVED",
    );
    await s.approveOperationsSchedule(owner, { scheduleId: revised.id, revision: 0 }, now);
    expect(
      await db.taskTemplate.count({
        where: { workspaceKey: { startsWith: `schedule-duty:${owner}:` } },
      }),
    ).toBe(23);
    const duplicates = await db.taskInstance.groupBy({
      by: ["templateId", "occurrenceDate"],
      _count: true,
    });
    expect(duplicates.every((item) => item._count === 1)).toBe(true);
  });
  it("blocks approval on a real fixed commitment before creating duties", async () => {
    const week = await s.ensureOperationsSchedule(owner, now);
    const mondayMorning = new Date(`${week.startDate}T12:00:00Z`);
    await db.managerCommitment.create({
      data: {
        userId: owner,
        title: "Confirmed service appointment",
        date: week.startDate,
        startTime: "08:05",
        endTime: "08:15",
      },
    });
    await expect(
      s.approveOperationsSchedule(
        owner,
        {
          scheduleId: week.id,
          revision: 0,
        },
        mondayMorning,
      ),
    ).rejects.toThrow(/overlaps/);
    expect(await db.taskTemplate.count()).toBe(0);
    expect((await db.managerSchedule.findUniqueOrThrow({ where: { id: week.id } })).status).toBe(
      "DRAFT",
    );
  });
  it("replaces only unmodified unused starter work and preserves activity and custom duties", async () => {
    await s.installStarter(owner, { date, time: "08:00", employeeId: person });
    const old = await db.taskInstance.findMany({
      where: { occurrenceDate: { gte: date } },
      take: 3,
      orderBy: { id: "asc" },
    });
    expect(old).toHaveLength(3);
    await db.taskInstance.update({ where: { id: old[0].id }, data: { status: "IN_PROGRESS" } });
    await db.taskInstance.update({ where: { id: old[1].id }, data: { status: "COMPLETED" } });
    const custom = await db.taskTemplate.findFirstOrThrow();
    await db.taskTemplate.update({ where: { id: custom.id }, data: { version: 1 } });
    const week = await s.ensureOperationsSchedule(owner, now);
    await s.approveOperationsSchedule(owner, { scheduleId: week.id, revision: 0 }, now);
    expect((await db.taskInstance.findUniqueOrThrow({ where: { id: old[0].id } })).status).toBe(
      "IN_PROGRESS",
    );
    expect((await db.taskInstance.findUniqueOrThrow({ where: { id: old[1].id } })).status).toBe(
      "COMPLETED",
    );
    expect((await db.taskTemplate.findUniqueOrThrow({ where: { id: custom.id } })).active).toBe(
      true,
    );
    expect(
      await db.taskInstance.count({
        where: {
          status: "CANCELLED",
          template: { workspaceKey: { startsWith: `starter:${owner}:` } },
        },
      }),
    ).toBeGreaterThan(0);
  });
  it("rejects staff and stale deactivated management for reads and writes", async () => {
    await expect(s.managerOverview(staff)).rejects.toThrow(/Management/);
    await db.user.update({ where: { id: admin }, data: { active: false } });
    await expect(s.createManagerTask(admin, values())).rejects.toThrow(/Management/);
  });
  it("explicitly creates a missing management profile once without configuring pay or changing access", async () => {
    const account = await db.user.create({
      data: {
        name: "Manager without profile",
        email: `${randomUUID()}@example.test`,
        role: "ADMIN",
      },
    });
    await Promise.all([
      s.createOwnResponsibilityProfile(account.id),
      s.createOwnResponsibilityProfile(account.id),
    ]);
    expect(await db.employee.count({ where: { userId: account.id } })).toBe(1);
    expect(await db.payArrangement.count({ where: { employee: { userId: account.id } } })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).role).toBe("ADMIN");
    await expect(s.createOwnResponsibilityProfile(staff)).rejects.toThrow(/denied/);
  });
  it("rechecks a queued actor after the personnel lock", async () => {
    let release!: () => void, locked!: () => void;
    const ready = new Promise<void>((resolve) => (locked = resolve)),
      gate = new Promise<void>((resolve) => (release = resolve));
    const hold = db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
      locked();
      await gate;
      await tx.user.update({ where: { id: admin }, data: { active: false } });
    });
    await ready;
    const pending = s.managerOverview(admin);
    release();
    await hold;
    await expect(pending).rejects.toThrow(/Management/);
  });
  it("reuses canonical responsibilities with durable assignment, source and audit", async () => {
    await s.createManagerTask(admin, values());
    const task = await getTask();
    expect(task).toMatchObject({
      managerTask: true,
      area: "WEBSITE",
      employeeId: person,
      oversightId: owner,
    });
    expect(await db.taskEvent.count({ where: { taskId: task.id } })).toBe(1);
    expect((await s.managerOverview(owner)).total).toBe(1);
  });
  it("generates recurring occurrences idempotently across concurrent workspace opens", async () => {
    await s.createManagerTask(
      owner,
      values({ frequency: "WEEKLY", weekdays: [Temporal.PlainDate.from(future).dayOfWeek] }),
    );
    const before = await db.taskInstance.count();
    await Promise.all([s.refreshWorkspace(owner), s.refreshWorkspace(admin)]);
    expect(await db.taskInstance.count()).toBe(before);
  });
  it("keeps configured closures out of recurring duties", async () => {
    await db.closure.upsert({
      where: { date: future },
      create: { date: future, reason: "Fixture closed" },
      update: { reason: "Fixture closed" },
    });
    await s.createManagerTask(
      owner,
      values({ frequency: "DAILY", weekdays: [1, 2, 3, 4, 5, 6, 7] }),
    );
    expect(await db.taskInstance.count({ where: { occurrenceDate: future } })).toBe(0);
    await db.closure.delete({ where: { date: future } });
  });
  it("does not duplicate starter duties or add prohibited training", async () => {
    const v = { date, time: "08:00", employeeId: person };
    await s.installStarter(owner, v);
    const n = await db.taskTemplate.count();
    await s.installStarter(owner, v);
    expect(await db.taskTemplate.count()).toBe(n);
    expect((await db.taskTemplate.findMany()).some((t) => /training|licens/i.test(t.title))).toBe(
      false,
    );
  });
  it("requires checklist completion and another manager’s review", async () => {
    await s.createManagerTask(
      owner,
      values({ checklist: [{ label: "Verify preview", done: false }] }),
    );
    let task = await getTask();
    await expect(change(owner, task.id, "COMPLETED")).rejects.toThrow(/checklist/);
    await s.updateDetails(owner, {
      taskId: task.id,
      version: 0,
      durationMinutes: 30,
      oversightId: owner,
      checklist: [{ label: "Verify preview", done: true }],
      dependencies: [],
      evidence: "Synthetic preview reference",
    });
    await change(owner, task.id, "COMPLETED");
    task = await getTask();
    await expect(
      s.reviewResponsibility(owner, { taskId: task.id, version: task.version }),
    ).rejects.toThrow(/Another manager/);
    await s.reviewResponsibility(admin, { taskId: task.id, version: task.version });
    expect((await getTask()).reviewedBy).toBe(admin);
  });
  it("prevents stale task edits", async () => {
    await s.createManagerTask(owner, values());
    const task = await getTask();
    const v = {
      taskId: task.id,
      version: 0,
      durationMinutes: 40,
      oversightId: owner,
      checklist: [],
      dependencies: [],
      evidence: "",
    };
    await s.updateDetails(owner, v);
    await expect(s.updateDetails(admin, v)).rejects.toThrow(/changed/);
  });
  it("rejects dependency cycles and enforces prerequisite reviews", async () => {
    await s.createManagerTask(owner, values());
    const a = await getTask();
    await s.createManagerTask(owner, values({ title: "Dependent", dependencies: [a.id] }));
    const b = await db.taskInstance.findFirstOrThrow({ where: { title: "Dependent" } });
    await expect(
      s.updateDetails(owner, {
        taskId: a.id,
        version: 0,
        durationMinutes: 30,
        oversightId: owner,
        checklist: [],
        dependencies: [b.id],
        evidence: "",
      }),
    ).rejects.toThrow(/cycle/);
    await change(owner, a.id, "COMPLETED");
    await expect(change(owner, b.id, "COMPLETED")).rejects.toThrow(/prerequisite/);
    const completed = await db.taskInstance.findUniqueOrThrow({ where: { id: a.id } });
    await s.reviewResponsibility(admin, { taskId: a.id, version: completed.version });
    await change(owner, b.id, "COMPLETED");
  });
  it("creates one open inventory task per condition even across days and users", async () => {
    await supply();
    await Promise.all([s.refreshWorkspace(owner), s.refreshWorkspace(admin)]);
    const tasks = await db.taskInstance.findMany();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].sourceHref).toBe("/operations/supplies");
    expect(
      await db.taskEvent.count({ where: { taskId: tasks[0].id, action: "SOURCE_TRIGGERED" } }),
    ).toBe(1);
    expect(
      await db.auditLog.count({
        where: { entityId: tasks[0].id, action: "MANAGER_SOURCE_TRIGGERED" },
      }),
    ).toBe(1);
    await s.refreshWorkspace(owner, new Date(Date.now() + 86400000));
    expect(await db.taskInstance.count()).toBe(1);
  });
  it("does not treat unknown stock/threshold as low zero", async () => {
    await r.saveSupply(owner, {
      version: 0,
      name: "Receipt paper",
      unit: "rolls",
      balance: null,
      reorderLevel: null,
      preferredVendor: "Amazon",
    });
    await s.refreshWorkspace(owner);
    expect(await db.taskInstance.count()).toBe(0);
  });
  it("keeps receipt stages independent and prevents duplicate stock receipts", async () => {
    const item = await supply(),
      p = await r.preparePurchase(admin, {
        itemId: item.id,
        quantity: 5,
        vendor: "Walmart",
        reference: "fixture-order",
      });
    await expect(
      r.advancePurchase(owner, { id: p.id, version: 0, status: "RECEIVED", note: "Receipt" }),
    ).rejects.toThrow(/in order/);
    await r.advancePurchase(admin, {
      id: p.id,
      version: 0,
      status: "SUBMITTED",
      note: "External order proof",
    });
    await r.advancePurchase(admin, {
      id: p.id,
      version: 1,
      status: "RECEIVED",
      note: "Physical receipt proof",
    });
    await expect(
      r.advancePurchase(owner, {
        id: p.id,
        version: 1,
        status: "RECEIVED",
        note: "Duplicate receipt",
      }),
    ).rejects.toThrow(/changed/);
    expect((await db.supplyItem.findUniqueOrThrow({ where: { id: item.id } })).balance).toBe(7);
  });
  it("keeps manager inventory configuration owner-only", async () => {
    await expect(
      r.saveSupply(admin, {
        version: 0,
        name: "Paper",
        unit: "packs",
        balance: 0,
        reorderLevel: 3,
        preferredVendor: "Walmart",
      }),
    ).rejects.toThrow(/owner/);
  });
  it("keeps schedule previews as drafts and rejects unconfigured approval", async () => {
    await s.createManagerTask(owner, values());
    const plan = await s.previewSchedule(owner, future);
    expect(plan.status).toBe("DRAFT");
    await expect(s.approveSchedule(owner, plan.id)).rejects.toThrow(/availability/);
  });
  it("persists approved availability-aware plans without changing task due dates", async () => {
    await available();
    await s.createManagerTask(owner, values());
    const before = await getTask();
    const plan = await s.previewSchedule(owner, future);
    await s.approveSchedule(owner, plan.id);
    expect((await db.managerSchedule.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe(
      "APPROVED",
    );
    expect((await getTask()).dueAt).toEqual(before.dueAt);
  });
  it("rejects stale schedule approval after task, availability or commitment changes", async () => {
    await available();
    await s.createManagerTask(owner, values());
    const plan = await s.previewSchedule(owner, future);
    await s.saveCommitment(owner, {
      title: "Appointment",
      date: future,
      startTime: "10:00",
      endTime: "11:00",
    });
    await expect(s.approveSchedule(owner, plan.id)).rejects.toThrow(/changed/);
  });
  it("rejects schedule conflicts instead of overbooking", async () => {
    await available();
    await s.saveCommitment(owner, {
      title: "Conflict",
      date: future,
      startTime: "08:00",
      endTime: "10:00",
    });
    const plan = await s.previewSchedule(owner, future);
    await expect(s.approveSchedule(owner, plan.id)).rejects.toThrow(/conflicts/);
  });
  it("isolates each manager’s availability and schedule", async () => {
    await available();
    const p = await s.previewSchedule(owner, future);
    expect((await s.managerOverview(admin)).availability).toBeNull();
    await expect(s.approveSchedule(admin, p.id)).rejects.toThrow(/not found/);
  });
  it("never turns task completion into a financial payment or deposit", async () => {
    const receiptsBefore = await db.dealerPayment.count();
    await s.createManagerTask(owner, values({ area: "PAYROLL" }));
    await change(owner, (await getTask()).id, "COMPLETED");
    expect(await db.managerFinancialEvidence.count()).toBe(0);
    expect(await db.dealerPayment.count()).toBe(receiptsBefore);
  });
  it("uses a bank-authorized limit, retains check identity and independently reconciles", async () => {
    const check = await r.recordFinancialEvidence(admin, {
      kind: "DEPOSIT",
      sourceId: "check-1",
      amountCents: 20000,
      date,
      method: "CHECK",
      reference: "receipt-1",
      notes: "Check received, not bank confirmed",
    });
    await expect(
      r.recordDepositSubmission(admin, {
        id: check.id,
        method: "REMOTE",
        reference: "deposit-1",
        date,
        notes: "Deposit receipt",
      }),
    ).rejects.toThrow(/limit/);
    await r.saveBankLimit(owner, { version: 0, remoteLimitCents: 15000 });
    await expect(
      r.recordDepositSubmission(admin, {
        id: check.id,
        method: "REMOTE",
        reference: "deposit-1",
        date,
        notes: "Deposit receipt",
      }),
    ).rejects.toThrow(/limit/);
    await r.recordDepositSubmission(admin, {
      id: check.id,
      method: "BANK",
      reference: "deposit-1",
      date,
      notes: "Bank receipt",
    });
    await expect(
      r.recordFinancialEvidence(owner, {
        kind: "DEPOSIT",
        sourceId: "check-1",
        amountCents: 20000,
        date,
        method: "BANK",
        reference: "different",
        notes: "Duplicate",
      }),
    ).rejects.toThrow(/already/);
    await r.reconcileFinancialEvidence(owner, { id: check.id, notes: "Bank statement matched" });
    expect(
      (await db.managerFinancialEvidence.findUniqueOrThrow({ where: { id: check.id } }))
        .reconciledBy,
    ).toBe(owner);
  });
  it("requires an approved draft and prevents duplicate payroll periods", async () => {
    const period = await db.payrollPeriod.create({
      data: { startDate: date, endDate: date, label: "Synthetic", createdBy: admin },
    });
    const draft = await db.payrollDraft.create({
      data: {
        periodId: period.id,
        revision: 1,
        status: "DRAFT",
        preparedBy: admin,
        totalCents: 10000,
      },
    });
    const input = {
      kind: "PAYROLL",
      sourceId: draft.id,
      amountCents: 10000,
      date,
      method: "OTHER",
      reference: "pay-1",
      notes: "External gross pay proof",
    };
    await expect(r.recordFinancialEvidence(owner, input)).rejects.toThrow(/approved/);
    await db.payrollDraft.update({
      where: { id: draft.id },
      data: { status: "APPROVED", reviewedBy: owner, reviewedAt: now },
    });
    await r.recordFinancialEvidence(owner, input);
    await expect(
      r.recordFinancialEvidence(owner, { ...input, reference: "pay-2" }),
    ).rejects.toThrow(/already/);
    await expect(
      r.recordFinancialEvidence(admin, { ...input, reference: "pay-3" }),
    ).rejects.toThrow(/owner/);
  });
  it("does not queue unrelated automation, send messages or alter payroll on access", async () => {
    const before = [
      await db.automationJob.count(),
      await db.payrollDraft.count(),
      await db.dealerInvoice.count(),
    ];
    await s.refreshWorkspace(owner);
    await s.managerOverview(owner);
    expect([
      await db.automationJob.count(),
      await db.payrollDraft.count(),
      await db.dealerInvoice.count(),
    ]).toEqual(before);
  });
  it("imports supplied contacts once while preserving existing directory records", async () => {
    await db.vendor.create({
      data: {
        name: "OPUS",
        phone: "800-526-9574",
        email: "",
        contact: "Existing",
        services: "Preserve",
        reference: "Existing ref",
      },
    });
    await s.importVendorContacts(owner);
    await s.importVendorContacts(owner);
    expect(await db.vendor.count()).toBe(5);
    expect((await db.vendor.findFirstOrThrow({ where: { name: "OPUS" } })).reference).toBe(
      "Existing ref",
    );
    await expect(s.importVendorContacts(admin)).rejects.toThrow(/Owner/);
  });
  it("uses 15-item pages without losing older work", async () => {
    for (let i = 0; i < 16; i++) await s.createManagerTask(owner, values({ title: `Work ${i}` }));
    expect((await s.managerOverview(owner)).tasks).toHaveLength(15);
    expect((await s.managerOverview(owner, 2)).tasks).toHaveLength(1);
  });
  it("retains missed recurring dates after an extended absence with visible bounded catch-up", async () => {
    await s.createManagerTask(
      owner,
      values({ date, frequency: "DAILY", weekdays: [1, 2, 3, 4, 5, 6, 7] }),
    );
    const later = addDays(date, 125);
    await s.refreshWorkspace(owner, dueInstant(later, "12:00"));
    let template = await db.taskTemplate.findFirstOrThrow();
    expect(template.generatedThrough! < later).toBe(true);
    await s.refreshWorkspace(owner, dueInstant(later, "12:00"));
    template = await db.taskTemplate.findFirstOrThrow();
    expect(template.generatedThrough).toBe(addDays(later, 14));
    expect(await db.taskInstance.count({ where: { occurrenceDate: addDays(date, 60) } })).toBe(1);
  });
  it("edits future duties without rewriting completed occurrence snapshots", async () => {
    const template = await s.createManagerTask(
      owner,
      values({ frequency: "WEEKLY", weekdays: [1] }),
    );
    const old = await db.taskInstance.findMany({ where: { templateId: template.id } });
    await s.editDuty(owner, {
      ...values({ frequency: "WEEKLY", weekdays: [1], title: "Revised work", durationMinutes: 45 }),
      id: template.id,
      version: 0,
    });
    expect((await db.taskTemplate.findUniqueOrThrow({ where: { id: template.id } })).title).toBe(
      "Revised work",
    );
    expect(await db.taskInstance.findMany({ where: { templateId: template.id } })).toEqual(old);
    await expect(s.editDuty(owner, { ...values(), id: template.id, version: 1 })).rejects.toThrow(
      /one-time project/,
    );
    await expect(s.editDuty(owner, { ...values(), id: template.id, version: 0 })).rejects.toThrow(
      /changed/,
    );
  });
  it("raises urgent camera follow-ups without modifying the maintenance source", async () => {
    const asset = await db.equipment.create({
      data: { code: randomUUID(), name: "Synthetic camera", category: "OTHER" },
    });
    const issue = await db.maintenanceTicket.create({
      data: {
        equipmentId: asset.id,
        title: "Camera offline",
        description: "Reported security failure",
        priority: "HIGH",
        targetDate: date,
        dueAt: dueInstant(date, "17:00"),
        reportedBy: owner,
      },
    });
    await s.refreshWorkspace(owner);
    await s.refreshWorkspace(admin);
    const task = await db.taskInstance.findFirstOrThrow({
      where: { sourceHref: `/maintenance/${issue.id}` },
    });
    expect(task.priority).toBe("CRITICAL");
    await change(owner, task.id, "COMPLETED");
    expect((await db.maintenanceTicket.findUniqueOrThrow({ where: { id: issue.id } })).status).toBe(
      "OPEN",
    );
  });
  it("preserves transaction history beyond the first 15 records", async () => {
    for (let i = 0; i < 16; i++)
      await r.recordFinancialEvidence(admin, {
        kind: "DEPOSIT",
        sourceId: `check-${i}`,
        amountCents: 100,
        date,
        method: "CHECK",
        reference: `ref-${i}`,
        notes: "Synthetic check evidence",
      });
    expect((await r.financialRegister(owner))[1].rows).toHaveLength(15);
    expect((await r.financialRegister(owner, 2))[1].rows).toHaveLength(1);
    const row = await db.managerFinancialEvidence.findFirstOrThrow();
    await expect(
      r.reconcileFinancialEvidence(owner, {
        id: row.id,
        notes: "Cannot bank reconcile an undeposited check",
      }),
    ).rejects.toThrow(/external deposit/);
  });
  it("keeps older pending purchases accessible for receipt confirmation", async () => {
    const item = await supply();
    for (let i = 0; i < 16; i++)
      await r.preparePurchase(owner, {
        itemId: item.id,
        quantity: 1,
        vendor: "Walmart",
        reference: `order-${i}`,
      });
    expect((await r.supplyRegister(owner))[0].purchases).toHaveLength(15);
    expect((await r.supplyRegister(owner, 2))[0].purchases).toHaveLength(1);
  });
});
