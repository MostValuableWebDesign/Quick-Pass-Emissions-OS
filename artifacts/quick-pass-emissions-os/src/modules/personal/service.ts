import { Prisma } from "@prisma/client";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/db";
import { businessDate } from "@/lib/time";
import { buildPersonalSummary, closedSummaryPeriods } from "./rules";
import type { PersonalWorkspaceData } from "./types";
import { readExpenses } from "./expense-service";
import { buildSpendingReport, spendingText } from "./expense-rules";
import { clarification, polishSource } from "./polish-rules";
import { saveReviewedWorkSummary } from "./work-summary-service";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    try {
      return Temporal.PlainDate.from(v).toString() === v;
    } catch {
      return false;
    }
  }, "Choose a valid calendar date.");
const identity = { id: z.string().min(1).max(160), version: z.number().int().positive() };
const title = z.string().trim().max(500);
const checklistItem = z.object({
  id: z.string().min(1).max(160),
  text: z.string().max(2000),
  checked: z.boolean(),
});
const priority = z.enum(["HIGH", "MEDIUM", "LOW"]);
const commands = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("note.summary.save"),
    ...identity,
    text: z.string().trim().min(1).max(12000),
    answers: z.array(clarification).max(8),
  }),
  z.object({ op: z.literal("note.create"), id: identity.id, title: title.optional() }),
  z.object({
    op: z.literal("note.save"),
    ...identity,
    title,
    body: z.string().max(200000),
    checklist: z.array(checklistItem).max(500),
    folderId: z.string().nullable(),
    pinned: z.boolean(),
  }),
  z.object({ op: z.literal("note.archive"), ...identity, archived: z.boolean() }),
  z.object({ op: z.literal("note.delete"), ...identity }),
  z.object({ op: z.literal("note.restore"), ...identity }),
  z.object({ op: z.literal("folder.create"), name: z.string().trim().min(1).max(100) }),
  z.object({
    op: z.literal("task.create"),
    id: identity.id,
    title: title.min(1),
    description: z.string().max(20000).optional(),
    dueDate: date.nullable().optional(),
    priority: priority.optional(),
  }),
  z.object({ op: z.literal("task.convert"), noteId: identity.id, itemId: identity.id.optional() }),
  z.object({
    op: z.literal("task.save"),
    ...identity,
    title: title.min(1),
    description: z.string().max(20000),
    dueDate: date.nullable(),
    priority,
    status: z.enum(["TODO", "IN_PROGRESS", "COMPLETED"]),
    completionNote: z.string().max(20000),
  }),
  z.object({ op: z.literal("summary.generate"), startDate: date, endDate: date }),
  z.object({ op: z.literal("schedule.save"), firstDate: date, enabled: z.boolean() }),
]);
type Tx = Prisma.TransactionClient;
async function authorize(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { active: true, role: true },
  });
  if (!user?.active || !["OWNER", "ADMIN"].includes(user.role)) throw new Error("Access denied.");
}
const conflict = () => {
  throw new Error(
    "This item changed in another session. Your edits were not saved. Reload the latest version before retrying.",
  );
};

export async function personalWorkspace(userId: string): Promise<PersonalWorkspaceData> {
  await authorize(db, userId);
  const [folders, notes, tasks, summaries, schedule, runner] = await Promise.all([
    db.personalFolder.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    db.personalNote.findMany({
      where: { userId },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    }),
    db.personalTask.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }),
    db.personalSummary.findMany({ where: { userId }, orderBy: { endDate: "desc" } }),
    db.personalSummarySchedule.findUnique({ where: { userId } }),
    db.personalSummaryRunner.findUnique({ where: { id: "personal" } }),
  ]);
  return JSON.parse(
    JSON.stringify({
      folders,
      notes: notes.map((note) => ({
        ...note,
        polishedCurrent: !!note.polishedSummary && note.polishedSource === polishSource(note),
      })),
      tasks,
      summaries,
      schedule,
      today: businessDate(),
      runner: {
        lastRunAt: runner?.lastRunAt ?? null,
        healthy: !!runner && Date.now() - runner.lastRunAt.getTime() < 15 * 60 * 1000,
      },
    }),
  ) as PersonalWorkspaceData;
}

