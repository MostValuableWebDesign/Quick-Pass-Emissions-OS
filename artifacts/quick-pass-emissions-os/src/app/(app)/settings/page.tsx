import { manager } from "@/lib/access";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/time";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { removeClosure, saveClosure, saveSettings, triggerJobs } from "@/app/actions";
import { storageStatus } from "@/modules/storage/service";
import Link from "next/link";
import { saveCertificateAlertThresholdAction } from "@/app/certificate-portal-actions";
import { readCertificatePortalStatus } from "@/modules/certificates/portal";
export default async function Settings() {
  const actor = await manager();
  const certStatus = actor.role === "OWNER" ? await readCertificatePortalStatus().catch(() => null) : null;
  const storage = actor.role === "OWNER" ? await storageStatus(actor.id) : null;
  const [settings, closures, runs, audit] = await Promise.all([
    db.businessSetting.findUnique({ where: { id: "business" } }),
    db.closure.findMany({ orderBy: { date: "asc" } }),
    db.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 8 }),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { actor: { select: { name: true } } },
    }),
  ]);
  return (
    <>
      <PageHeader
        title="Business settings & accountability"
        description="Configure operating days, manage exceptions, and review the audit trail."
      />
      {storage && (
        <section className="card card-body">
          <p>
            <Link href="/settings/import">
              Business configuration import & unresolved decisions
            </Link>
          </p>
          <h2>Data storage & recovery</h2>
          <p>
            Saved records are kept in PostgreSQL, separately from application builds. Restarting or
            updating this app keeps your saved data when it uses the same database.
          </p>
          <p className="muted">
            Storage ID: <code className="audit-details">{storage.instanceId}</code>
          </p>
          <p>
            {storage.employees} employee profiles · {storage.tasks} responsibilities ·{" "}
            {storage.auditEntries} audit entries
          </p>
          <p className="muted">
            Replit preview and the published app can use separate databases. If records appear
            missing, compare this storage ID with your earlier record and check which database is
            connected. Backups and database recovery are configured separately by your
            administrator.
          </p>
        </section>
      )}
      {actor.role === "OWNER" && (
        <section className="card card-body space-top">
          <h2>Low certificate alert</h2>
          <p className="muted">
            Show a banner across the app when the provider portal balance falls below this number.
          </p>
          <ActionForm action={saveCertificateAlertThresholdAction} submit="Save alert threshold">
            <Field label="Alert when portal balance is below">
              <input name="threshold" type="number" min="0" max="1000000" step="1" required defaultValue={certStatus?.threshold ?? 30} />
            </Field>
          </ActionForm>
        </section>
      )}
      <div className="two-columns space-top">
        <div className="stack">
          <section className="card card-body">
            <h2>Business operating days</h2>
            <p className="muted">
              Confirm with the owner. Timezone is America/New_York. Changes apply to future
              generation; review already generated duties separately.
            </p>
            <ActionForm action={saveSettings}>
              <fieldset className="wide">
                <legend>Open days</legend>
                <div className="checks">
                  {[
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday",
                  ].map((d, i) => (
                    <label key={d}>
                      <input
                        type="checkbox"
                        name="operatingDays"
                        value={i + 1}
                        defaultChecked={settings?.operatingDays.includes(i + 1)}
                      />
                      {d}
                    </label>
                  ))}
                </div>
              </fieldset>
            </ActionForm>
          </section>
          <section className="card card-body">
            <h2>Holidays & business closures</h2>
            <p className="muted">
              Closures prevent new generation. Cancel existing instances individually, recording a
              reason.
            </p>
            <ActionForm action={saveClosure} submit="Add closure">
              <Field label="Closed date">
                <input name="date" type="date" required />
              </Field>
              <Field label="Reason">
                <input name="reason" required maxLength={2000} />
              </Field>
            </ActionForm>
            {closures.map((c) => (
              <div className="list-row" key={c.date}>
                <span>
                  {c.date} · {c.reason}
                </span>
                <ActionForm action={removeClosure} submit="Remove" className="inline-form">
                  <input type="hidden" name="date" value={c.date} />
                </ActionForm>
              </div>
            ))}
          </section>
        </div>
        <section className="card card-body">
          <h2>Operations scheduler</h2>
          <p className="muted">
            Generates responsibilities and overdue alerts. Configure an external trigger every 15
            minutes using the deployment guide.
          </p>
          <ActionForm action={triggerJobs} submit="Run operations check" />
          {runs.map((r) => (
            <div className="list-row" key={r.id}>
              <div>
                <strong>{r.status.toLowerCase()}</strong>
                <small>{formatDate(r.startedAt)}</small>
              </div>
              <span>{r.generated} generated</span>
            </div>
          ))}
        </section>
      </div>
      <section className="card space-top">
        <div className="card-heading">
          <h2>Audit history</h2>
          <span className="muted">Latest 50 actions</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>When · Eastern</th>
                <th>Who</th>
                <th>Action</th>
                <th>Record / details</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap">{formatDate(a.createdAt)}</td>
                  <td>{a.actor?.name ?? "System"}</td>
                  <td>{a.action.toLowerCase().replaceAll("_", " ")}</td>
                  <td>
                    <details>
                      <summary>View record</summary>
                      <code className="audit-details">
                        {a.entityId}
                        <br />
                        {JSON.stringify(a.details)}
                      </code>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
