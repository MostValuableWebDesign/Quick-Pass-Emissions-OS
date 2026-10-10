"use server";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser, manager } from "@/lib/access";
import { canManageRole, isManager } from "@/lib/policy";
import {
  dateString,
  days,
  employeeInput,
  fields,
  id,
  note,
  shiftInput,
  templateInput,
  timeString,
} from "@/lib/validation";
import { dueInstant, businessDate, addDays } from "@/lib/time";
import { changeTask, taskChange } from "@/modules/tasks/service";
import { runJobs } from "@/modules/tasks/jobs";
import { occursOn } from "@/modules/tasks/recurrence";
export type ActionState = { ok?: boolean; message?: string; invite?: string };
async function perform(work: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    const result = await work();
    revalidatePath("/", "layout");
    return result ?? { ok: true, message: "Saved successfully." };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { ok: false, message: error.issues[0]?.message || "Check your entries." };
    // Never return database/constraint details, tokens, or stack traces to the browser.
    if (
      error instanceof Error &&
      !error.message.includes("prisma") &&
      !error.message.includes("Invalid `") &&
      !error.message.includes("NEXT_") &&
      !error.message.includes("Unique constraint")
    ) {
      const safe = /^(Please|This|Task|You |Only|Choose|Configure|Cannot|Invite|A task|Shift)/;
      if (safe.test(error.message)) return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message:
        "Unable to save. Check your entries, permissions, and connection, then refresh and try again.",
    };
  }
}
export async function saveEmployee(_: ActionState, form: FormData) {
  return perform(async () => {
    const actor = await manager();
    const data = employeeInput.parse(fields(form));
    const employeeId = form.get("id")?.toString();
    if (!canManageRole(actor.role, data.role))
      throw new Error("Only the owner may manage privileged accounts.");
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
      const { name, email, role, ...profile } = data;
      if (employeeId) {
        const old = await tx.employee.findUniqueOrThrow({
          where: { id: employeeId },
          include: { user: true },
        });
        if (!canManageRole(actor.role, old.user.role))
          throw new Error("Only the owner may manage privileged accounts.");
        if (old.userId === actor.id && role !== old.user.role)
          throw new Error("You cannot change your own role.");
        await tx.employee.update({ where: { id: employeeId }, data: profile });
        // Email identity is immutable after provisioning; prevents account takeover by changing an invite recipient.
        if (old.user.email !== email)
          throw new Error(
            "Please keep the account email unchanged; provision a new account for a new identity.",
          );
        await tx.user.update({ where: { id: old.userId }, data: { name, role } });
        if (role !== old.user.role) await tx.session.deleteMany({ where: { userId: old.userId } });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "EMPLOYEE_UPDATED",
            entityId: employeeId,
            details: { oldRole: old.user.role, role },
          },
        });
      } else {
        const employee = await tx.employee.create({
          data: { ...profile, user: { create: { name, email, role } } },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "EMPLOYEE_CREATED",
            entityId: employee.id,
            details: { role },
          },
        });
      }
    });
  });
}
export async function setEmployeeActive(_: ActionState, form: FormData) {
  return perform(async () => {
    const actor = await manager();
    const employeeId = id.parse(form.get("id"));
    const active = form.get("active") === "true";
    await db.$transaction(async (tx) => {
      const employee = await tx.employee.findUniqueOrThrow({
        where: { id: employeeId },
        include: { user: true },
      });
      if (employee.userId === actor.id) throw new Error("You cannot deactivate your own account.");
      if (!canManageRole(actor.role, employee.user.role))
        throw new Error("Only the owner may manage privileged accounts.");
      await tx.user.update({ where: { id: employee.userId }, data: { active } });
      await tx.session.deleteMany({ where: { userId: employee.userId } });
      await tx.invite.updateMany({
        where: { employeeId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "EMPLOYEE_STATUS",
          entityId: employeeId,
          details: { active },
        },
      });
    });
  });
}
export async function issueInvite(_: ActionState, form: FormData) {
  return perform(async () => {
    const actor = await manager();
    const employeeId = id.parse(form.get("id"));
    const token = randomBytes(32).toString("hex");
    await db.$transaction(async (tx) => {
      const employee = await tx.employee.findUniqueOrThrow({
        where: { id: employeeId },
        include: { user: true },
      });
      if (!employee.user.active || !canManageRole(actor.role, employee.user.role))
        throw new Error("You cannot invite this account.");
      if (await tx.account.count({ where: { userId: employee.userId, providerId: "credential" } }))
        throw new Error(
          "This account is already activated. Use the documented administrator recovery procedure.",
        );
      await tx.invite.updateMany({
        where: { employeeId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.invite.create({
        data: {
          employeeId,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + 48 * 3600000),
        },
      });
      await tx.auditLog.create({
        data: { actorId: actor.id, action: "INVITE_CREATED", entityId: employeeId, details: {} },
      });
    });
    return {
      ok: true,
      message: "Share this one-time link privately. It expires in 48 hours.",
      invite: `${process.env.BETTER_AUTH_URL}/invite#${token}`,
    };
  });
}
export async function acceptInvite(_: ActionState, form: FormData) {
  return perform(async () => {
    const data = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(12).max(128) })
      .parse(fields(form));
    const tokenHash = createHash("sha256").update(data.token).digest("hex");
    // Validate high-entropy token before expensive hashing; invalid requests do not invoke scrypt.
    const found = await db.invite.findUnique({
      where: { tokenHash },
      include: { employee: { include: { user: true } } },
    });
    if (!found || found.usedAt || found.expiresAt < new Date() || !found.employee.user.active)
      throw new Error("Invite is invalid or expired.");
    const password = await hashPassword(data.password);
    await db.$transaction(async (tx) => {
      const used = await tx.invite.updateMany({
        where: {
          id: found.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
          employee: { user: { active: true } },
        },
        data: { usedAt: new Date() },
      });
      if (!used.count) throw new Error("Invite is invalid or expired.");
      await tx.account.create({
        data: {
          id: randomUUID(),
          userId: found.employee.userId,
          accountId: found.employee.userId,
          providerId: "credential",
          password,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: found.employee.userId,
          action: "INVITE_ACCEPTED",
          entityId: found.employeeId,
          details: {},
        },
      });
    });
    return { ok: true, message: "Account activated. You can now sign in." };
  });
}
export async function saveShift(_: ActionState, form: FormData) {
  return perform(async () => {
    const actor = await manager();
    const data = shiftInput.parse(fields(form));
    await db.$transaction(async (tx) => {
      const employee = await tx.employee.findUniqueOrThrow({
        where: { id: data.employeeId },
        include: { user: true },
      });
      if (!employee.user.active) throw new Error("Choose an active employee.");
      const shift = await tx.employeeSchedule.upsert({
        where: { employeeId_date: { employeeId: data.employeeId, date: data.date } },
        create: data,
        update: data,
      });
      await tx.auditLog.create({
        data: { actorId: actor.id, action: "SHIFT_SAVED", entityId: shift.id, details: data },
      });
    });
  });
}
export async function removeShift(_: ActionState, form: FormData) {
  return perform(async () => {
    const actor = await manager();
    const shiftId = id.parse(form.get("id"));
    await db.$transaction(async (tx) => {
      await tx.employeeSchedule.delete({ where: { id: shiftId } });
      await tx.auditLog.create({
        data: { actorId: actor.id, action: "SHIFT_REMOVED", entityId: shiftId, details: {} },
      });
    });
  });
}
export async function createTemplate(_: ActionState, form: FormData) {
  return perform(async () => {
    const actor = await manager();
    const data = templateInput.parse({
      ...fields(form),
      weekdays: form.getAll("weekdays"),
      reviewRequired: form.get("reviewRequired") === "on",
    });
    if (data.startDate < addDays(businessDate(), -31))
      throw new Error("Please choose a start date within the last 31 days or in the future.");
    const settings = await db.businessSetting.findUnique({ where: { id: "business" } });
    if (!settings?.configured)
      throw new Error("Configure business operating days in Settings first.");
    if (
      data.frequency === "WEEKLY" &&
      !data.weekdays.some((day) => settings.operatingDays.includes(day))
    )
      throw new Error("Choose at least one weekly day when the business is open.");
    if (data.frequency === "ONCE") {
      const closure = await db.closure.findUnique({ where: { date: data.startDate } });
      if (
        !occursOn(
          data,
          data.startDate,
          settings.operatingDays,
          new Set(closure ? [closure.date] : []),
        )
      )
        throw new Error("Choose an open business day for a one-time task.");
    }
    await db.$transaction(async (tx) => {
      const employee = await tx.employee.findUniqueOrThrow({
        where: { id: data.employeeId },
        include: { user: true },
      });
      if (!employee.user.active) throw new Error("Choose an active employee.");
      const template = await tx.taskTemplate.create({ data });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "TEMPLATE_CREATED",
          entityId: template.id,
          details: { frequency: data.frequency },
        },
      });
    });
    // Generation is independently retryable. A scheduler failure must not invite duplicate template submission.
    try {
      await runJobs();
    } catch {
      return {
        ok: true,
        message:
          "Template saved. Generation needs attention; retry Run operations check in Settings.",
      };
    }
  });
}
export async function pauseTemplate(_: ActionState, form: FormData) {
  return perform(async () => {
    const actor = await manager();
    const templateId = id.parse(form.get("id"));
    const active = form.get("active") === "true";
    await db.$transaction(async (tx) => {
      await tx.taskTemplate.update({ where: { id: templateId }, data: { active } });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "TEMPLATE_STATUS",
          entityId: templateId,
          details: { active },
        },
      });
    });
  });
}
export async function updateTask(_: ActionState, form: FormData) {
  return perform(async () => {
    await changeTask(await currentUser(), taskChange.parse(fields(form)));
  });
}
export async function reviewTask(_: ActionState, form: FormData) {
  return perform(async () => {
    const actor = await manager();
    const taskId = id.parse(form.get("taskId"));
    await db.$transaction(async (tx) => {
      const changed = await tx.taskInstance.updateMany({
        where: { id: taskId, status: "COMPLETED", reviewedAt: null },
        data: { reviewedAt: new Date(), reviewedBy: actor.id, version: { increment: 1 } },
      });
      if (!changed.count) throw new Error("This task is not awaiting review.");
      await tx.taskEvent.create({
        data: { taskId, actorId: actor.id, actorName: actor.name, action: "REVIEWED" },
      });
      await tx.auditLog.create({
        data: { actorId: actor.id, action: "TASK_REVIEWED", entityId: taskId, details: {} },
      });
    });
  });
}
export async function overrideTask(_: ActionState, form: FormData) {
  return perform(async () => {
    const actor = await manager();
    const data = z
      .object({
        taskId: id,
        employeeId: id,
        date: dateString,
        time: timeString,
        reason: note.min(5),
        version: z.coerce.number().int().min(0),
      })
      .parse(fields(form));
    await db.$transaction(async (tx) => {
      const employee = await tx.employee.findUniqueOrThrow({
        where: { id: data.employeeId },
        include: { user: true },
      });
      if (!employee.user.active) throw new Error("Choose an active employee.");
      const old = await tx.taskInstance.findUniqueOrThrow({ where: { id: data.taskId } });
      if (["COMPLETED", "CANCELLED"].includes(old.status))
        throw new Error("Please reopen the task before changing its assignment or deadline.");
      const updated = await tx.taskInstance.updateMany({
        where: { id: data.taskId, version: data.version },
        data: {
          employeeId: data.employeeId,
          dueAt: dueInstant(data.date, data.time),
          version: { increment: 1 },
        },
      });
      if (!updated.count) throw new Error("This task changed. Refresh and retry.");
      await tx.notification.updateMany({
        where: { taskId: data.taskId },
        data: { resolvedAt: new Date() },
      });
      await tx.taskEvent.create({
        data: {
          taskId: data.taskId,
          actorId: actor.id,
          actorName: actor.name,
          action: "OVERRIDE",
          note: data.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "TASK_OVERRIDE",
          entityId: data.taskId,
          details: {
            fromEmployee: old.employeeId,
            fromDue: old.dueAt.toISOString(),
            toEmployee: data.employeeId,
            toDue: dueInstant(data.date, data.time).toISOString(),
            reason: data.reason,
          },
        },
      });
    });
  });
}
export async function saveSettings(_: ActionState, form: FormData) {
  return perform(async () => {
    const actor = await manager();
    const operatingDays = days.min(1).parse(form.getAll("operatingDays"));
    await db.$transaction(async (tx) => {
      await tx.businessSetting.upsert({
        where: { id: "business" },
        create: { operatingDays, configured: true },
        update: { operatingDays, configured: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "BUSINESS_DAYS",
          entityId: "business",
          details: { operatingDays },
        },
      });
    });
  });
}
export async function saveClosure(_: ActionState, form: FormData) {
  return perform(async () => {
    const actor = await manager();
    const date = dateString.parse(form.get("date"));
    const reason = note.min(1).parse(form.get("reason"));
    await db.$transaction(async (tx) => {
      await tx.closure.upsert({ where: { date }, create: { date, reason }, update: { reason } });
      await tx.auditLog.create({
        data: { actorId: actor.id, action: "CLOSURE_SAVED", entityId: date, details: { reason } },
      });
    });
  });
}
export async function removeClosure(_: ActionState, form: FormData) {
  return perform(async () => {
    const actor = await manager();
    const date = dateString.parse(form.get("date"));
    await db.$transaction(async (tx) => {
      await tx.closure.delete({ where: { date } });
      await tx.auditLog.create({
        data: { actorId: actor.id, action: "CLOSURE_REMOVED", entityId: date, details: {} },
      });
    });
  });
}
export async function triggerJobs() {
  return perform(async () => {
    const actor = await manager();
    const result = await runJobs();
    await db.auditLog.create({
      data: {
        actorId: actor.id,
        action: "JOBS_TRIGGERED",
        entityId: result.runId,
        details: result,
      },
    });
    return {
      ok: true,
      message: `Operations checked. ${result.generated} new tasks and maintenance tickets generated.`,
    };
  });
}
export async function markRead(_: ActionState, form: FormData) {
  return perform(async () => {
    const user = await currentUser();
    await db.notification.updateMany({
      where: { id: id.parse(form.get("id")), userId: user.id },
      data: { readAt: new Date() },
    });
  });
}
export async function addTaskNote(_: ActionState, form: FormData) {
  return perform(async () => {
    const actor = await currentUser();
    const taskId = id.parse(form.get("taskId"));
    const message = note.min(1).parse(form.get("note"));
    await db.$transaction(async (tx) => {
      const task = await tx.taskInstance.findUniqueOrThrow({ where: { id: taskId } });
      if (
        !isManager(actor.role) &&
        (actor.role !== "EMPLOYEE" || task.employeeId !== actor.employee?.id)
      )
        throw new Error("Task access denied.");
      await tx.taskEvent.create({
        data: { taskId, actorId: actor.id, actorName: actor.name, action: "NOTE", note: message },
      });
      await tx.auditLog.create({
        data: { actorId: actor.id, action: "TASK_NOTE", entityId: taskId, details: {} },
      });
    });
  });
}
