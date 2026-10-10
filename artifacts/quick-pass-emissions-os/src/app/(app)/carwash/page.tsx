import { RecordLink } from "@/components/record-link";
import Link from "next/link";
import { currentUser } from "@/lib/access";
import { formatDate } from "@/lib/time";
import { registry } from "@/modules/maintenance/service";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { DemoNotice, RecordId, TextField, Reason, SelectField } from "@/components/phase3";
import { configureBays, updateBay } from "@/app/phase3-actions";
import { targetProviders } from "@/modules/support/service";
export default async function Carwash() {
  const actor = await currentUser(),
    data = await registry(actor.id);
  const support = new Map(
    await Promise.all(
      data.bays.map(async (b) => [b.id, await targetProviders(actor.id, { bayId: b.id })] as const),
    ),
  );
  return (
    <>
      <PageHeader
        title="Carwash & bays"
        description="Six physical bays, recorded condition, responsibility, and downtime."
      />
      <DemoNotice demo={data.demo} />
      {!data.bays.length && (
        <section className="card card-body">
          <h2>Confirm the six-bay layout</h2>
          <p>
            Enter the actual identifiers: three self-service bays followed by three detailing bays.
            Initial condition is unknown until inspected.
          </p>
          {actor.role === "OWNER" ? (
            <ActionForm action={configureBays} submit="Confirm six bays">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <TextField
                  key={n}
                  name={`bay${n}`}
                  label={`${n <= 3 ? "Self-service" : "Detailing"} bay ${n <= 3 ? n : n - 3} identifier`}
                />
              ))}
              <Reason label="Layout verification reference / reason" />
            </ActionForm>
          ) : (
            <p className="muted">The owner must confirm the layout first.</p>
          )}
        </section>
      )}
      <div className="roadmap-grid">
        {data.bays.map((b) => (
          <section className="card card-body" key={b.id}>
            <span
              className={`badge ${["OUT_OF_SERVICE", "UNDER_REPAIR"].includes(b.status) ? "danger" : "neutral"}`}
            >
              {b.status.toLowerCase().replaceAll("_", " ")}
            </span>
            <h2>{b.identifier}</h2>
            <p>
              <Link href="/vendors">Service &amp; Support</Link>
            </p>
            {support.get(b.id)?.map((p) => (
              <p key={p.id}>
                <Link href={`/vendors/${p.id}`}>{p.name}</Link>
                {!p.active && " · archived"}
              </p>
            ))}
            <p>
              {b.type === "DETAILING" ? "Detailing rental" : "Self-service"} · {b.equipment.length}{" "}
              equipment items · {b._count.tickets} maintenance tickets
            </p>
            <p className="muted">Responsible: {b.responsible?.user.name ?? "Unassigned"}</p>
            <details>
              <summary>Equipment & inspection schedules</summary>
              {b.equipment.map((e) => (
                <p key={e.id}>
                  <Link href="/equipment">
                    {e.code} · {e.name}
                    {!e.active ? " · archived" : ""}
                  </Link>
                </p>
              ))}
              {b.plans.map((p) => (
                <p key={p.id}>
                  <Link href="/maintenance/plans">{p.title}</Link> · Every {p.intervalDays} days ·
                  Next ungenerated {p.nextDueDate}
                </p>
              ))}
              {!b.equipment.length && !b.plans.length && (
                <p className="muted">No equipment or direct bay inspection schedule configured.</p>
              )}
            </details>
            <details>
              <summary>Maintenance history · latest 20 direct bay tickets</summary>
              {b.tickets.map((t) => (
                <p key={t.id}>
                  <RecordLink href={`/maintenance/${t.id}`}>{t.title}</RecordLink> ·{" "}
                  {t.status.toLowerCase().replaceAll("_", " ")} · {t.targetDate}
                </p>
              ))}
              {!b.tickets.length && (
                <p className="muted">
                  No direct bay maintenance recorded. Equipment tickets are available in
                  Maintenance.
                </p>
              )}
            </details>
            <ActionForm action={updateBay} submit="Update bay">
              <RecordId id={b.id} version={b.version} />
              {actor.role === "OWNER" && (
                <TextField name="identifier" label="Verified bay identifier" value={b.identifier} />
              )}
              <Field label="Bay condition">
                <select
                  name="status"
                  defaultValue={b.status === "UNKNOWN" ? "" : b.status}
                  required
                >
                  <option value="" disabled>
                    Inspect and confirm condition
                  </option>
                  {["OPERATIONAL", "MAINTENANCE_REQUIRED", "OUT_OF_SERVICE", "UNDER_REPAIR"].map(
                    (s) => (
                      <option value={s} key={s}>
                        {s.toLowerCase().replaceAll("_", " ")}
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <SelectField
                name="responsibleId"
                label="Responsible employee"
                value={b.responsibleId}
                options={data.employees.map((e) => ({ id: e.id, name: e.user.name }))}
              />
              <TextField label="Bay notes" name="notes" value={b.notes} required={false} area />
              <Reason />
            </ActionForm>
            <details className="space-top">
              <summary>Downtime history · latest 20</summary>
              {b.downtime.length ? (
                b.downtime.map((d) => (
                  <p key={d.id}>
                    {formatDate(d.startedAt)} → {d.endedAt ? formatDate(d.endedAt) : "Ongoing"}
                    <br />
                    {d.reason}
                    {d.resolution ? ` · ${d.resolution}` : ""}
                  </p>
                ))
              ) : (
                <p className="muted">No downtime recorded.</p>
              )}
            </details>
          </section>
        ))}
      </div>
      <p className="footnote">
        Out of service / under repair opens downtime at recording time. Returning to an available
        condition closes it. Equipment outages and bay condition are reviewed separately.
      </p>
    </>
  );
}
