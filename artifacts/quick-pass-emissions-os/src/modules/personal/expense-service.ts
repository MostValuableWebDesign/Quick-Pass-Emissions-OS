import { Prisma } from "@prisma/client";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/db";
import { businessDate } from "@/lib/time";
import { expenseMissing, expenseTotals, type ExpenseLedgerEntry } from "./expense-rules";
import type { ExpenseView, ExpenseWorkspaceData } from "./expense-types";

type Tx = Prisma.TransactionClient;
export const expenseDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    try {
      return Temporal.PlainDate.from(v).toString() === v;
    } catch {
      return false;
    }
  }, "Choose a valid date.");
const id = z.string().min(1).max(160),
  version = z.number().int().positive();
const amount = z.number().int().min(0).max(1_000_000_000);
const fields = {
  title: z.string().trim().min(1).max(500),
  amountCents: amount.nullable().default(null),
  vendor: z.string().trim().max(500).default(""),
  date: expenseDate,
  category: z.string().trim().min(1).max(100).default("Uncategorized"),
  purpose: z.string().trim().max(10000).default(""),
  paymentMethod: z.string().trim().max(100).default(""),
  planned: z.boolean().default(true),
};
const entryFields = {
  expenseId: id,
  version,
  id,
  kind: z.enum(["PAYMENT", "REFUND", "REIMBURSEMENT", "REIMBURSEMENT_RETURN"]),
  amountCents: amount.refine((n) => n > 0, "Enter an amount greater than zero."),
  date: expenseDate,
  fundingSource: z.enum(["BUSINESS", "PERSONAL"]).default("BUSINESS"),
  paymentMethod: z.string().trim().max(100).default(""),
  note: z.string().trim().max(5000).default(""),
};
const commands = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("expense.create"),
    id,
    ...fields,
    noteId: id.optional(),
    taskId: id.optional(),
    allowDuplicate: z.boolean().optional(),
  }),
  z.object({ op: z.literal("expense.save"), id, version, ...fields }),
  z.object({ op: z.literal("expense.archive"), id, version, archived: z.boolean() }),
  z.object({
    op: z.literal("expense.link"),
    id,
    version,
    noteId: id.optional(),
    taskId: id.optional(),
  }),
  z.object({ op: z.literal("expense.unlink"), id, version, linkId: id }),
  z.object({ op: z.literal("entry.add"), ...entryFields }),
  z.object({
    op: z.literal("entry.correct"),
    ...entryFields,
    entryId: id,
    reason: z.string().trim().min(1).max(2000),
  }),
  z.object({
    op: z.literal("entry.void"),
    expenseId: id,
    version,
    entryId: id,
    reason: z.string().trim().min(1).max(2000),
  }),
]);
export async function expenseAuthorize(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { active: true, role: true },
  });
  if (!user?.active || !["OWNER", "ADMIN"].includes(user.role)) throw new Error("Access denied.");
}
export async function expenseLock(tx: Tx, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`personal:${userId}`}, 0))`;
  await expenseAuthorize(tx, userId);
}
export async function ownedExpense(tx: Tx, userId: string, expenseId: string) {
  const e = await tx.personalExpense.findFirst({
    where: { id: expenseId, userId },
    include: { entries: true },
  });
  if (!e) throw new Error("Expense unavailable.");
  return e;
}
export function expenseVersion(actual: number, expected: number) {
  if (actual !== expected)
    throw new Error(
      "This expense changed in another session. Reload before saving; your changes have not been saved.",
    );
}
export async function readExpenses(tx: Tx, userId: string): Promise<ExpenseView[]> {
  const records = await tx.personalExpense.findMany({
    where: { userId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      entries: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
      links: true,
      attachments: {
        where: { uploadedAt: { not: null } },
        select: { id: true, filename: true, mimeType: true, byteSize: true, uploadedAt: true },
      },
      history: { orderBy: { createdAt: "desc" } },
    },
  });
  return JSON.parse(
    JSON.stringify(
      records.map((e) => ({
        ...e,
        totals: expenseTotals(e, e.entries),
        missing: expenseMissing(e, e.attachments.length, e.entries),
      })),
    ),
  ) as ExpenseView[];
}
export async function expenseWorkspace(userId: string): Promise<ExpenseWorkspaceData> {
  await expenseAuthorize(db, userId);
  const [expenses, notes, tasks] = await Promise.all([
    readExpenses(db, userId),
    db.personalNote.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, title: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.personalTask.findMany({
      where: { userId },
      select: { id: true, title: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return { expenses, notes, tasks, today: businessDate() };
}
async function link(tx: Tx, userId: string, expenseId: string, noteId?: string, taskId?: string) {
  if (Boolean(noteId) === Boolean(taskId)) throw new Error("Choose one related note or task.");
  if (
    noteId &&
    !(await tx.personalNote.findFirst({ where: { id: noteId, userId, deletedAt: null } }))
  )
    throw new Error("Note unavailable.");
  if (taskId && !(await tx.personalTask.findFirst({ where: { id: taskId, userId } })))
    throw new Error("Task unavailable.");
  const sourceKey = noteId ? `note:${noteId}` : `task:${taskId}`;
  await tx.personalExpenseLink.upsert({
    where: { expenseId_sourceKey: { expenseId, sourceKey } },
    create: { expenseId, sourceKey, noteId, taskId },
    update: {},
  });
}
export async function expenseHistory(
  tx: Tx,
  expenseId: string,
  action: string,
  detail: string,
  snapshot: unknown,
) {
  await tx.personalExpenseHistory.create({
    data: {
      expenseId,
      action,
      detail,
      snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
    },
  });
}
/** Validate both totals and date order, including backdated corrections. Refunds never create a new vendor debt. */
export function validateExpenseLedger(
  total: number | null,
  entries: (ExpenseLedgerEntry & { date: string })[],
) {
  let paid = 0,
    businessPaid = 0,
    personalPaid = 0,
    businessRefunds = 0,
    personalRefunds = 0,
    reimbursed = 0;
  const active = entries.filter((e) => !e.voidedAt);
  const dates = [...new Set(active.map((e) => e.date))].sort();
  for (const date of dates) {
    for (const e of active.filter((e) => e.date === date)) {
      if (e.kind === "PAYMENT") {
        paid += e.amountCents;
        if (e.fundingSource === "PERSONAL") personalPaid += e.amountCents;
        else businessPaid += e.amountCents;
      } else if (e.kind === "REFUND") {
        if (e.fundingSource === "PERSONAL") personalRefunds += e.amountCents;
        else businessRefunds += e.amountCents;
      } else if (e.kind === "REIMBURSEMENT") {
        reimbursed += e.amountCents;
      } else {
        reimbursed -= e.amountCents;
      }
    }
    if (personalRefunds > personalPaid || businessRefunds > businessPaid)
      throw new Error("A refund cannot exceed payments from that funding source on its date.");
    if (reimbursed < 0)
      throw new Error("A reimbursement return cannot exceed recorded reimbursements.");
    if (reimbursed > personalPaid)
      throw new Error("Reimbursement exceeds personally funded purchases available on its date.");
    if (paid > 0 && (total === null || paid > total))
      throw new Error("Set the purchase amount first. Payments cannot exceed the purchase amount.");
  }
}
export async function mutateExpenseWorkspace(userId: string, input: unknown) {
  const c = commands.parse(input);
  let expenseId: string | undefined, duplicateOf: string | undefined;
  await db.$transaction(
    async (tx) => {
      await expenseLock(tx, userId);
      if (c.op === "expense.create") {
        const existing = await tx.personalExpense.findUnique({ where: { id: c.id } });
        if (existing) {
          if (existing.userId !== userId) throw new Error("Expense unavailable.");
          expenseId = existing.id;
          return;
        }
        if (!c.allowDuplicate) {
          const match = await tx.personalExpense.findFirst({
            where: {
              userId,
              vendor: { equals: c.vendor, mode: "insensitive" },
              date: c.date,
              amountCents: c.amountCents,
              ...(!c.vendor ? { title: { equals: c.title, mode: "insensitive" } } : {}),
            },
          });
          if (match) {
            duplicateOf = match.id;
            return;
          }
        }
        const { title, amountCents, vendor, date, category, purpose, paymentMethod, planned } = c;
        const record = await tx.personalExpense.create({
          data: {
            id: c.id,
            userId,
            title,
            amountCents,
            vendor,
            date,
            category,
            purpose,
            paymentMethod,
            planned,
          },
        });
        if (c.noteId || c.taskId) await link(tx, userId, c.id, c.noteId, c.taskId);
        await expenseHistory(tx, c.id, "Created", "", record);
        expenseId = c.id;
        return;
      }
      const targetId = "expenseId" in c ? c.expenseId : c.id;
      const e = await ownedExpense(tx, userId, targetId);
      expenseId = e.id;
      // A retried transaction must not create another payment, even if the prior save advanced the version.
      if (c.op === "entry.add" || c.op === "entry.correct") {
        const previous = await tx.personalExpenseEntry.findUnique({ where: { id: c.id } });
        if (previous) {
          if (previous.expenseId !== e.id) throw new Error("Entry unavailable.");
          return;
        }
      }
      expenseVersion(e.version, c.version);
      let patch: Prisma.PersonalExpenseUpdateInput = { version: { increment: 1 } };
      if (c.op === "expense.save") {
        validateExpenseLedger(c.amountCents, e.entries);
        if (c.planned && e.entries.some((t) => !t.voidedAt))
          throw new Error("An expense with recorded money movements cannot be marked planned.");
        const { title, amountCents, vendor, date, category, purpose, paymentMethod, planned } = c;
        patch = {
          ...patch,
          title,
          amountCents,
          vendor,
          date,
          category,
          purpose,
          paymentMethod,
          planned,
        };
        const labels = {
          title: "Title",
          amountCents: "Amount",
          vendor: "Vendor",
          date: "Date",
          category: "Category",
          purpose: "Business purpose",
          paymentMethod: "Payment method",
          planned: "Plan",
        };
        const display = (key: string, value: unknown) =>
          key === "amountCents"
            ? value === null
              ? "Not set"
              : `$${(Number(value) / 100).toFixed(2)}`
            : key === "planned"
              ? value
                ? "Planned"
                : "Incurred"
              : String(value || "Not set").slice(0, 100);
        const changes = (Object.keys(labels) as (keyof typeof labels)[])
          .filter((key) => e[key] !== c[key])
          .map((key) => `${labels[key]}: ${display(key, e[key])} → ${display(key, c[key])}`)
          .join("; ");
        await expenseHistory(tx, e.id, "Details updated", changes, {
          before: e,
          after: { title, amountCents, vendor, date, category, purpose, paymentMethod, planned },
        });
      } else if (c.op === "expense.archive") {
        patch.archivedAt = c.archived ? new Date() : null;
        await expenseHistory(
          tx,
          e.id,
          c.archived ? "Archived" : "Restored",
          "Money movements remain in spending reports.",
          { archived: c.archived },
        );
      } else if (c.op === "expense.link") {
        await link(tx, userId, e.id, c.noteId, c.taskId);
        await expenseHistory(tx, e.id, "Linked", "", { noteId: c.noteId, taskId: c.taskId });
      } else if (c.op === "expense.unlink") {
        const found = await tx.personalExpenseLink.findFirst({
          where: { id: c.linkId, expenseId: e.id },
        });
        if (!found) throw new Error("Link unavailable.");
        await tx.personalExpenseLink.delete({ where: { id: found.id } });
        await expenseHistory(tx, e.id, "Unlinked", "", found);
      } else {
        if (c.op === "entry.void" || c.op === "entry.correct") {
          const old = e.entries.find((t) => t.id === c.entryId && !t.voidedAt);
          if (!old) throw new Error("Recorded entry unavailable.");
          await tx.personalExpenseEntry.update({
            where: { id: old.id },
            data: { voidedAt: new Date(), voidReason: c.reason },
          });
          await expenseHistory(
            tx,
            e.id,
            c.op === "entry.void" ? "Entry voided" : "Entry corrected",
            c.reason,
            old,
          );
        }
        if (c.op === "entry.add" || c.op === "entry.correct") {
          if (c.date > businessDate())
            throw new Error(
              "Record actual money movements on today or an earlier date. Use Planned for future spending.",
            );
          const { id, kind, amountCents, date, fundingSource, paymentMethod, note } = c;
          if (kind === "REIMBURSEMENT") {
            const entries = await tx.personalExpenseEntry.findMany({
              where: { expenseId: e.id, date: { lte: date } },
            });
            if (amountCents > expenseTotals(e, entries).personalOutstandingCents)
              throw new Error(
                "Reimbursement exceeds the personal purchase balance available on its date.",
              );
          }
          const entry = await tx.personalExpenseEntry.create({
            data: {
              id,
              expenseId: e.id,
              kind,
              amountCents,
              date,
              fundingSource: kind.startsWith("REIMBURSEMENT") ? "PERSONAL" : fundingSource,
              paymentMethod,
              note,
            },
          });
          await expenseHistory(tx, e.id, "Money movement recorded", "", entry);
          patch.planned = false;
          if (paymentMethod && !e.paymentMethod) patch.paymentMethod = paymentMethod;
        }
        const entries = await tx.personalExpenseEntry.findMany({ where: { expenseId: e.id } });
        validateExpenseLedger(e.amountCents, entries);
      }
      await tx.personalExpense.update({ where: { id: e.id }, data: patch });
    },
    { timeout: 20000 },
  );
  return { data: await expenseWorkspace(userId), expenseId, duplicateOf };
}
