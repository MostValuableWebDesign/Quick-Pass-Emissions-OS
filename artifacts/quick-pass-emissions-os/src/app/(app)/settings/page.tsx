import { manager } from "@/lib/access";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/time";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { removeClosure, saveClosure, saveSettings } from "@/app/actions";
import { saveCertificateAlertThresholdAction } from "@/app/certificate-portal-actions";
import { readCertificatePortalStatus } from "@/modules/certificates/portal";
import { DEFAULT_CERTIFICATE_THRESHOLD } from "@/modules/certificates/portal-types";
import Link from "next/link";
import { AUDIT_PAGE_SIZE, getAuditPagination } from "@/lib/audit-pagination";

export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ auditPage?: string | string[] }>;
}) {
  const actor = await manager();
  const { auditPage: requestedAuditPage } = await searchParams;
  const certStatus =
    actor.role === "OWNER" ? await readCertificatePortalStatus().catch(() => null) : null;
  const [settings, closures, auditCount] = await Promise.all([
    db.businessSetting.findUnique({ where: { id: "business" } }),
    db.closure.findMany({ orderBy: { date: "asc" } }),
    db.auditLog.count(),
  ]);
  const auditPage = getAuditPagination(auditCount, requestedAuditPage);
  const audit = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    skip: auditPage.skip,
    take: AUDIT_PAGE_SIZE,
    include: { actor: { select: { name: true } } },
  });
  return (
    <>
      <PageHeader
        title="Business settings"
        description="Manage operating days, certificate alerts, and audit history."
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
              <p className="muted">Low-certificate alerts.</p>
            </div>
          </div>
          <div className="settings-card-grid">
            <section className="card card-body">
              <h2>Low certificate alert</h2>
              <p className="muted">
                Show a banner across the app when the provider portal balance is at or below this
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
      <section className="settings-group">
        <div className="settings-group-heading">
          <div>
            <h2>Recent activity</h2>
          </div>
        </div>
        <section className="card">
          <div className="card-heading">
            <h2>Audit history</h2>
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
          <nav className="pagination audit-pagination" aria-label="Audit history pages">
            <span className="muted">
              Showing {auditPage.rangeStart}–{auditPage.rangeEnd} of {auditCount}
            </span>
            <div className="audit-pagination-controls">
              {auditPage.page > 1 ? (
                <Link
                  className="button button-outline"
                  href={
                    auditPage.page === 2 ? "/settings" : `/settings?auditPage=${auditPage.page - 1}`
                  }
                  rel="prev"
                >
                  Previous
                </Link>
              ) : (
                <span className="button button-outline" aria-disabled="true">
                  Previous
                </span>
              )}
              <span className="muted" aria-current="page">
                Page {auditPage.page} of {auditPage.pageCount}
              </span>
              {auditPage.page < auditPage.pageCount ? (
                <Link
                  className="button button-outline"
                  href={`/settings?auditPage=${auditPage.page + 1}`}
                  rel="next"
                >
                  Next
                </Link>
              ) : (
                <span className="button button-outline" aria-disabled="true">
                  Next
                </span>
              )}
            </div>
          </nav>
        </section>
      </section>
    </>
  );
}
