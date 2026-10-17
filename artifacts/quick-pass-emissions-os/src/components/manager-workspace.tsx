import Link from "next/link";
import { ActionForm, Field } from "./action-form";
import { managerAction } from "@/app/manager-actions";
import { areas, priorities, checklistInput } from "@/modules/manager/rules";
import type { managerOverview } from "@/modules/manager/service";
export type ManagerData = Awaited<ReturnType<typeof managerOverview>>;
export function WorkspaceTabs() {
  return (
    <nav className="tabs" aria-label="Operations manager">
      <Link href="/operations">Manager overview</Link>
      <Link href="/operations/schedule">My weekly schedule</Link>
      <Link href="/operations/supplies">Supplies</Link>
      <Link href="/operations/registers">Payments & deposits</Link>
      <Link href="/tasks">All responsibilities</Link>
    </nav>
  );
}
export function Command({ name }: { name: string }) {
  return <input type="hidden" name="command" value={name} />;
}
export const words = (value: string) => value.toLowerCase().replaceAll("_", " ");
export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
export function CreateManagerTask({
  data,
  template,
}: {
  data: ManagerData;
  template?: ManagerData["templates"][number];
}) {
  return (
    <details className="card card-body">
      <summary>
        {template ? `Edit future duty: ${template.title}` : "Create a task or recurring duty"}
      </summary>
      <ActionForm
        action={managerAction}
        submit={template ? "Save future duty" : "Create responsibility"}
      >
        <Command name={template ? "EDIT_DUTY" : "CREATE_TASK"} />
        {template && (
          <>
            <input type="hidden" name="id" value={template.id} />
            <input type="hidden" name="version" value={template.version} />
            <p className="muted">
              Changes apply only to new occurrences. Existing tasks and approved plans keep their
              snapshots; cancel or edit overlapping occurrences explicitly.
            </p>
          </>
        )}
        <Field label="Task title">
          <input name="title" defaultValue={template?.title} required maxLength={160} />
        </Field>
        <Field label="Business area">
          <select name="area" defaultValue={template?.area}>
            {areas.map((a) => (
              <option key={a} value={a}>
                {words(a)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Station / property">
          <input
            name="station"
            defaultValue={template?.station}
            maxLength={100}
            placeholder="Choose a property label"
          />
        </Field>
        <Field label="Execution assigned to">
          <select name="employeeId" defaultValue={template?.employeeId ?? data.actor.employee?.id}>
            {data.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.user.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Manager overseeing work">
          <select name="oversightId" defaultValue={template?.oversightId ?? data.actor.id}>
            {data.people
              .filter((p) => ["OWNER", "ADMIN"].includes(p.user.role))
              .map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.user.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Priority">
          <select name="priority" defaultValue={template?.priority ?? "NORMAL"}>
            {priorities.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Due / start date">
          <input
            name="date"
            type="date"
            defaultValue={template?.startDate ?? data.today}
            required
          />
        </Field>
        <Field label="Deadline · Eastern">
          <input name="time" type="time" required defaultValue={template?.dueTime ?? "17:00"} />
        </Field>
        <Field label="Estimated minutes">
          <input
            name="durationMinutes"
            type="number"
            min={5}
            max={480}
            defaultValue={template?.durationMinutes ?? 30}
            required
          />
        </Field>
        <Field label="Recurrence">
          <select name="frequency" defaultValue={template?.frequency}>
            {!template && <option value="ONCE">One-time project</option>}
            <option value="DAILY">Daily on selected days</option>
            <option value="WEEKLY">Weekly on selected days</option>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="ANNUAL">Annually</option>
          </select>
        </Field>
        <fieldset className="field wide">
          <legend>Working weekdays</legend>
          {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
            (d, i) => (
              <label className="checkbox" key={d}>
                <input
                  type="checkbox"
                  name="weekdays"
                  value={i + 1}
                  defaultChecked={template?.weekdays.includes(i + 1)}
                />
                {d}
              </label>
            ),
          )}
        </fieldset>
        <Field label="Instructions / objective / draft copy" wide>
          <textarea name="description" defaultValue={template?.description} maxLength={2000} />
        </Field>
        <Field label="Checklist · one item per line" wide>
          <textarea
            name="checklist"
            defaultValue={
              template
                ? checklistInput
                    .parse(template.checklist)
                    .map((c) => c.label)
                    .join("\n")
                : ""
            }
            maxLength={4800}
          />
        </Field>
        <label className="checkbox">
          <input
            name="reviewRequired"
            type="checkbox"
            defaultChecked={template?.reviewRequired ?? true}
          />
          Another manager reviews completion
        </label>
        <p className="muted">
          Staff do not log in. Management records execution and reviews. Add dependencies to each
          occurrence after creation. This does not send messages or create a payment.
        </p>
      </ActionForm>
    </details>
  );
}
