"use server";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser, manager } from "@/lib/access";
import { canManageRole, isManager } from "@/lib/policy";
import { revokeStaffCodes } from "@/modules/security/service";
import { savedContactAddress } from "@/lib/address-provenance";
import { contactEmployeeInput } from "@/lib/contact-address";
import { businessHoursFromForm } from "@/lib/business-hours";
import {
  dateString,
  days,
  fields,
  id,
  note,
  shiftInput,
  templateInput,
  timeString,
} from "@/lib/validation";
import { dueInstant, businessDate, addDays } from "@/lib/time";
import { changeTask, taskChange } from "@/modules/tasks/service";
import { managerTransaction, reviewResponsibility } from "@/modules/manager/service";
import { runJobs } from "@/modules/tasks/jobs";
import { occursOn } from "@/modules/tasks/recurrence";
import { BusinessError } from "@/modules/phase2";
import type { Prisma } from "@prisma/client";
export type ActionState = { ok?: boolean; message?: string; invite?: string };
export async function saveOwnAccount(_: ActionState, form: FormData) {
  return perform(async () => {
    const actor = await manager();
    const data = z
      .object({
        name: z.string().trim().min(1).max(160),
        phone: z.string().trim().max(50),
      })
      .parse(fields(form));
    await db.$transaction(async (tx) => {
      const current = await personnelActor(tx, actor.id);
      if (current.role !== actor.role)
        throw new Error("Your access changed. Refresh and try again.");
      const employee = await tx.employee.findUnique({
        where: { userId: actor.id },
        select: { id: true },
      });
      await tx.user.update({
        where: { id: actor.id },
        data: { name: data.name, phone: data.phone },
      });
      if (employee)
        await tx.employee.update({
          where: { id: employee.id },
          data: { phone: data.phone },
        });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "ACCOUNT_PROFILE_UPDATED",
          entityId: actor.id,
          details: { changedFields: ["name", "phone"] },
        },
      });
    }, personnelOptions);
  });
}
export async function createManagerAccount(_: ActionState, form: FormData) {
  return perform(async () => {
    const actor = await manager();
    if (actor.role !== "OWNER") throw new Error("Only an owner may add user accounts.");
    const data = z
      .object({
        name: z.string().trim().min(1).max(160),
        email: z
          .string()
          .trim()
          .email()
          .max(254)
          .transform((value) => value.toLowerCase()),
        phone: z.string().trim().max(50),
        role: z.enum(["OWNER", "ADMIN"]),
      })
      .parse(fields(form));
    const token = randomBytes(32).toString("hex");
    await db.$transaction(async (tx) => {
      const current = await personnelActor(tx, actor.id);
      if (current.role !== "OWNER") throw new Error("Only an owner may add user accounts.");
      const existing = await tx.user.findFirst({
        where: { email: { equals: data.email, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) throw new Error("This email address is already in use.");
      const employee = await tx.employee.create({
        data: {
          phone: data.phone,
          user: {
            create: {
              name: data.name,
              email: data.email,
              phone: data.phone,
              role: data.role,
              emailVerified: false,
            },
          },
          invites: {
            create: {
              tokenHash: createHash("sha256").update(token).digest("hex"),
              expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
            },
          },
        },
        select: { id: true, userId: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "MANAGEMENT_ACCOUNT_CREATED",
          entityId: employee.userId,
          details: { employeeId: employee.id, role: data.role, inviteExpiresInHours: 48 },
        },
      });
    }, personnelOptions);
    revalidatePath("/employees");
    return {
      ok: true,
      message: `The ${data.role === "OWNER" ? "owner" : "manager"} account was added. Share the private, one-time invitation link.`,
      invite: `/invite#${token}`,
    };
  });
}
const personnelOptions = {
  isolationLevel: "ReadCommitted",
  maxWait: 10000,
  timeout: 30000,
} as const;
async function personnelActor(tx: Prisma.TransactionClient, actorId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
  const actor = await tx.user.findUnique({ where: { id: actorId } });
  if (!actor?.active || !isManager(actor.role))
    throw new Error("You do not have permission for this action.");
  return actor;
}
async function perform(work: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    const result = await work();
    revalidatePath("/", "layout");
    return result ?? { ok: true, message: "Saved successfully." };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { ok: false, message: error.issues[0]?.message || "Check your entries." };
    if (error instanceof BusinessError) return { ok: false, message: error.message };
    // Never return database/constraint details, tokens, or stack traces to the browser.
    if (
      error instanceof Error &&
      !error.message.includes("prisma") &&
      !error.message.includes("Invalid `") &&
      !error.message.includes("NEXT_") &&
      !error.message.includes("Unique constraint")
    ) {
      const safe =
        /^(Please|This|Task|You |Only|Choose|Configure|Cannot|Invite|A task|Shift|Enter)/;
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
    const identity = await manager();
    const data = contactEmployeeInput.parse(fields(form));
    const employeeId = form.get("id")?.toString();
    await db.$transaction(async (tx) => {
      const actor = await personnelActor(tx, identity.id);
      const { name, addressProof: proof, ...profile } = data;
      const normalizedName = name.trim().replace(/\s+/g, " ").toLowerCase();
      const existingEmployees = await tx.employee.findMany({
        select: { id: true, user: { select: { name: true, active: true } } },
      });
      const duplicate = existingEmployees.find(
        (employee) =>
          employee.id !== employeeId &&
          employee.user.name.trim().replace(/\s+/g, " ").toLowerCase() === normalizedName,
      );
      if (duplicate) {
        const location = duplicate.user.active ? "Active staff" : "Removed staff";
        throw new Error(
          `Please check ${location}; an employee with this name already exists. Update that record or restore it instead of creating a duplicate.`,
        );
      }
      if (employeeId) {
        const old = await tx.employee.findUniqueOrThrow({
          where: { id: employeeId },
          include: { user: true },
        });
        if (!canManageRole(actor.role, old.user.role))
          throw new Error("Only the owner may manage privileged accounts.");
        await tx.employee.update({
          where: { id: employeeId },
          data: { ...profile, ...savedContactAddress({ ...profile, addressProof: proof }, old) },
        });
        // Contact edits never change login identity, management access, or linked history.
        await tx.user.update({ where: { id: old.userId }, data: { name } });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "EMPLOYEE_UPDATED",
            entityId: employeeId,
            details: { role: old.user.role },
          },
        });
      } else {
        const employee = await tx.employee.create({
          data: {
            ...profile,
            ...savedContactAddress({ ...profile, addressProof: proof }),
            user: {
              create: {
                name,
                email: `staff-${randomUUID()}@staff.quickpass.invalid`,
                role: "EMPLOYEE",
              },
            },
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "EMPLOYEE_CREATED",
            entityId: employee.id,
            details: { role: "EMPLOYEE" },
          },
        });
      }
    }, personnelOptions);
  });
}
export async function setEmployeeActive(_: ActionState, form: FormData) {
  return perform(async () => {
    const identity = await manager();
    const employeeId = id.parse(form.get("id"));
    const active = form.get("active") === "true";
    await db.$transaction(async (tx) => {
      const actor = await personnelActor(tx, identity.id);
      const employee = await tx.employee.findUniqueOrThrow({
        where: { id: employeeId },
        include: { user: true },
      });
      if (employee.userId === actor.id) throw new Error("You cannot deactivate your own account.");
      if (!canManageRole(actor.role, employee.user.role))
        throw new Error("Only the owner may manage privileged accounts.");
      await tx.user.update({ where: { id: employee.userId }, data: { active } });
      if (!active) await revokeStaffCodes(tx, employeeId, actor.id);
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
    }, personnelOptions);
  });
}
export async function issueInvite(_: ActionState, form: FormData) {
  return perform(async () => {
    const identity = await manager();
    const employeeId = id.parse(form.get("id"));
    const token = randomBytes(32).toString("hex");
    await db.$transaction(async (tx) => {
      const actor = await personnelActor(tx, identity.id);
      const employee = await tx.employee.findUniqueOrThrow({
        where: { id: employeeId },
        include: { user: true },
      });
      if (
        !employee.user.active ||
        !isManager(employee.user.role) ||
        !canManageRole(actor.role, employee.user.role)
      )
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
    }, personnelOptions);
    return {
      ok: true,
      message: "Share this one-time link privately. It expires in 48 hours.",
      invite: `/invite#${token}`,
    };
  });
}
export async function setManagerAccountActive(_: ActionState, form: FormData) {
  return perform(async () => {
    const actor = await manager();
    if (actor.role !== "OWNER") throw new Error("Only an owner may change user account access.");
    const data = z
      .object({
        id: id,
        active: z.enum(["true", "false"]).transform((value) => value === "true"),
      })
      .parse(fields(form));
    await db.$transaction(async (tx) => {
      const current = await personnelActor(tx, actor.id);
      if (current.role !== "OWNER")
        throw new Error("Only an owner may change user account access.");
      const target = await tx.user.findUniqueOrThrow({
        where: { id: data.id },
        include: { employee: { select: { id: true } } },
      });
      if (target.id === actor.id) throw new Error("You cannot deactivate your own account.");
      if (!isManager(target.role))
        throw new Error("Only owner and manager accounts can be changed here.");
      await tx.user.update({ where: { id: target.id }, data: { active: data.active } });
      await tx.session.deleteMany({ where: { userId: target.id } });
      if (target.employee)
        await tx.invite.updateMany({
          where: { employeeId: target.employee.id, usedAt: null },
          data: { usedAt: new Date() },
        });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "MANAGEMENT_ACCOUNT_STATUS",
          entityId: target.id,
          details: { active: data.active },
        },
      });
    }, personnelOptions);
  });
}
export async function issueManagerAccountInvite(_: ActionState, form: FormData) {
  return perform(async () => {
    const actor = await manager();
    if (actor.role !== "OWNER") throw new Error("Only an owner may invite user accounts.");
    const userId = id.parse(form.get("id"));
    const token = randomBytes(32).toString("hex");
    await db.$transaction(async (tx) => {
      const current = await personnelActor(tx, actor.id);
      if (current.role !== "OWNER") throw new Error("Only an owner may invite user accounts.");
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: { employee: { select: { id: true, phone: true } } },
      });
      if (!user.active || !isManager(user.role) || user.id === actor.id)
        throw new Error("You cannot invite this account.");
      if (await tx.account.count({ where: { userId, providerId: "credential" } }))
        throw new Error(
          "This account is already activated. Use the documented recovery procedure.",
        );
      const employee =
        user.employee ??
        (await tx.employee.create({
          data: {
            userId,
            phone: user.phone,
            jobRole: "",
          },
          select: { id: true },
        }));
      await tx.invite.updateMany({
        where: { employeeId: employee.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.invite.create({
        data: {
          employeeId: employee.id,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "INVITE_CREATED",
          entityId: employee.id,
          details: { role: user.role, expiresInHours: 48 },
        },
      });
    }, personnelOptions);
    return {
      ok: true,
      message: "Share this one-time link privately. It expires in 48 hours.",
      invite: `/invite#${token}`,
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
    if (
      !found ||
      found.usedAt ||
      found.expiresAt < new Date() ||
      !found.employee.user.active ||
      !isManager(found.employee.user.role)
    )
      throw new Error("Invite is invalid or expired.");
    const password = await hashPassword(data.password);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
      const used = await tx.invite.updateMany({
        where: {
          id: found.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
          employee: { user: { active: true, role: { in: ["OWNER", "ADMIN"] } } },
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
    }, personnelOptions);
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
    await managerTransaction(actor.id, async (tx) => {
      const before = await tx.taskTemplate.findUniqueOrThrow({ where: { id: templateId } });
      if (before.version !== Number(form.get("version")))
        throw new Error("This duty changed. Refresh.");
      await tx.taskTemplate.update({
        where: { id: templateId },
        data: {
          active,
          version: { increment: 1 },
          ...(active && before.managerTask
            ? { generatedThrough: addDays(businessDate(), -1) }
            : {}),
        },
      });
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
    await reviewResponsibility(actor.id, fields(form));
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
    await managerTransaction(actor.id, async (tx) => {
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
    const operatingHours = businessHoursFromForm(form);
    await db.$transaction(async (tx) => {
      await tx.businessSetting.upsert({
        where: { id: "business" },
        create: { operatingDays, operatingHours, configured: true },
        update: { operatingDays, operatingHours, configured: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "BUSINESS_DAYS",
          entityId: "business",
          details: { operatingDays, operatingHours },
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
    await managerTransaction(actor.id, async (tx) => {
      await tx.taskInstance.findUniqueOrThrow({ where: { id: taskId } });
      await tx.taskEvent.create({
        data: { taskId, actorId: actor.id, actorName: actor.name, action: "NOTE", note: message },
      });
      await tx.auditLog.create({
        data: { actorId: actor.id, action: "TASK_NOTE", entityId: taskId, details: {} },
      });
    });
  });
}