async function makeSummary(
  tx: Tx,
  userId: string,
  startDate: string,
  endDate: string,
  refresh = false,
) {
  if (endDate < startDate) throw new Error("The end date must be on or after the start date.");
  if (endDate > businessDate()) throw new Error("Summaries cannot include future dates.");
  const existing = await tx.personalSummary.findUnique({
    where: { userId_startDate_endDate: { userId, startDate, endDate } },
  });
  // Finalize a snapshot made during its last reporting day once the full day has closed.
  if (existing && !refresh && businessDate(existing.createdAt) > endDate) return existing;
  const tasks = await tx.personalTask.findMany({
    where: { userId },
    include: {
      events: { orderBy: { occurredAt: "asc" } },
      note: { select: { userId: true, polishedSummary: true } },
    },
  });
  const snapshot = buildPersonalSummary(
    tasks.map((task) => ({
      ...task,
      approvedWorkSummary:
        task.note?.userId === userId && task.sourceKey === `note:${task.noteId}`
          ? task.note.polishedSummary
          : "",
    })),
    startDate,
    endDate,
  );
  snapshot.spending = buildSpendingReport(await readExpenses(tx, userId), startDate, endDate);
  snapshot.text += `\n\n${spendingText(snapshot.spending)}`;
  if (existing)
    return tx.personalSummary.update({
      where: { id: existing.id },
      data: { snapshot: snapshot as unknown as Prisma.InputJsonValue, createdAt: new Date() },
    });
  return tx.personalSummary.create({
    data: { userId, startDate, endDate, snapshot: snapshot as unknown as Prisma.InputJsonValue },
  });
}

