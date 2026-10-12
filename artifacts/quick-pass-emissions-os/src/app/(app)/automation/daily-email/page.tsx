import Link from "next/link";
import { requireRole } from "@/lib/require-role";
import { ownerEmailSettings } from "@/modules/automation/owner-email";
import { PageHeader } from "@/components/shared";
import { OwnerEmailForm, OwnerEmailRetry } from "@/components/owner-email-forms";
import { fmtInstant } from "@/components/phase5";
export default async function DailyEmail({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireRole(["OWNER"]);
  const s = await ownerEmailSettings(user.id, Number((await searchParams).page ?? 1));
  return (
    <>
      <PageHeader
        title="Daily owner email"
        description="Current-day business report at 6:30 PM Eastern, every day. Daylight saving time follows the business timezone."
      />
      <section className="card card-body">
        <h2>Email delivery setup</h2>
        <p role="status">
          {s.configured
            ? "Email provider configured."
            : "Email setup required: provider key, verified sender and public HTTPS app URL. Delivery is unavailable until configured."}
        </p>
        <p className="muted">
          An independent server scheduler must be configured for delivery. Opening the app does not
          run scheduled email. Accepted means the provider accepted the message; it does not confirm
          inbox delivery.
        </p>
        <OwnerEmailForm setting={s.setting} owners={s.owners} configured={s.configured} />
      </section>
      <section className="card card-body space-top">
        <h2>Report preview</h2>
        <p className="muted">
          Live preview using saved business data. Previewing does not send email. At the scheduled
          run, the report and email copy are saved permanently.
        </p>
        <details>
          <summary>Preview today’s owner report</summary>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "inherit" }}>
            {s.preview}
          </pre>
        </details>
      </section>
      <section className="card card-body space-top">
        <h2>Email history</h2>
        <p className="muted">
          {s.total} emails · 15 per page · Page {s.page} of {s.pages}. Failed attempts retain their
          original report and delivery key. Expired retries require provider review.
        </p>
        {s.deliveries.length ? (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Owner email history">
            <table>
              <caption className="sr-only">Owner email history</caption>
              <thead>
                <tr>
                  {[
                    "Report date",
                    "Recipient",
                    "Status",
                    "Attempts",
                    "Provider accepted",
                    "Details",
                    "Action",
                  ].map((h) => (
                    <th scope="col" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.deliveries.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/automation/daily-email/reports/${d.reportId}`}>
                        {d.reportDate}
                      </Link>
                    </td>
                    <td>{d.toEmail}</td>
                    <td>{d.status.toLowerCase()}</td>
                    <td>{d.attempts}</td>
                    <td>{d.acceptedAt ? fmtInstant(d.acceptedAt) : "—"}</td>
                    <td>{d.failure ?? "—"}</td>
                    <td>{d.status === "FAILED" ? <OwnerEmailRetry id={d.id} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No emails queued yet.</p>
        )}
        <nav aria-label="Email history pagination" className="heading-actions">
          {s.page > 1 ? <Link href={`?page=${s.page - 1}`}>Previous</Link> : null}
          {s.page < s.pages ? <Link href={`?page=${s.page + 1}`}>Next</Link> : null}
        </nav>
      </section>
    </>
  );
}
