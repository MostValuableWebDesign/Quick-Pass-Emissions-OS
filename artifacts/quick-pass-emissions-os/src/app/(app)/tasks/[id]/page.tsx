import { notFound } from "next/navigation";
import { currentUser } from "@/lib/access";
import { db } from "@/lib/db";
import { canAccessTask, isManager } from "@/lib/policy";
import { businessDate, formatDate } from "@/lib/time";
import { PageHeader, Status } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { addTaskNote, overrideTask, reviewTask, updateTask } from "@/app/actions";
import { managerAction } from "@/app/manager-actions";
import { checklistInput, areas, priorities } from "@/modules/manager/rules";
import { Command } from "@/components/manager-workspace";
import Link from "next/link";
export default async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await currentUser();
  const task = await db.taskInstance.findUnique({
    where: { id: (await params).id },
    include: {
      employee: { select: { user: { select: { name: true } } } },
      events: { orderBy: { createdAt: "desc" } },
      dependencies: { include: { prerequisite: true } },
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
  const managers = await db.user.findMany({
    where: { active: true, role: { in: ["OWNER", "ADMIN"] } },
    select: { id: true, name: true },
  });
  const prerequisites = await db.taskInstance.findMany({
    where: { id: { not: task.id } },
    select: { id: true, title: true, occurrenceDate: true },
    orderBy: { dueAt: "desc" },
    take: 1000,
  });
  const checklist = checklistInput.parse(task.checklist);
  const prerequisiteOptions = [
    ...task.dependencies.map((d) => d.prerequisite),
    ...prerequisites,
  ].filter((p, i, all) => all.findIndex((t) => t.id === p.id) === i);
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
            <p>
              {task.area.toLowerCase().replaceAll("_", " ")} ·{" "}
              {task.station || "Station not specified"} · {task.durationMinutes} minutes estimated ·
              Oversight: {managers.find((m) => m.id === task.oversightId)?.name ?? "Not assigned"}
            </p>
            {task.sourceHref && <Link href={task.sourceHref}>Open source workflow →</Link>}
            {task.dependencies.length > 0 && (
              <div>
                <h3>Prerequisites</h3>
                {task.dependencies.map((d) => (
                  <p key={d.prerequisiteId}>
                    <Link href={`/tasks/${d.prerequisiteId}`}>{d.prerequisite.title}</Link> ·{" "}
                    {d.prerequisite.status}
                    {d.prerequisite.reviewRequired && !d.prerequisite.reviewedAt
                      ? " · review pending"
                      : ""}
                  </p>
                ))}
              </div>
            )}
            {checklist.map((c, i) => (
              <p key={i}>
                {c.done ? "✓" : "○"} {c.label}
              </p>
            ))}
            {task.evidence && <p className="pre-wrap">Completion evidence: {task.evidence}</p>}
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
                <input type="hidden" name="version" value={task.version} />
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
              <summary>Checklist, dependencies & completion evidence</summary>
              <p className="muted">
                Completing tasks never confirms payments, deposits, purchases or repairs. Evidence
                is a note/reference, not an automatic verification.
              </p>
              <ActionForm action={managerAction} submit="Save task plan">
                <Command name="TASK_DETAILS" />
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="version" value={task.version} />
                <Field label="Task title">
                  <input name="title" defaultValue={task.title} required maxLength={160} />
                </Field>
                <Field label="Instructions / objective">
                  <textarea name="description" defaultValue={task.description} maxLength={2000} />
                </Field>
                <Field label="Business area">
                  <select name="area" defaultValue={task.area}>
                    {areas.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Station / property">
                  <input name="station" defaultValue={task.station} maxLength={100} />
                </Field>
                <Field label="Priority">
                  <select name="priority" defaultValue={task.priority}>
                    {priorities.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Estimated duration · minutes">
                  <input
                    type="number"
                    name="durationMinutes"
                    min={5}
                    max={480}
                    required
                    defaultValue={task.durationMinutes}
                  />
                </Field>
                <Field label="Manager overseeing work">
                  <select name="oversightId" defaultValue={task.oversightId ?? actor.id}>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <fieldset className="field wide">
                  <legend>Checklist progress</legend>
                  {checklist.map((c, i) => (
                    <label className="checkbox" key={i}>
                      <input type="hidden" name="checklistLabel" value={c.label} />
                      <input name="done" type="checkbox" value={i} defaultChecked={c.done} />
                      {c.label}
                    </label>
                  ))}
                </fieldset>
                <Field label="Add checklist items · one per line" wide>
                  <textarea name="newChecklist" maxLength={4800} />
                </Field>
                <Field label="Prerequisites · hold Command/Ctrl for multiple" wide>
                  <select
                    name="dependencies"
                    multiple
                    defaultValue={task.dependencies.map((d) => d.prerequisiteId)}
                  >
                    {prerequisiteOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.occurrenceDate} · {t.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Completion evidence / preview link / service reference" wide>
                  <textarea name="evidence" maxLength={2000} defaultValue={task.evidence} />
                </Field>
              </ActionForm>
            </details>
          )}
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
