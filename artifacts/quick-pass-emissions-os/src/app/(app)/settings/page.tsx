import { manager } from "@/lib/access";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/time";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { removeClosure, saveClosure, saveSettings } from "@/app/actions";
import Link from "next/link";
import { saveCertificateAlertThresholdAction } from "@/app/certificate-portal-actions";
import { readCertificatePortalStatus } from "@/modules/certificates/portal";
import { StationSettingsPanel } from "@/components/station-settings-panel";
export default async function Settings() {
  const actor = await manager();
  const certStatus =
    actor.role === "OWNER" ? await readCertificatePortalStatus().catch(() => null) : null;
  const [settings, closures, audit] = await Promise.all([
    db.businessSetting.findUnique({ where: { id: "business" } }),
    db.closure.findMany({ orderBy: { date: "asc" } }),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { actor: { select: { name: true } } },
    }),
  ]);
  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage business operations, Emissions station data, and recent activity."
      />
      <section className="settings-group">
        <div className="settings-group-heading">
          <div>
            <h2>Business operations</h2>
            <p className="muted">Operating days, planned closures, and business configuration.</p>
          </div>
          {actor.role === "OWNER" && (
            <Link className="button button-outline button-sm" href="/settings/import">
              Import configuration
            </Link>
          )}
        </div>
        <div className="two-columns settings-card-grid">
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
      </section>
      {actor.role === "OWNER" && (
        <section className="settings-group">
          <div className="settings-group-heading">
            <div>
              <h2>Emissions & certificates</h2>
              <p className="muted">Station reporting hours and low-certificate alerts.</p>
            </div>
          </div>
          <div className="two-columns settings-card-grid">
            <section className="card card-body">
              <h2>Low certificate alert</h2>
              <p className="muted">
                Show a banner across the app when the provider portal balance falls below this
                number.
              </p>
              <ActionForm
                action={saveCertificateAlertThresholdAction}
                submit="Save alert threshold"
              >
                <Field label="Alert when portal balance is below">
                  <input
                    name="threshold"
                    type="number"
                    min="0"
                    max="1000000"
                    step="1"
                    required
                    defaultValue={certStatus?.threshold ?? 30}
                  />
                </Field>
              </ActionForm>
            </section>
            <StationSettingsPanel actorId={actor.id} />
          </div>
        </section>
      )}
      <section className="settings-group">
        <div className="settings-group-heading">
          <div>
            <h2>Recent activity</h2>
            <p className="muted">Latest 50 changes made in this workspace.</p>
          </div>
        </div>
        <section className="card">
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
      </section>
    </>
  );
}
