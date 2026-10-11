import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { db } from "@/lib/db";
import { TIMEZONE, dueInstant } from "@/lib/time";
import { isManager } from "@/lib/policy";
import { audit, requireRule } from "@/modules/phase2";
import { automation } from "./transaction";

const alertChoices = [0, 5, 15, 60, 1440] as const;

async function requireActiveManager(actorId: string) {
  const actor = await db.user.findUnique({
    where: { id: actorId },
    select: { active: true, role: true },
  });
  requireRule(actor?.active && isManager(actor.role), "You do not have permission to view reminders.");
}

const localDateTime = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a date and time.").refine((value) => {
  try {
    Temporal.PlainDateTime.from(value);
    return true;
  } catch {
    return false;
  }
}, "Enter a valid date and time.");

export const reminderEventInput = z.object({
  title: z.string().trim().min(1, "Enter a reminder title.").max(160),
  description: z.string().trim().max(2000).optional().default(""),
  location: z.string().trim().max(160).optional().default(""),
  startsAt: localDateTime,
  alertMinutes: z.coerce.number().int().refine(
    (value) => alertChoices.includes(value as (typeof alertChoices)[number]),
    "Choose a valid alert time.",
  ),
});

function reminderTimes(startsAt: string, alertMinutes: number) {
  const [date, time] = startsAt.split("T");
  const start = dueInstant(date, time);
  requireRule(start.getTime() > Date.now(), "Choose a date and time in the future.");
  return {
    startsAt: start,
    alertAt: new Date(start.getTime() - alertMinutes * 60_000),
  };
}

export async function createPersonalReminder(actorId: string, raw: unknown) {
  const input = reminderEventInput.parse(raw);
  const times = reminderTimes(input.startsAt, input.alertMinutes);
  return automation(actorId, ["OWNER", "ADMIN"], async (tx) => {
    const saved = await tx.reminderEvent.create({
      data: { ...input, ...times, userId: actorId },
    });
    await audit(tx, actorId, "PERSONAL_REMINDER_CREATED", saved.id, {
      startsAt: saved.startsAt.toISOString(),
      alertAt: saved.alertAt.toISOString(),
      alertMinutes: saved.alertMinutes,
    });
    return saved;
  });
}

export async function updatePersonalReminder(actorId: string, raw: unknown) {
  const input = reminderEventInput.extend({ id: z.string().cuid() }).parse(raw);
  const times = reminderTimes(input.startsAt, input.alertMinutes);
  return automation(actorId, ["OWNER", "ADMIN"], async (tx) => {
    const before = await tx.reminderEvent.findFirst({
      where: { id: input.id, userId: actorId, completedAt: null, cancelledAt: null },
    });
    requireRule(before, "This reminder is no longer available to update.");
    const saved = await tx.reminderEvent.update({
      where: { id: input.id },
      data: {
        title: input.title,
        description: input.description,
        location: input.location,
        ...times,
        alertMinutes: input.alertMinutes,
        readAt: null,
      },
    });
    await audit(tx, actorId, "PERSONAL_REMINDER_UPDATED", saved.id, {
      startsAt: saved.startsAt.toISOString(),
      alertAt: saved.alertAt.toISOString(),
      alertMinutes: saved.alertMinutes,
    });
    return saved;
  });
}

export async function changePersonalReminderState(
  actorId: string,
  raw: unknown,
  state: "complete" | "cancel",
) {
  const { id } = z.object({ id: z.string().cuid() }).parse(raw);
  return automation(actorId, ["OWNER", "ADMIN"], async (tx) => {
    const before = await tx.reminderEvent.findFirst({
      where: { id, userId: actorId, completedAt: null, cancelledAt: null },
      select: { id: true, alertAt: true, startsAt: true },
    });
    requireRule(before, "This reminder is no longer open.");
    const now = new Date();
    if (state === "complete") {
      await tx.reminderEvent.update({ where: { id }, data: { completedAt: now } });
    } else {
      await tx.reminderEvent.update({ where: { id }, data: { cancelledAt: now } });
    }
    await audit(tx, actorId, state === "complete" ? "PERSONAL_REMINDER_COMPLETED" : "PERSONAL_REMINDER_CANCELLED", id, {
      startsAt: before.startsAt.toISOString(),
    });
  });
}

export async function acknowledgePersonalReminder(actorId: string, raw: unknown) {
  const { id } = z.object({ id: z.string().cuid() }).parse(raw);
  return automation(actorId, ["OWNER", "ADMIN"], async (tx) => {
    const reminder = await tx.reminderEvent.findFirst({
      where: {
        id,
        userId: actorId,
        completedAt: null,
        cancelledAt: null,
        readAt: null,
        alertAt: { lte: new Date() },
      },
      select: { id: true, startsAt: true },
    });
    requireRule(reminder, "This notification is no longer unread or does not belong to you.");
    await tx.reminderEvent.update({ where: { id }, data: { readAt: new Date() } });
    await audit(tx, actorId, "PERSONAL_REMINDER_ACKNOWLEDGED", id, {
      startsAt: reminder.startsAt.toISOString(),
    });
  });
}

export async function listPersonalReminders(actorId: string) {
  await requireActiveManager(actorId);
  const [upcoming, completed] = await Promise.all([
    db.reminderEvent.findMany({
      where: { userId: actorId, completedAt: null, cancelledAt: null },
      orderBy: { startsAt: "asc" },
      take: 100,
    }),
    db.reminderEvent.findMany({
      where: { userId: actorId, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      take: 25,
    }),
  ]);
  return { upcoming, completed, timeZone: TIMEZONE };
}

export async function personalNotificationInbox(actorId: string) {
  await requireActiveManager(actorId);
  const now = new Date();
  const [reminders, alerts, reminderCount, alertCount] = await Promise.all([
    db.reminderEvent.findMany({
      where: { userId: actorId, alertAt: { lte: now }, readAt: null, completedAt: null, cancelledAt: null },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: 5,
      select: { id: true, title: true, startsAt: true, description: true },
    }),
    db.notification.findMany({
      where: { userId: actorId, resolvedAt: null, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, createdAt: true, taskId: true, maintenanceId: true },
    }),
    db.reminderEvent.count({
      where: { userId: actorId, alertAt: { lte: now }, readAt: null, completedAt: null, cancelledAt: null },
    }),
    db.notification.count({ where: { userId: actorId, resolvedAt: null, readAt: null } }),
  ]);
  const items = [
    ...reminders.map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.description,
      timestamp: item.startsAt,
      href: `/reminders#${item.id}`,
    })),
    ...alerts.map((item) => ({
      id: item.id,
      title: item.title,
      detail: "Action required",
      timestamp: item.createdAt,
      href: item.taskId ? `/tasks/${item.taskId}` : item.maintenanceId ? `/maintenance/${item.maintenanceId}` : "/notifications",
    })),
  ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()).slice(0, 5);
  return { count: reminderCount + alertCount, items, timeZone: TIMEZONE };
}
