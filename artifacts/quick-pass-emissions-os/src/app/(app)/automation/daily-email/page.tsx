import Link from "next/link";
import { requireRole } from "@/lib/require-role";
import { ownerEmailSettings } from "@/modules/automation/owner-email";
import { PageHeader } from "@/components/shared";
import { OwnerEmailForm, OwnerEmailRetry } from "@/components/owner-email-forms";
import { fmtInstant } from "@/components/phase5";
import {
  estimatedOwnerEmailScheduleCost,
  ownerEmailCadenceExamples,
} from "@/modules/automation/owner-email-costs";
export default async function DailyEmail({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireRole(["OWNER"]);
  const s = await ownerEmailSettings(user.id, Number((await searchParams).page ?? 1));
  const missing: string[] = [];
  if (!s.emailSetup.providerKeySet) missing.push("Resend API key");
  if (!s.emailSetup.senderAddressFormatValid) missing.push("valid sender address");
  if (!s.emailSetup.publicHttpsUrlSet) missing.push("published HTTPS app URL");
  const statusRows = [
    {
      item: "Resend API key",
      status: s.emailSetup.providerKeySet ? "Saved privately in Replit Secrets" : "Not supplied",
    },
    {
      item: "Sender address",
      status: s.emailSetup.senderAddressFormatValid
        ? "Saved; address hidden"
        : "Missing or invalid",
    },
    {
      item: "Resend domain verification",
      status: "Not checked by this app; confirm directly in Resend",
    },
    {
      item: "Published HTTPS app URL",
      status: s.emailSetup.publicHttpsUrlSet
        ? "Valid HTTPS origin saved"
        : "Waiting for publication",
    },
    {
      item: "Daily owner report",
      status: !s.setting?.active
        ? "Paused; no automatic sends"
        : s.configured
          ? "Enabled"
          : "Blocked by incomplete provider setup",
    },
    { item: "Scheduled deployment", status: "On hold; not configured" },
    { item: "Schedule frequency", status: "Not selected" },
  ];
  const formatUsd = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  return (
    <>
      <PageHeader
        title="Daily owner email"
        description="Current-day business report at 6:30 PM Eastern, every day. Daylight saving time follows the business timezone."
      />
      <section className="card card-body">
        <h2>Current setup status</h2>
        <p role="status" aria-live="polite">
          {s.configured
            ? "Provider settings are ready. Automatic delivery is on hold until a scheduled job is set up."
            : `Delivery is on hold. Still needed: ${missing.join(", ")}.`}
        </p>
        <div className="table-scroll" role="region" aria-label="Email setup status" tabIndex={0}>
          <table>
            <caption className="sr-only">Daily owner email setup checklist</caption>
            <thead>
              <tr>
                <th scope="col">Setup item</th>
                <th scope="col">Current status</th>
              </tr>
            </thead>
            <tbody>
              {statusRows.map(({ item, status }) => (
                <tr key={item}>
                  <th scope="row">{item}</th>
                  <td>{status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          The sender address stays hidden. This app checks its format but cannot verify the sending
          domain in Resend. Replit manages Scheduled Deployments separately; this page cannot read
          their status. When setup resumes, the prepared owner-email-only command is{" "}
          <code>pnpm --filter @workspace/quick-pass-emissions-os run owner-email-job</code>. No
          schedule has been selected.
        </p>
        <OwnerEmailForm setting={s.setting} owners={s.owners} configured={s.configured} />
      </section>
      <section className="card card-body space-top">
        <h2>Scheduled-job compute reference</h2>
        <p>
          No owner-email Scheduled Deployment has run. These examples assume 50,000 compute units
          (CUs) per run, matching the example in Replit’s pricing documentation; this app’s actual
          CU usage has not been measured.
        </p>
        <div
          className="table-scroll"
          role="region"
          aria-label="Illustrative scheduled deployment costs"
          tabIndex={0}
        >
          <table>
            <caption className="sr-only">
              Example monthly costs if each scheduled job run uses 50,000 compute units
            </caption>
            <thead>
              <tr>
                <th scope="col">Possible schedule</th>
                <th scope="col">Runs / 30 days</th>
                <th scope="col">Example total / month</th>
              </tr>
            </thead>
            <tbody>
              {ownerEmailCadenceExamples.map(({ cadence, runsPer30Days }) => (
                <tr key={cadence}>
                  <th scope="row">{cadence}</th>
                  <td>{runsPer30Days.toLocaleString("en-US")}</td>
                  <td>{formatUsd(estimatedOwnerEmailScheduleCost(runsPer30Days))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Replit lists a $1 monthly Scheduled Deployment base fee plus $3.20 per million CUs. The
          examples include the base fee; actual charges depend on measured usage and the chosen
          schedule. This job has no selected frequency. See{" "}
          <a
            href="https://docs.replit.com/billing/deployment-pricing"
            target="_blank"
            rel="noopener noreferrer"
          >
            Replit deployment pricing
          </a>
          . Provider acceptance does not confirm inbox delivery.
        </p>
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
