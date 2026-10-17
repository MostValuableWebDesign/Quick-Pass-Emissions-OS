import { Prisma, type Priority } from "@prisma/client";
import { isDeepStrictEqual } from "node:util";
import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { db } from "@/lib/db";
import { addDays, businessDate, dueInstant } from "@/lib/time";
import { id, note, text, dateString, timeString, requiredInteger } from "@/lib/validation";
import { audit, requireRule, type Tx } from "../phase2";
import { automationLocks } from "../automation/transaction";
import { overview } from "../automation/overview";
import { occursOn } from "../tasks/recurrence";
import {
  availabilityInput,
  areas,
  taskInput,
  checklistInput,
  proposeSchedule,
  taskReady,
  type Plan,
} from "./rules";
import { starterDuties, vendorContacts } from "./starter";

export async function managerTransaction<T>(
  actorId: string,
  work: (
    tx: Tx,
    actor: { id: string; name: string; role: string; employee: { id: string } | null },
  ) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await automationLocks(tx);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183519)`;
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        include: { employee: { select: { id: true } } },
      });
      requireRule(
        actor?.active && ["OWNER", "ADMIN"].includes(actor.role),
        "Management access denied; an active owner or manager is required.",
      );
      return work(tx, actor);
    },
    {
      timeout: 60000,
      maxWait: 10000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
}
async function assignees(tx: Tx, employeeId: string, oversightId: string) {
  const [employee, owner] = await Promise.all([
    tx.employee.findUnique({ where: { id: employeeId }, include: { user: true } }),
    tx.user.findUnique({ where: { id: oversightId } }),
  ]);
  requireRule(employee?.user.active, "Choose an active person for execution.");
  requireRule(
    owner?.active && ["OWNER", "ADMIN"].includes(owner.role),
    "Choose an active manager for oversight.",
  );
}
export async function createManagerTask(actorId: string, input: unknown) {
  const data = taskInput.parse(input);
  requireRule(
    data.date >= addDays(businessDate(), -31),
    "Choose a date within the last 31 days or later.",
  );
  return managerTransaction(actorId, async (tx) => {
    await assignees(tx, data.employeeId, data.oversightId);
    const { date, time, dependencies, ...values } = data;
    for (const prerequisiteId of dependencies)
      requireRule(
        await tx.taskInstance.count({ where: { id: prerequisiteId } }),
        "Dependency does not exist.",
      );
    const template = await tx.taskTemplate.create({
      data: { ...values, startDate: date, dueTime: time, managerTask: true },
    });
    if (data.frequency === "ONCE") {
      const task = await tx.taskInstance.create({
        data: {
          ...instance(template, date),
          dependencies: { create: dependencies.map((prerequisiteId) => ({ prerequisiteId })) },
        },
      });
      await event(tx, actorId, task.id, "CREATED", "One-time project created");
    }
    await audit(tx, actorId, "MANAGER_TASK_CREATED", template.id, data);
    await generateOccurrences(tx, businessDate(), actorId);
    return template;
  });
}
export async function createOwnResponsibilityProfile(actorId: string) {
  return managerTransaction(actorId, async (tx, actor) => {
    if (actor.employee) return;
    const profile = await tx.employee.create({
      data: { userId: actorId, jobRole: "Management", duties: "Operations management" },
    });
    await audit(tx, actorId, "MANAGER_RESPONSIBILITY_PROFILE", profile.id, {
      payConfigured: false,
      accountAccessChanged: false,
    });
  });
}
function instance(t: Prisma.TaskTemplateGetPayload<object>, date: string) {
  return {
    templateId: t.id,
    occurrenceDate: date,
    title: t.title,
    description: t.description,
    employeeId: t.employeeId,
    dueAt: dueInstant(date, t.dueTime),
    priority: t.priority,
    reviewRequired: t.reviewRequired,
    escalationHours: t.escalationHours,
    managerTask: t.managerTask,
    area: t.area,
    station: t.station,
    durationMinutes: t.durationMinutes,
    oversightId: t.oversightId,
    checklist: t.checklist as Prisma.InputJsonValue,
    sourceHref: t.sourceHref,
  };
}
async function event(tx: Tx, actorId: string, taskId: string, action: string, message: string) {
  const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId }, select: { name: true } });
  await tx.taskEvent.create({
    data: { taskId, actorId, actorName: actor.name, action, note: message },
  });
}
export async function reviewResponsibility(actorId: string, input: unknown) {
  const data = z.object({ taskId: id, version: requiredInteger(0, 2147483647) }).parse(input);
  return managerTransaction(actorId, async (tx) => {
    const task = await tx.taskInstance.findUniqueOrThrow({ where: { id: data.taskId } });
    requireRule(
      task.status === "COMPLETED" && task.reviewedAt === null && task.version === data.version,
      "Task changed or is not awaiting review. Refresh.",
    );
    const completion = await tx.taskEvent.findFirst({
      where: { taskId: task.id, action: "COMPLETED" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    requireRule(
      !task.managerTask || completion?.actorId !== actorId,
      "Another manager must review this completion.",
    );
    await tx.taskInstance.update({
      where: { id: task.id },
      data: { reviewedAt: new Date(), reviewedBy: actorId, version: { increment: 1 } },
    });
    await event(tx, actorId, task.id, "REVIEWED", "Completion independently reviewed");
    await audit(tx, actorId, "TASK_REVIEWED", task.id, {});
  });
}
/** Access-driven generation is explicitly requested; no unrelated jobs, mail or provider calls. */
export async function generateOccurrences(tx: Tx, today: string, actorId: string) {
  const templates = await tx.taskTemplate.findMany({
    where: {
      managerTask: true,
      active: true,
      frequency: { not: "ONCE" },
      employee: { user: { active: true } },
    },
  });
  const closures = new Set((await tx.closure.findMany()).map((c) => c.date));
  const setting = await tx.businessSetting.findUnique({ where: { id: "business" } });
  let generated = 0;
  for (const t of templates) {
    let templateCount = 0;
    const from = t.generatedThrough
      ? t.startDate > t.generatedThrough
        ? t.startDate
        : t.generatedThrough
      : t.startDate;
    const until = [addDays(today, 14), addDays(from, 92)].sort()[0];
    for (let d = from; d <= until; d = addDays(d, 1)) {
      // Duties can cover the carwash on other days; their explicit weekdays define scope.
      const open =
        t.frequency === "DAILY"
          ? t.weekdays.length
            ? t.weekdays
            : setting?.configured
              ? setting.operatingDays
              : []
          : [1, 2, 3, 4, 5, 6, 7];
      if (!occursOn(t, d, open, closures)) continue;
      const created = await tx.taskInstance.createMany({
        data: [instance(t, d)],
        skipDuplicates: true,
      });
      generated += created.count;
      templateCount += created.count;
    }
    if (until >= from)
      await tx.taskTemplate.update({ where: { id: t.id }, data: { generatedThrough: until } });
    if (templateCount)
      await audit(tx, actorId, "MANAGER_RECURRENCE_GENERATED", t.id, {
        from,
        through: until,
        count: templateCount,
      });
  }
  return generated;
}
export async function refreshWorkspace(actorId: string, now = new Date()) {
  return managerTransaction(actorId, async (tx, actor) => {
    const today = businessDate(now);
    await generateOccurrences(tx, today, actorId);
    if (!actor.employee) return;
    const state = await overview(tx, now);
    const triggers = state.inventory
      .filter((i) => i.low)
      .map((i) => ({
        key: `inventory:${i.key}`,
        title: `Reorder ${i.name}`,
        area: i.key === "certificates" ? "EMISSIONS" : "SELF_SERVICE_WASH",
        priority: "HIGH" as Priority,
        href: i.key === "certificates" ? "/certificates" : "/chemicals",
        detail:
          i.key === "certificates"
            ? "Prepare an ACH certificate order of at least 300 using the existing certificate workflow. Submission, receipt and reconciliation remain separate. This task does not initiate ACH."
            : "Review recorded chemical stock and configured threshold before purchasing.",
      }));
    for (const s of await tx.supplyItem.findMany({
      where: { balance: { not: null }, reorderLevel: { not: null } },
    }))
      if (s.balance! <= s.reorderLevel!)
        triggers.push({
          key: `supply:${s.id}`,
          title: `Reorder ${s.name}`,
          area: "GENERAL",
          priority: "HIGH",
          href: "/operations/supplies",
          detail: `Recorded ${s.balance} ${s.unit}; configured threshold ${s.reorderLevel}. Confirm purchase and receipt separately.`,
        });
    for (const t of await tx.maintenanceTicket.findMany({
      where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
    }))
      triggers.push({
        key: `maintenance:${t.id}`,
        title: `Follow up: ${t.title}`,
        area: "PROPERTY",
        priority:
          t.priority === "CRITICAL" || /camera|security/i.test(`${t.title} ${t.description}`)
            ? "CRITICAL"
            : "HIGH",
        href: `/maintenance/${t.id}`,
        detail:
          "Review issue severity, contact attempts, appointment, quote and approval in Maintenance / Service & Support. Task completion does not confirm a repair.",
      });
    for (const trigger of triggers) {
      let template = await tx.taskTemplate.findUnique({ where: { workspaceKey: trigger.key } });
      if (
        template &&
        (await tx.taskInstance.count({
          where: {
            templateId: template.id,
            OR: [
              { status: { notIn: ["COMPLETED", "CANCELLED"] } },
              { status: "COMPLETED", reviewRequired: true, reviewedAt: null },
            ],
          },
        }))
      )
        continue;
      if (!template)
        template = await tx.taskTemplate.create({
          data: {
            workspaceKey: trigger.key,
            managerTask: true,
            title: trigger.title,
            description: trigger.detail,
            area: trigger.area,
            sourceHref: trigger.href,
            frequency: "ONCE",
            startDate: today,
            dueTime: "17:00",
            employeeId: actor.employee.id,
            oversightId: actorId,
            priority: trigger.priority,
            reviewRequired: true,
          },
        });
      const created = await tx.taskInstance.createMany({
        data: [instance(template, today)],
        skipDuplicates: true,
      });
      if (created.count) {
        const task = await tx.taskInstance.findUniqueOrThrow({
          where: { templateId_occurrenceDate: { templateId: template.id, occurrenceDate: today } },
        });
        await event(tx, actorId, task.id, "SOURCE_TRIGGERED", trigger.detail);
        await audit(tx, actorId, "MANAGER_SOURCE_TRIGGERED", task.id, {
          source: trigger.key,
          href: trigger.href,
          templateId: template.id,
          occurrenceDate: today,
        });
      }
    }
  });
}
export async function installStarter(actorId: string, input: unknown) {
  const data = z.object({ date: dateString, time: timeString, employeeId: id }).parse(input);
  requireRule(
    data.date >= addDays(businessDate(), -31),
    "Choose a starter date within the last 31 days or in the future.",
  );
  return managerTransaction(actorId, async (tx) => {
    await assignees(tx, data.employeeId, actorId);
    for (const duty of starterDuties) {
      const key = `starter:${actorId}:${duty.key}`;
      if (await tx.taskTemplate.count({ where: { workspaceKey: key } })) continue;
      await tx.taskTemplate.create({
        data: {
          workspaceKey: key,
          managerTask: true,
          title: duty.title,
          description: duty.description,
          area: duty.area,
          frequency: duty.frequency as "DAILY" | "WEEKLY",
          weekdays: duty.weekdays.length ? [...duty.weekdays] : [1, 2, 3, 4, 5, 6],
          startDate: data.date,
          dueTime: duty.key === "opening" ? data.time : duty.time,
          employeeId: data.employeeId,
          oversightId: actorId,
          priority: duty.priority as "HIGH" | "NORMAL",
          durationMinutes: duty.minutes,
          reviewRequired: true,
        },
      });
    }
    await audit(tx, actorId, "MANAGER_STARTER_CREATED", actorId, data);
    await generateOccurrences(tx, businessDate(), actorId);
  });
}
export async function updateDetails(actorId: string, input: unknown) {
  const data = z
    .object({
      taskId: id,
      version: requiredInteger(0, 2147483647),
      durationMinutes: requiredInteger(5, 480),
      checklist: checklistInput,
      evidence: note,
      dependencies: z.array(id).max(30),
      oversightId: id,
      title: text.optional(),
      description: note.optional(),
      area: z.enum(areas).optional(),
      station: z.string().trim().max(100).optional(),
      priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).optional(),
    })
    .parse(input);
  return managerTransaction(actorId, async (tx) => {
    const task = await tx.taskInstance.findUniqueOrThrow({ where: { id: data.taskId } });
    requireRule(task.version === data.version, "Task changed. Refresh before editing.");
    requireRule(
      !["COMPLETED", "CANCELLED"].includes(task.status),
      "Reopen the task before editing its plan.",
    );
    await assignees(tx, task.employeeId, data.oversightId);
    const edges = await tx.taskDependency.findMany();
    function reaches(from: string, target: string, seen = new Set<string>()): boolean {
      if (from === target) return true;
      if (seen.has(from)) return false;
      seen.add(from);
      return edges
        .filter((e) => e.taskId === from)
        .some((e) => reaches(e.prerequisiteId, target, seen));
    }
    for (const d of data.dependencies) {
      requireRule(d !== task.id && !reaches(d, task.id), "Dependencies cannot form a cycle.");
      requireRule(
        await tx.taskInstance.count({ where: { id: d } }),
        "Choose an existing prerequisite.",
      );
    }
    await tx.taskDependency.deleteMany({ where: { taskId: task.id } });
    await tx.taskDependency.createMany({
      data: [...new Set(data.dependencies)].map((prerequisiteId) => ({
        taskId: task.id,
        prerequisiteId,
      })),
    });
    await tx.taskInstance.update({
      where: { id: task.id },
      data: {
        durationMinutes: data.durationMinutes,
        oversightId: data.oversightId,
        checklist: data.checklist,
        evidence: data.evidence,
        title: data.title,
        description: data.description,
        area: data.area,
        station: data.station,
        priority: data.priority,
        version: { increment: 1 },
      },
    });
    await event(
      tx,
      actorId,
      task.id,
      "PLAN_UPDATED",
      `Checklist / duration / dependencies / evidence updated. ${data.evidence}`,
    );
    await audit(tx, actorId, "MANAGER_TASK_DETAILS", task.id, {
      before: {
        durationMinutes: task.durationMinutes,
        title: task.title,
        description: task.description,
        area: task.area,
        station: task.station,
        priority: task.priority,
        checklist: task.checklist,
        evidence: task.evidence,
        oversightId: task.oversightId,
      },
      ...data,
    });
  });
}
export async function editDuty(actorId: string, input: unknown) {
  const key = z.object({ id, version: requiredInteger(0, 2147483647) }).parse(input),
    data = taskInput.parse(input);
  return managerTransaction(actorId, async (tx) => {
    const before = await tx.taskTemplate.findUniqueOrThrow({ where: { id: key.id } });
    requireRule(before.managerTask && before.version === key.version, "Duty changed. Refresh.");
    requireRule(
      data.frequency !== "ONCE",
      "Create a separate one-time project and pause the recurring duty instead.",
    );
    await assignees(tx, data.employeeId, data.oversightId);
    const { date, time, dependencies, ...values } = data;
    void dependencies;
    await tx.taskTemplate.update({
      where: { id: key.id },
      data: {
        ...values,
        startDate: date,
        dueTime: time,
        generatedThrough: addDays(businessDate(), -1),
        version: { increment: 1 },
      },
    });
    await audit(tx, actorId, "MANAGER_DUTY_EDITED", key.id, { before, ...data });
  });
}
export async function saveAvailability(actorId: string, input: unknown) {
  const data = availabilityInput.parse(input);
  return managerTransaction(actorId, async (tx) => {
    const before = await tx.managerAvailability.findUnique({ where: { userId: actorId } });
    requireRule((before?.version ?? 0) === data.version, "Availability changed. Refresh.");
    const row = await tx.managerAvailability.upsert({
      where: { userId: actorId },
      create: { userId: actorId, days: data.days, reservePercent: data.reservePercent, version: 1 },
      update: { days: data.days, reservePercent: data.reservePercent, version: { increment: 1 } },
    });
    await audit(tx, actorId, "MANAGER_AVAILABILITY", actorId, { before, ...data });
    return row;
  });
}
export async function saveCommitment(actorId: string, input: unknown) {
  const data = z
    .object({ title: text, date: dateString, startTime: timeString, endTime: timeString })
    .refine((v) => v.startTime < v.endTime, "End must follow start.")
    .parse(input);
  return managerTransaction(actorId, async (tx) => {
    const row = await tx.managerCommitment.create({ data: { ...data, userId: actorId } });
    await audit(tx, actorId, "MANAGER_COMMITMENT", row.id, data);
    return row;
  });
}
export async function cancelCommitment(actorId: string, input: unknown) {
  const key = id.parse(input);
  return managerTransaction(actorId, async (tx) => {
    requireRule(
      (
        await tx.managerCommitment.updateMany({
          where: { id: key, userId: actorId, cancelledAt: null },
          data: { cancelledAt: new Date() },
        })
      ).count,
      "Commitment not found.",
    );
    await audit(tx, actorId, "MANAGER_COMMITMENT_CANCELLED", key, {});
  });
}
async function buildPlan(tx: Tx, actorId: string, start: string, now: Date) {
  const availability = await tx.managerAvailability.findUnique({ where: { userId: actorId } });
  const employee = await tx.employee.findUnique({
    where: { userId: actorId },
    select: { id: true },
  });
  const tasks = employee
    ? await tx.taskInstance.findMany({
        where: {
          employeeId: employee.id,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          dueAt: { lt: dueInstant(addDays(start, 7), "00:00") },
        },
        include: { dependencies: { include: { prerequisite: true } } },
        orderBy: { id: "asc" },
      })
    : [];
  const commitments = await tx.managerCommitment.findMany({
    where: { userId: actorId, date: { gte: start, lte: addDays(start, 6) }, cancelledAt: null },
    select: { id: true, title: true, date: true, startTime: true, endTime: true },
    orderBy: { id: "asc" },
  });
  const plan = proposeSchedule(
    start,
    availability ? availabilityInput.parse(availability) : null,
    tasks.map((t) => ({
      ...t,
      dependencies: t.dependencies
        .filter(
          (d) =>
            !taskReady(
              d.prerequisite.status,
              d.prerequisite.reviewRequired,
              d.prerequisite.reviewedAt,
            ),
        )
        .map((d) => d.prerequisiteId),
    })),
    commitments,
    now,
  );
  return { plan, availability };
}
export async function previewSchedule(actorId: string, input: unknown, now = new Date()) {
  const start = dateString.parse(input);
  requireRule(
    start >= addDays(businessDate(now), -6) && start <= addDays(businessDate(now), 90),
    "Preview a current week or the next 90 days.",
  );
  return managerTransaction(actorId, async (tx) => {
    const { plan, availability } = await buildPlan(tx, actorId, start, now);
    const row = await tx.managerSchedule.create({
      data: {
        userId: actorId,
        startDate: start,
        availabilityVersion: availability?.version,
        payload: plan as unknown as Prisma.InputJsonValue,
      },
    });
    await audit(tx, actorId, "MANAGER_SCHEDULE_PREVIEW", row.id, {
      start,
      configured: plan.configured,
    });
    return row;
  });
}
export async function approveSchedule(actorId: string, input: unknown, now = new Date()) {
  const key = id.parse(input);
  return managerTransaction(actorId, async (tx) => {
    requireRule(
      await tx.employee.count({ where: { userId: actorId } }),
      "Create your responsibility profile before approving a personal schedule.",
    );
    const row = await tx.managerSchedule.findFirst({
      where: { id: key, userId: actorId, status: "DRAFT" },
    });
    requireRule(row, "Draft plan not found.");
    const original = row.payload as unknown as Plan;
    const current = await buildPlan(tx, actorId, row.startDate, now);
    requireRule(
      current.availability && current.plan.configured,
      "Configure availability before approval.",
    );
    requireRule(
      current.availability.version === row.availabilityVersion &&
        isDeepStrictEqual(current.plan, original),
      "Tasks, time, commitments or availability changed. Preview again.",
    );
    requireRule(!original.conflicts.length, "Resolve fixed-commitment conflicts before approval.");
    await tx.managerSchedule.updateMany({
      where: {
        userId: actorId,
        status: "APPROVED",
        startDate: { gte: addDays(row.startDate, -6), lte: addDays(row.startDate, 6) },
      },
      data: { status: "SUPERSEDED" },
    });
    await tx.managerSchedule.update({
      where: { id: key },
      data: { status: "APPROVED", approvedAt: now },
    });
    await audit(tx, actorId, "MANAGER_SCHEDULE_APPROVED", key, {
      unscheduled: original.unscheduled.length,
      slots: original.slots.length,
    });
  });
}
export async function importVendorContacts(actorId: string) {
  return managerTransaction(actorId, async (tx, actor) => {
    requireRule(actor.role === "OWNER", "Owner approval required to add supplied contacts.");
    const existing = await tx.vendor.findMany();
    const results = [];
    for (const v of vendorContacts) {
      const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const match = existing.find(
        (e) =>
          normalized(e.name).includes(normalized(v.name)) ||
          normalized(v.name).includes(normalized(e.name)) ||
          (v.phone && normalized(e.phone) === normalized(v.phone)),
      );
      if (match) {
        results.push({ name: v.name, status: "EXISTING_REVIEW", id: match.id });
        continue;
      }
      const row = await tx.vendor.create({
        data: {
          ...v,
          contact: v.name,
          email: "",
          sourceReference: "Owner supplied Operations Manager request, October 17 2026",
          notes: "Owner-supplied contact. Contact details not independently verified.",
          accountReference: v.reference,
        },
      });
      results.push({ name: v.name, status: "CREATED", id: row.id });
    }
    await audit(tx, actorId, "MANAGER_VENDOR_CONTACTS", actorId, { results });
    return results;
  });
}
export async function managerOverview(
  actorId: string,
  page = 1,
  filter = "active",
  area = "",
  now = new Date(),
) {
  return managerTransaction(actorId, async (tx, actor) => {
    const today = businessDate(now);
    const where: Prisma.TaskInstanceWhereInput = {
      ...(area ? { area } : {}),
      ...(filter === "review"
        ? { status: "COMPLETED", reviewRequired: true, reviewedAt: null }
        : filter === "completed"
          ? { status: "COMPLETED" }
          : filter === "overdue"
            ? { status: { notIn: ["COMPLETED", "CANCELLED"] }, dueAt: { lt: now } }
            : { status: { notIn: ["COMPLETED", "CANCELLED"] } }),
    };
    const [
      state,
      tasks,
      total,
      people,
      shifts,
      equipment,
      bays,
      payroll,
      deposits,
      supplies,
      availability,
      schedules,
      commitments,
      campaigns,
      bank,
      templates,
    ] = await Promise.all([
      overview(tx, now),
      tx.taskInstance.findMany({
        where,
        include: { employee: { select: { user: { select: { name: true } } } } },
        orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { id: "asc" }],
        take: 15,
        skip: (page - 1) * 15,
      }),
      tx.taskInstance.count({ where }),
      tx.employee.findMany({
        where: { user: { active: true } },
        select: { id: true, userId: true, user: { select: { name: true, role: true } } },
        orderBy: { id: "asc" },
      }),
      tx.employeeSchedule.findMany({
        where: { date: today },
        include: { employee: { select: { user: { select: { name: true, active: true } } } } },
      }),
      tx.equipment.findMany({ where: { active: true }, select: { id: true, name: true } }),
      tx.carwashBay.findMany({ orderBy: { id: "asc" } }),
      tx.payrollPeriod.findMany({
        where: { status: { not: "CANCELLED" } },
        orderBy: { endDate: "desc" },
        take: 15,
        include: { drafts: { orderBy: { revision: "desc" }, take: 1 } },
      }),
      tx.managerFinancialEvidence.findMany({
        where: { kind: "DEPOSIT" },
        orderBy: { date: "desc" },
        take: 15,
      }),
      tx.supplyItem.findMany({
        include: { purchases: { orderBy: { createdAt: "desc" }, take: 15 } },
        orderBy: { name: "asc" },
      }),
      tx.managerAvailability.findUnique({ where: { userId: actorId } }),
      tx.managerSchedule.findMany({
        where: { userId: actorId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      tx.managerCommitment.findMany({
        where: { userId: actorId, date: { gte: today }, cancelledAt: null },
        orderBy: { date: "asc" },
        take: 30,
      }),
      tx.marketingCampaign.findMany({
        where: { status: { not: "ARCHIVED" } },
        orderBy: { endDate: "asc" },
        take: 15,
        include: { actions: true },
      }),
      tx.managerBankPolicy.findUnique({ where: { id: "business" } }),
      tx.taskTemplate.findMany({
        where: { managerTask: true, oversightId: actorId },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);
    const weekday = Temporal.PlainDate.from(today).dayOfWeek;
    const periodPayments = await tx.managerFinancialEvidence.findMany({
      where: { kind: "PAYROLL", sourceKey: { in: payroll.map((p) => `payroll:${p.id}`) } },
    });
    return {
      actor,
      today,
      now,
      state,
      tasks,
      total,
      people,
      shifts,
      equipment,
      bays,
      payroll,
      payments: periodPayments,
      deposits,
      supplies,
      availability,
      schedules,
      commitments,
      campaigns,
      bank,
      templates,
      nextMonday: addDays(today, (8 - weekday) % 7),
    };
  });
}
