import { notFound } from "next/navigation";
import { currentUser } from "@/lib/access";
import { db } from "@/lib/db";
import { canAccessTask, isManager } from "@/lib/policy";
import { businessDate, formatDate } from "@/lib/time";
import { PageHeader, Status } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { addTaskNote, overrideTask, reviewTask, updateTask } from "@/app/actions";
export default async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await currentUser();
  const task = await db.taskInstance.findUnique({
    where: { id: (await params).id },
    include: {
      employee: { select: { user: { select: { name: true } } } },
      events: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!task || !canAccessTask(actor.role)) notFound();
  const management = isManager(actor.role);
  const employees = management
    ? await db.employee.findMany({
        where: { user: { active: true } },
        select: { id: true, user: { select: { name: true } } },
      })
    : [];
  return (
    <>
      <PageHeader
        title={task.title}
        description={`Assigned to ${task.employee.user.name} · Due ${formatDate(task.dueAt)} ET`}
      >
        <Status task={task} />
      </PageHeader>
      <div className="two-columns">
        <div className="stack">
          <section className="card card-body">
            <h2>Task instructions</h2>
            <p className="pre-wrap">{task.description || "No additional instructions."}</p>
            <p className="muted">
              {task.priority.toLowerCase()} priority ·{" "}
              {task.reviewRequired ? "Manager review required" : "No review required"}
            </p>
            {(management || !["COMPLETED", "CANCELLED"].includes(task.status)) && (
              <ActionForm action={updateTask} submit="Update task">
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="version" value={task.version} />
                <Field label="New status">
                  <select name="status" defaultValue="COMPLETED">
                    {["PENDING", "IN_PROGRESS", "COMPLETED", "BLOCKED", "CANCELLED"].map((s) => (
                      <option key={s} value={s}>
                        {s.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Completion note / reason">
                  <textarea name="note" maxLength={2000} />
                </Field>
              </ActionForm>
            )}
            {task.completedAt && (
              <p className="success">Completed {formatDate(task.completedAt)}</p>
            )}
            {task.reviewedAt && (
              <p className="success">Manager reviewed {formatDate(task.reviewedAt)}</p>
            )}
            {management && task.status === "COMPLETED" && !task.reviewedAt && (
              <ActionForm action={reviewTask} submit="Approve completion review">
                <input type="hidden" name="taskId" value={task.id} />
              </ActionForm>
            )}
          </section>
          <section className="card card-body">
            <h2>Add a note</h2>
            <ActionForm action={addTaskNote} submit="Add note">
              <input type="hidden" name="taskId" value={task.id} />
              <Field label="Note" wide>
                <textarea name="note" required maxLength={2000} />
              </Field>
            </ActionForm>
          </section>
          {management && (
            <details className="card card-body">
              <summary>Reassign or change deadline</summary>
              <p className="muted">A reason is required. This affects only this occurrence.</p>
              <ActionForm action={overrideTask} submit="Save approved override">
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="version" value={task.version} />
                <Field label="Employee">
                  <select name="employeeId" defaultValue={task.employeeId}>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.user.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="New due date">
                  <input type="date" name="date" required defaultValue={businessDate(task.dueAt)} />
                </Field>
                <Field label="New time · Eastern">
                  <input
                    type="time"
                    name="time"
                    required
                    defaultValue={new Intl.DateTimeFormat("en-GB", {
                      timeZone: "America/New_York",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(task.dueAt)}
                  />
                </Field>
                <Field label="Reason">
                  <textarea name="reason" required minLength={5} maxLength={2000} />
                </Field>
              </ActionForm>
            </details>
          )}
        </div>
        <section className="card">
          <div className="card-heading">
            <h2>Task history</h2>
          </div>
          <div className="card-body timeline">
            {task.events.length ? (
              task.events.map((e) => (
                <div key={e.id}>
                  <span className="timeline-dot" />
                  <p>
                    <strong>{e.actorName}</strong> · {e.action.toLowerCase().replaceAll("_", " ")}
                    <span className="pre-wrap">{e.note}</span>
                    <small>{formatDate(e.createdAt)}</small>
                  </p>
                </div>
              ))
            ) : (
              <p className="muted">No activity recorded yet.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