export async function mutatePersonalWorkspace(userId: string, input: unknown) {
  const command = commands.parse(input);
  await db.$transaction(
    async (tx) => {
      // Personal writers serialize per account, never blocking unrelated page reads/business writes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`personal:${userId}`}, 0))`;
      await authorize(tx, userId);
      switch (command.op) {
        case "note.summary.save":
          await saveReviewedWorkSummary(tx, userId, command);
          break;
        case "folder.create":
          await tx.personalFolder.upsert({
            where: { userId_name: { userId, name: command.name } },
            create: { userId, name: command.name },
            update: {},
          });
          break;
        case "note.create": {
          const existing = await tx.personalNote.findUnique({ where: { id: command.id } });
          if (existing && existing.userId !== userId) throw new Error("Note unavailable.");
          if (!existing)
            await tx.personalNote.create({
              data: { id: command.id, userId, title: command.title ?? "" },
            });
          break;
        }
        case "note.save": {
          if (
            command.folderId &&
            !(await tx.personalFolder.findFirst({ where: { id: command.folderId, userId } }))
          )
            throw new Error("Folder unavailable.");
          if (new Set(command.checklist.map((i) => i.id)).size !== command.checklist.length)
            throw new Error("Checklist items must have unique IDs.");
          const { op, id, version, ...data } = command;
          void op;
          const updated = await tx.personalNote.updateMany({
            where: { id, userId, version, deletedAt: null },
            data: { ...data, version: { increment: 1 } },
          });
          if (!updated.count) conflict();
          break;
        }
        case "note.archive":
        case "note.delete":
        case "note.restore": {
          const data =
            command.op === "note.archive"
              ? { archivedAt: command.archived ? new Date() : null }
              : command.op === "note.delete"
                ? { deletedAt: new Date() }
                : { deletedAt: null };
          const updated = await tx.personalNote.updateMany({
            where: { id: command.id, userId, version: command.version },
            data: { ...data, version: { increment: 1 } },
          });
          if (!updated.count) conflict();
          break;
        }
        case "task.create": {
          const sourceKey = `standalone:${command.id}`;
          await tx.personalTask.upsert({
            where: { userId_sourceKey: { userId, sourceKey } },
            update: {},
            create: {
              id: command.id,
              userId,
              sourceKey,
              title: command.title,
              description: command.description ?? "",
              priority: command.priority ?? "MEDIUM",
              dueDate: command.dueDate ?? null,
              events: {
                create: {
                  kind: "TODO",
                  title: command.title,
                  priority: command.priority ?? "MEDIUM",
                  dueDate: command.dueDate ?? null,
                },
              },
            },
          });
          break;
        }
        case "task.convert": {
          const note = await tx.personalNote.findFirst({
            where: { id: command.noteId, userId, deletedAt: null },
          });
          if (!note) throw new Error("Note unavailable.");
          const items = z.array(checklistItem).parse(note.checklist);
          const item = command.itemId ? items.find((i) => i.id === command.itemId) : null;
          if (command.itemId && !item) throw new Error("Checklist item unavailable.");
          const taskTitle = (item?.text || note.title || note.body.slice(0, 160)).trim();
          if (!taskTitle) throw new Error("Add some text before creating a task.");
          const sourceKey = command.itemId
            ? `item:${note.id}:${command.itemId}`
            : `note:${note.id}`;
          await tx.personalTask.upsert({
            where: { userId_sourceKey: { userId, sourceKey } },
            update: {},
            create: {
              userId,
              sourceKey,
              noteId: note.id,
              title: taskTitle.slice(0, 500),
              description: item ? "" : (note.polishedSummary || note.body).slice(0, 20000),
              events: { create: { kind: "TODO", title: taskTitle.slice(0, 500) } },
            },
          });
          break;
        }
        case "task.save": {
          const previous = await tx.personalTask.findFirst({
            where: { id: command.id, userId, version: command.version },
          });
          if (!previous) conflict();
          const { op, id, version, ...data } = command;
          void op;
          const completedAt =
            command.status === "COMPLETED" ? (previous!.completedAt ?? new Date()) : null;
          if (
            command.status === "COMPLETED" &&
            !data.completionNote.trim() &&
            previous?.noteId &&
            previous.sourceKey === `note:${previous.noteId}`
          ) {
            const note = await tx.personalNote.findFirst({
              where: { id: previous.noteId, userId },
              select: { polishedSummary: true },
            });
            data.completionNote = note?.polishedSummary || "";
          }
          const updated = await tx.personalTask.updateMany({
            where: { id, userId, version },
            data: { ...data, completedAt, version: { increment: 1 } },
          });
          if (!updated.count) conflict();
          {
            const kind =
              previous!.status === command.status
                ? "UPDATED"
                : previous!.status === "COMPLETED"
                  ? "REOPENED"
                  : command.status;
            await tx.personalTaskEvent.create({
              data: {
                taskId: id,
                kind,
                title: command.title,
                completionNote: data.completionNote,
                status: command.status,
                priority: command.priority,
                dueDate: command.dueDate,
                completedAt,
              },
            });
          }
          break;
        }
        case "summary.generate":
          await makeSummary(tx, userId, command.startDate, command.endDate, true);
          break;
        case "schedule.save": {
          const existing = await tx.personalSummarySchedule.findUnique({ where: { userId } });
          await tx.personalSummarySchedule.upsert({
            where: { userId },
            create: {
              userId,
              firstDate: command.firstDate,
              nextDate: command.firstDate,
              enabled: command.enabled,
            },
            update: {
              firstDate: command.firstDate,
              enabled: command.enabled,
              ...(existing?.firstDate !== command.firstDate ? { nextDate: command.firstDate } : {}),
            },
          });
          break;
        }
      }
    },
    { timeout: 20000 },
  );
  return personalWorkspace(userId);
}

/** Called only by the independent authenticated jobs runner, never by page reads. */
export async function runPersonalSummaries(now = new Date()) {
  const schedules = await db.personalSummarySchedule.findMany({
    where: { enabled: true, user: { active: true, role: { in: ["OWNER", "ADMIN"] } } },
  });
  let generated = 0;
  for (const schedule of schedules) {
    generated += await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`personal:${schedule.userId}`}, 0))`;
        await authorize(tx, schedule.userId);
        const current = await tx.personalSummarySchedule.findUniqueOrThrow({
          where: { userId: schedule.userId },
        });
        if (!current.enabled) return 0;
        const { periods, nextDate } = closedSummaryPeriods(current.nextDate, businessDate(now));
        for (const period of periods)
          await makeSummary(tx, schedule.userId, period.startDate, period.endDate);
        await tx.personalSummarySchedule.update({
          where: { userId: schedule.userId },
          data: { nextDate, lastRunAt: now },
        });
        return periods.length;
      },
      { timeout: 60000 },
    );
  }
  await db.personalSummaryRunner.upsert({
    where: { id: "personal" },
    create: { id: "personal", lastRunAt: now },
    update: { lastRunAt: now },
  });
  return { generated };
}
