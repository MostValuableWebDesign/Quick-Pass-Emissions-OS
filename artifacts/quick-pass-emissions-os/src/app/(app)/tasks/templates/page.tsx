import { manager } from "@/lib/access";
import { db } from "@/lib/db";
import { businessDate } from "@/lib/time";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { createTemplate, pauseTemplate } from "@/app/actions";
export default async function Templates() {
  await manager();
  const [employees, templates] = await Promise.all([
    db.employee.findMany({
      where: { user: { active: true } },
      select: { id: true, user: { select: { name: true } } },
    }),
    db.taskTemplate.findMany({
      include: { employee: { select: { user: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return (
    <>
      <PageHeader
        title="Recurring duties"
        description="Set a clear owner, schedule, and deadline. Tasks generate 14 days ahead."
      />
      <section className="card card-body">
        <h2>Create a responsibility</h2>
        <ActionForm action={createTemplate} submit="Create responsibility">
          <Field label="Task title">
            <input name="title" required maxLength={160} />
          </Field>
          <Field label="Assigned employee">
            <select name="employeeId" required>
              <option value="">Choose an employee</option>
              {employees.map((e) => (
                <option value={e.id} key={e.id}>
                  {e.user.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Instructions" wide>
            <textarea name="description" maxLength={2000} />
          </Field>
          <Field label="Repeat">
            <select name="frequency">
              {["ONCE", "DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </Field>
          <Field label="Due time · Eastern">
            <input type="time" name="dueTime" required defaultValue="17:00" />
          </Field>
          <Field label="Start date">
            <input type="date" name="startDate" defaultValue={businessDate()} required />
          </Field>
          <Field label="End date (optional)">
            <input type="date" name="endDate" />
          </Field>
          <fieldset className="wide">
            <legend>Weekly recurrence days (used for weekly tasks)</legend>
            <div className="checks">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
                <label key={d}>
                  <input type="checkbox" name="weekdays" value={i + 1} />
                  {d}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Priority">
            <select name="priority" defaultValue="NORMAL">
              {["LOW", "NORMAL", "HIGH", "CRITICAL"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Alert manager after overdue hours">
            <input
              type="number"
              name="escalationHours"
              min="0"
              max="168"
              defaultValue="0"
              required
            />
          </Field>
          <label className="check wide">
            <input type="checkbox" name="reviewRequired" />
            Require manager review after completion
          </label>
        </ActionForm>
      </section>
      <section className="card space-top">
        <div className="card-heading">
          <h2>Task templates</h2>
        </div>
        <p className="card-body muted">
          Pausing stops new generation. Already generated tasks keep their assignments and
          deadlines; cancel or override them individually. To change a recurrence, pause it and
          create a replacement with a nonoverlapping start date.
        </p>
        {templates.map((t) => (
          <div className="list-row" key={t.id}>
            <div>
              <strong>{t.title}</strong>
              <small>
                {t.employee.user.name} · {t.frequency.toLowerCase()} · {t.dueTime} ET ·{" "}
                {t.active ? "Active" : "Paused"}
              </small>
            </div>
            <ActionForm
              action={pauseTemplate}
              submit={t.active ? "Pause" : "Resume"}
              className="inline-form"
            >
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="version" value={t.version} />
              <input type="hidden" name="active" value={String(!t.active)} />
            </ActionForm>
          </div>
        ))}
      </section>
    </>
  );
}
