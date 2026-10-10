import Link from "next/link";
import { currentUser } from "@/lib/access";
import { businessDate } from "@/lib/time";
import { maintenanceOverview } from "@/modules/maintenance/service";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import {
  DemoNotice,
  MaintenanceNav,
  TextField,
  SelectField,
  PriorityField,
  TargetFields,
} from "@/components/phase3";
import { createTicket } from "@/app/phase3-actions";
export default async function Maintenance() {
  const actor = await currentUser(),
    data = await maintenanceOverview(actor.id);
  return (
    <>
      <PageHeader
        title={data.manager ? "Maintenance" : "Your maintenance work & reports"}
        description={
          data.manager
            ? "Review repairs, assign work, and follow up on equipment issues."
            : "Report an issue and update work assigned to you. Completed work goes to a manager for review."
        }
      />
      <DemoNotice demo={data.demo} />
      {data.manager && <MaintenanceNav />}
      <section className="card card-body">
        <h2>Report a maintenance issue</h2>
        <ActionForm action={createTicket} submit="Report maintenance issue">
          <TargetFields bays={data.bays} equipment={data.equipment} />
          <TextField name="title" label="Issue title" />
          <TextField name="description" label="Issue details" area />
          <PriorityField />
          {data.manager && (
            <>
              <SelectField
                name="assignedId"
                label="Assign maintenance employee"
                options={data.employees.map((e) => ({ id: e.id, name: e.user.name }))}
              />
              <SelectField name="vendorId" label="Maintenance vendor" options={data.vendors} />
              <Field label="Target completion date · Eastern">
                <input type="date" name="targetDate" defaultValue={businessDate()} required />
              </Field>
            </>
          )}
        </ActionForm>
      </section>
      <section className="card space-top">
        <div className="card-heading">
          <h2>Maintenance tickets · latest 100</h2>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Issue / asset</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Target date</th>
              </tr>
            </thead>
            <tbody>
              {data.tickets.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link className="task-name" href={`/maintenance/${t.id}`}>
                      {t.title}
                    </Link>
                    <small>{t.bay?.identifier ?? t.equipment?.name}</small>
                  </td>
                  <td>
                    <span
                      className={`badge ${t.dueAt < new Date() && !["COMPLETED", "CANCELLED"].includes(t.status) ? "danger" : "neutral"}`}
                    >
                      {t.status.toLowerCase().replaceAll("_", " ")}
                    </span>
                  </td>
                  <td>{t.priority.toLowerCase()}</td>
                  <td>{t.targetDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.tickets.length && (
          <p className="card-body muted">No maintenance tickets recorded.</p>
        )}
      </section>
    </>
  );
}
