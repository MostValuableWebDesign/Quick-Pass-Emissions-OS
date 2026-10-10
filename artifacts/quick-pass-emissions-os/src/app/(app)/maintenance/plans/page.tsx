import { currentUser } from "@/lib/access";
import { businessDate } from "@/lib/time";
import { registry } from "@/modules/maintenance/service";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import {
  DemoNotice,
  RecordId,
  TextField,
  Reason,
  ActiveField,
  PriorityField,
  TargetFields,
} from "@/components/phase3";
import { savePlan } from "@/app/phase3-actions";
type Data = Awaited<ReturnType<typeof registry>>;
function PlanForm({ data, p }: { data: Data; p?: Data["plans"][number] }) {
  return (
    <ActionForm
      action={savePlan}
      submit={p ? "Update preventative schedule" : "Create preventative schedule"}
    >
      <RecordId id={p?.id} version={p?.version} />
      <TargetFields
        bays={data.bays}
        equipment={data.equipment.filter((e) => e.active)}
        bayId={p?.bayId}
        equipmentId={p?.equipmentId}
      />
      <TextField label="Inspection / maintenance title" name="title" value={p?.title} />
      <TextField
        label="Maintenance instructions"
        name="instructions"
        value={p?.instructions}
        area
      />
      <Field label="Schedule assignee">
        <select name="employeeId" defaultValue={p?.employeeId} required>
          <option value="">Choose employee</option>
          {data.employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.user.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Repeat every · calendar days">
        <input
          name="intervalDays"
          type="number"
          min="1"
          max="3650"
          defaultValue={p?.intervalDays}
          required
        />
      </Field>
      <Field label="Next scheduled business date">
        <input
          name="nextDueDate"
          type="date"
          min={businessDate()}
          defaultValue={p && p.nextDueDate >= businessDate() ? p.nextDueDate : businessDate()}
          required
        />
      </Field>
      <Field label="Due time · Eastern">
        <input name="dueTime" type="time" defaultValue={p?.dueTime ?? "17:00"} required />
      </Field>
      <PriorityField value={p?.priority} />
      <ActiveField active={p?.active} />
      <Reason />
    </ActionForm>
  );
}
export default async function Plans() {
  const actor = await currentUser(),
    data = await registry(actor.id);
  return (
    <>
      <PageHeader
        title="Preventative maintenance"
        description="Recurring inspections and maintenance, assigned to an active employee."
      />
      <DemoNotice demo={data.demo} />
      <p className="notice">
        The operations check generates tickets up to 14 days ahead. Closed days are skipped;
        intervals remain anchored in calendar days. Changes affect future generation. Review
        existing tickets separately.
      </p>
      <section className="card card-body">
        <h2>Create a maintenance schedule</h2>
        <PlanForm data={data} />
      </section>
      <div className="two-columns space-top">
        {data.plans.map((p) => (
          <section className="card card-body" key={p.id}>
            <h2>
              {p.title} · {p.active ? "active" : "paused"}
            </h2>
            <p>
              {p.bay?.identifier ?? p.equipment?.name} · {p.employee.user.name}
            </p>
            <p>
              Every {p.intervalDays} calendar days · Next ungenerated date: {p.nextDueDate}
            </p>
            <details>
              <summary>Edit schedule</summary>
              <PlanForm data={data} p={p} />
            </details>
          </section>
        ))}
      </div>
    </>
  );
}
