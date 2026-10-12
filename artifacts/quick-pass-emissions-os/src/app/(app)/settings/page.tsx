import { manager } from "@/lib/access";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { removeClosure, saveClosure, saveSettings } from "@/app/actions";
import { saveCertificateAlertThresholdAction } from "@/app/certificate-portal-actions";
import { readCertificatePortalStatus } from "@/modules/certificates/portal";
import { DEFAULT_CERTIFICATE_THRESHOLD } from "@/modules/certificates/portal-types";

export default async function Settings() {
  const actor = await manager();
  const certStatus =
    actor.role === "OWNER" ? await readCertificatePortalStatus().catch(() => null) : null;
  const [settings, closures] = await Promise.all([
    db.businessSetting.findUnique({ where: { id: "business" } }),
    db.closure.findMany({ orderBy: { date: "asc" } }),
  ]);
  return (
    <>
      <PageHeader
        title="Business settings"
        description="Manage operating days, planned closures, and certificate alerts."
      />
      <section className="settings-group">
        <div className="settings-group-heading">
          <div>
            <h2>Business operations</h2>
            <p className="muted">Operating days, planned closures, and business configuration.</p>
          </div>
        </div>
        <div className="two-columns settings-card-grid">
          <section className="card card-body">
            <h2>Business operating days</h2>
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
              <p className="muted">Low-certificate alerts.</p>
            </div>
          </div>
          <div className="settings-card-grid">
            <section className="card card-body">
              <h2>Low certificate alert</h2>
              <p className="muted">
                A banner will display across the app when the provider portal balance is at or below this
                number.
              </p>
              <ActionForm
                action={saveCertificateAlertThresholdAction}
                submit="Save alert threshold"
              >
                <Field label="Alert at or below portal balance">
                  <input
                    name="threshold"
                    type="number"
                    min="0"
                    max="1000000"
                    step="1"
                    required
                    defaultValue={certStatus?.threshold ?? DEFAULT_CERTIFICATE_THRESHOLD}
                  />
                </Field>
              </ActionForm>
            </section>
          </div>
        </section>
      )}
    </>
  );
}
