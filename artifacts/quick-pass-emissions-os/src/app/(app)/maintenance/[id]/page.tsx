import { notFound } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/access";
import { formatDate } from "@/lib/time";
import { managers } from "@/modules/phase3";
import { ticketDetail, maintenanceOverview } from "@/modules/maintenance/service";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { DemoNotice, RecordId, TextField, Reason, SelectField, Money } from "@/components/phase3";
import { updateTicket, assignTicket } from "@/app/phase3-actions";
import { ticketSupport } from "@/modules/support/service";
import { selectTicketProvider } from "@/app/support-actions";
import type { Prisma } from "@prisma/client";
function historyNote(details: Prisma.JsonValue) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return "";
  const source =
    details.after && typeof details.after === "object" && !Array.isArray(details.after)
      ? details.after
      : details;
  return [source.reason, source.description, source.workPerformed]
    .filter((v) => typeof v === "string" && v)
    .join(" · ");
}
export default async function Ticket({ params }: { params: Promise<{ id: string }> }) {
  const actor = await currentUser(),
    { id } = await params,
    detail = await ticketDetail(actor.id, id),
    t = detail.ticket;
  if (!t) notFound();
  const managerTicket = detail.management ? detail.ticket : null;
  const support = await ticketSupport(actor.id, id);
  const data = await maintenanceOverview(actor.id),
    management = managers.includes(actor.role),
    closed = ["COMPLETED", "CANCELLED"].includes(t.status);
  const canWork = management;
  return (
    <>
      <PageHeader
        title={t.title}
        description={`${t.bay?.identifier ?? t.equipment?.name} · ${t.status.toLowerCase().replaceAll("_", " ")} · due ${t.targetDate}`}
      />
      <DemoNotice demo={data.demo} />
      <section className="card card-body">
        <h2>Service &amp; Support</h2>
        {support.assigned ? (
          <p>
            Associated provider:{" "}
            <Link href={`/vendors/${support.assigned.id}`}>{support.assigned.name}</Link>
            {!support.assigned.active && " · archived (historical reference)"}
          </p>
        ) : (
          <p>No provider associated.</p>
        )}
        {support.relevant.map((p) => (
          <p key={p.id}>
            Supports this target: <Link href={`/vendors/${p.id}`}>{p.name}</Link>
            {!p.active && " · archived"}
          </p>
        ))}
        <p>
          <Link href="/vendors">Open Service &amp; Support directory</Link>
        </p>
        {!closed && (
          <ActionForm action={selectTicketProvider} submit="Associate provider only">
            <RecordId id={t.id} version={t.version} />
            <SelectField
              name="vendorId"
              label="Active verified provider"
              options={support.choices}
              value={support.assigned?.active ? support.assigned.id : null}
            />
            <Reason label="Provider association reason" />
          </ActionForm>
        )}
        <p>
          Provider selection does not change assignments, costs, deadlines, progress or manager
          review.
        </p>
      </section>
      <section className="card card-body">
        <h2>Reported issue</h2>
        <p className="preserve-lines">{t.description}</p>
        <p>Priority: {t.priority.toLowerCase()}</p>
        <h3>Work performed</h3>
        <p className="preserve-lines">{t.workPerformed || "No work recorded yet."}</p>
        {managerTicket && (
          <p>
            Recorded repair cost: <Money cents={managerTicket.repairCostCents} />
          </p>
        )}
      </section>
      {!closed && canWork && (
        <section className="card card-body space-top">
          <h2>Update or review work</h2>
          <ActionForm action={updateTicket} submit="Save maintenance progress">
            <RecordId id={t.id} version={t.version} />
            <Field label="Maintenance work status">
              <select name="status" defaultValue="" required>
                <option value="" disabled>
                  Choose next status
                </option>
                {["OPEN", "IN_PROGRESS", "BLOCKED", "AWAITING_REVIEW", "COMPLETED", "CANCELLED"]
                  .filter((s) => s !== t.status)
                  .map((s) => (
                    <option key={s} value={s}>
                      {s === "AWAITING_REVIEW"
                        ? "Work done · request manager review"
                        : s.toLowerCase().replaceAll("_", " ")}
                    </option>
                  ))}
              </select>
            </Field>
            <TextField
              name="workPerformed"
              label="Work performed / findings"
              value={t.workPerformed}
              area
              required={false}
            />
            {management && (
              <>
                <input name="assignedId" type="hidden" value={t.assignedId ?? ""} />
                <input name="vendorId" type="hidden" value={managerTicket?.vendorId ?? ""} />
                <input name="targetDate" type="hidden" value={t.targetDate} />
                <Field label="Actual repair cost · integer cents, blank if unknown">
                  <input
                    name="repairCostCents"
                    type="number"
                    min="0"
                    max="2000000000"
                    defaultValue={managerTicket?.repairCostCents ?? ""}
                  />
                </Field>
              </>
            )}
            <Reason label="Work update / review reason" />
          </ActionForm>
        </section>
      )}
      {!closed && management && (
        <section className="card card-body space-top">
          <h2>Assignment & deadline</h2>
          <ActionForm action={assignTicket} submit="Update maintenance assignment">
            <RecordId id={t.id} version={t.version} />
            <SelectField
              name="assignedId"
              label="Assigned employee"
              value={t.assignedId}
              options={data.employees.map((e) => ({ id: e.id, name: e.user.name }))}
            />
            <SelectField
              name="vendorId"
              label="Assigned vendor"
              value={managerTicket?.vendorId}
              options={data.vendors}
            />
            <Field label="Revised target date">
              <input name="targetDate" type="date" defaultValue={t.targetDate} required />
            </Field>
            <Reason />
          </ActionForm>
        </section>
      )}
      {managerTicket && (
        <section className="card card-body space-top">
          <h2>Maintenance history</h2>
          {managerTicket.events.map((e) => (
            <article key={e.id}>
              <h3>
                {e.action.toLowerCase().replaceAll("_", " ")} · {formatDate(e.createdAt)}
              </h3>
              <p className="preserve-lines">{historyNote(e.details)}</p>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
