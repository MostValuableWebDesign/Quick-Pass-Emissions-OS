import Link from "next/link";
import { requireRole } from "@/lib/require-role";
import { automationSettings } from "@/modules/automation/service";
import { Empty, PageHeader } from "@/components/shared";
import { Badge, ExternalDisabled, fmtInstant, jobTone } from "@/components/phase5";
import { ForecastForm, RetryForm, ScheduleForm } from "@/components/phase5-forms";
export default async function Automation() {
  const user = await requireRole(["OWNER"]);
  const s = await automationSettings(user.id);
  const latest = <T extends { revision: number }>(rows: T[], by: (r: T) => string, key: string) =>
    rows.filter((r) => by(r) === key).sort((a, b) => b.revision - a.revision)[0];
  return (
    <>
      <PageHeader
        title="Schedules"
        description="Summary schedules, forecast windows, and durable job history."
      />
      <section className="card card-body">
        <h2>Daily owner email</h2>
        <p>
          Current-day results at 6:30 PM Eastern. Select recipients, preview the report and review
          email history.
        </p>
        <Link className="button" href="/automation/daily-email">
          Configure daily owner email
        </Link>
      </section>
      <ExternalDisabled />
      <section className="card card-body" aria-labelledby="semantics">
        <h2 id="semantics">How scheduling works</h2>
        <ul className="muted preserve-lines">
          <li>All schedules use America/New_York (Eastern) calendar dates and times.</li>
          <li>
            Missed runs are not skipped: when the system was down, due occurrences are created on
            the next run and each reports its own period.
          </li>
          <li>
            Daylight saving: a time inside the spring gap moves forward; a time repeated in the fall
            overlap uses the earlier instant.
          </li>
          <li>
            Saving creates a new revision. Queued, running and failed jobs of the replaced revision
            are superseded. If another save happened first you must refresh and re-enter.
          </li>
          <li>
            Open days only uses the configured operating days and closures; closed days produce no
            summary.
          </li>
          <li>Numeric fields have no default. Enter each value deliberately.</li>
        </ul>
      </section>
      <section className="two-columns space-top">
        {(["daily", "weekly"] as const).map((k) => {
          const cur = latest(s.schedules, (r) => r.key, k);
          return (
            <div className="card card-body" key={k}>
              <h2>{k === "daily" ? "Daily" : "Weekly"} summary schedule</h2>
              <p className="muted">
                {cur
                  ? `Revision ${cur.revision}, ${cur.active ? "active" : "paused"}, next date ${cur.nextDate}.`
                  : "Not configured. Revision 0."}
              </p>
              <ScheduleForm k={k} current={cur} />
            </div>
          );
        })}
      </section>
      <h2 className="space-top">Inventory forecast policies</h2>
      <section className="two-columns space-top">
        {[{ id: "certificates", name: "Certificates" }, ...s.chemicals].map((c) => {
          const cur = latest(s.forecasts, (r) => r.key, c.id);
          return (
            <div className="card card-body" key={c.id}>
              <h3>{c.name}</h3>
              <p className="muted">
                {cur ? `Revision ${cur.revision}.` : "Not configured. Revision 0."}
              </p>
              <ForecastForm k={c.id} name={c.name} current={cur} />
            </div>
          );
        })}
      </section>
      <section className="card space-top">
        <div className="card-heading">
          <div>
            <h2>Job history</h2>
            <p>Latest 100 jobs. Failed jobs stay failed until you authorize a retry.</p>
          </div>
        </div>
        {s.jobs.length === 0 ? (
          <Empty title="No jobs yet" text="Jobs are created by active schedules." />
        ) : (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Automation jobs">
            <table>
              <caption className="sr-only">Automation jobs</caption>
              <thead>
                <tr>
                  {[
                    "Kind",
                    "Occurrence",
                    "Due",
                    "Status",
                    "Attempts",
                    "Next attempt",
                    "Failure",
                    "Action",
                  ].map((h) => (
                    <th scope="col" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.jobs.map((j) => (
                  <tr key={j.id}>
                    <td>{j.kind}</td>
                    <td>{j.occurrenceDate ?? "None"}</td>
                    <td>{fmtInstant(j.dueAt)}</td>
                    <td>
                      <Badge tone={jobTone(j.status)}>{j.status.toLowerCase()}</Badge>
                    </td>
                    <td>{j.attempts}</td>
                    <td>{fmtInstant(j.nextAttemptAt)}</td>
                    <td>{j.failure ?? ""}</td>
                    <td>{j.status === "FAILED" ? <RetryForm id={j.id} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card space-top">
        <div className="card-heading">
          <div>
            <h2>Delivery history</h2>
            <p>
              Latest 100 in-app deliveries, including revoked entries. Rolled-back delivery failures
              appear in job history above.
            </p>
          </div>
        </div>
        {s.deliveries.length === 0 ? (
          <Empty
            title="No deliveries yet"
            text="Deliveries are recorded when summaries or reminders are created."
          />
        ) : (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Deliveries">
            <table>
              <caption className="sr-only">Deliveries</caption>
              <thead>
                <tr>
                  {["Delivered", "Recipient", "Type", "Status", "Failure"].map((h) => (
                    <th scope="col" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.deliveries.map((d) => (
                  <tr key={d.id}>
                    <td>{fmtInstant(d.deliveredAt)}</td>
                    <td>{s.recipients.find((u) => u.id === d.userId)?.name ?? d.userId}</td>
                    <td>{d.summaryId ? "Summary" : "Reminder"}</td>
                    <td>
                      <Badge tone={jobTone(d.status)}>{d.status.toLowerCase()}</Badge>
                    </td>
                    <td>{d.failure ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
