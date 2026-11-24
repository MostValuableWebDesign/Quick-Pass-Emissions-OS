import type { Prisma } from "@prisma/client";
import { originalWorkText, polishSource, type Clarification } from "./polish-rules";
/** Caller holds the personal writer lock and has freshly authorized the account. */
export async function saveReviewedWorkSummary(
  tx: Prisma.TransactionClient,
  userId: string,
  command: {
    id: string;
    version: number;
    text: string;
    answers: Clarification[];
  },
) {
  const note = await tx.personalNote.findFirst({
    where: { id: command.id, userId, version: command.version, deletedAt: null },
  });
  if (!note)
    throw new Error(
      "This item changed in another session. Your suggested wording has not been saved. Polish the latest note.",
    );
  await tx.personalNote.update({
    where: { id: note.id },
    data: {
      polishedSummary: command.text,
      polishedOriginal: originalWorkText(note),
      polishedSource: polishSource(note),
      polishedAnswers: command.answers,
      polishedAt: new Date(),
      version: { increment: 1 },
    },
  });
  // A checklist item is a narrower task: never replace it with the whole note's work.
  const tasks = await tx.personalTask.findMany({
    where: { userId, noteId: note.id, sourceKey: `note:${note.id}` },
  });
  for (const task of tasks) {
    const completed = task.status === "COMPLETED";
    await tx.personalTask.update({
      where: { id: task.id },
      data: {
        description: command.text,
        ...(completed ? { completionNote: command.text } : {}),
        version: { increment: 1 },
      },
    });
    if (completed)
      await tx.personalTaskEvent.create({
        data: {
          taskId: task.id,
          kind: "UPDATED",
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate,
          completedAt: task.completedAt,
          completionNote: command.text,
        },
      });
  }
}
