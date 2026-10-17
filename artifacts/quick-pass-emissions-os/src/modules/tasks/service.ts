import { type Role } from "@prisma/client";
import { z } from "zod";
import { managerTransaction } from "../manager/service";
import { checklistInput, taskReady } from "../manager/rules";
import { canAccessTask, canTransition, isManager } from "../../lib/policy";
import { id, note, status } from "../../lib/validation";
export type TaskActor = { id: string; name: string; role: Role; employee?: { id: string } | null };
export const taskChange = z.object({
  taskId: id,
  version: z.coerce.number().int().min(0),
  status,
  note,
});
export async function changeTask(actor: TaskActor, input: z.infer<typeof taskChange>) {
  const data = taskChange.parse(input);
  return managerTransaction(actor.id, async (tx) => {
    const current = await tx.user.findUnique({ where: { id: actor.id } });
    if (!current?.active || !isManager(current.role)) throw new Error("Task access denied.");
    const task = await tx.taskInstance.findUniqueOrThrow({ where: { id: data.taskId } });
    if (!canAccessTask(current.role)) throw new Error("Task access denied.");
    if (data.status === "COMPLETED") {
      const checks = checklistInput.parse(task.checklist);
      if (checks.some((c) => !c.done))
        throw new Error("Please finish the checklist before completing this task.");
      const dependencies = await tx.taskDependency.findMany({
        where: { taskId: task.id },
        include: { prerequisite: true },
      });
      if (
        dependencies.some(
          (d) =>
            !taskReady(
              d.prerequisite.status,
              d.prerequisite.reviewRequired,
              d.prerequisite.reviewedAt,
            ),
        )
      )
        throw new Error("Please complete and review prerequisites first.");
    }
    if (!canTransition(task.status, data.status, isManager(current.role)))
      throw new Error("This status change is not allowed.");
    if (
      (data.status === "BLOCKED" ||
        data.status === "CANCELLED" ||
        ["COMPLETED", "CANCELLED"].includes(task.status)) &&
      !data.note
    )
      throw new Error("Please record a reason for this change.");
    const changed = await tx.taskInstance.updateMany({
      where: { id: task.id, version: data.version },
      data: {
        status: data.status,
        version: { increment: 1 },
        completedAt: data.status === "COMPLETED" ? new Date() : null,
        reviewedAt: null,
        reviewedBy: null,
      },
    });
    if (!changed.count) throw new Error("This task changed. Refresh before trying again.");
    await tx.taskEvent.create({
      data: {
        taskId: task.id,
        actorId: actor.id,
        actorName: current.name,
        action: data.status,
        note: data.note,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "TASK_STATUS",
        entityId: task.id,
        details: { from: task.status, to: data.status, reason: data.note },
      },
    });
    if (["COMPLETED", "CANCELLED"].includes(data.status))
      await tx.notification.updateMany({
        where: { taskId: task.id },
        data: { resolvedAt: new Date() },
      });
  });
}
