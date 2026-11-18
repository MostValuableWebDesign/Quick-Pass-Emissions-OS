import { requireRole } from "@/lib/require-role";
import { automationSettings } from "@/modules/automation/service";
import { reminderKinds } from "@/modules/automation/rules";
import { PageHeader } from "@/components/shared";
import { PolicyForm } from "@/components/phase5-forms";
import { ActionForm, Field } from "@/components/action-form";
import { lowVolumeSettings } from "@/modules/automation/low-volume";
import { saveLowVolumeAlert } from "@/app/low-volume-actions";
import { formatDate } from "@/lib/time";
import { staffingSchedule } from "@/modules/automation/staffing-job";

export default async function AutomationReminders() {
  const user = await requireRole(["OWNER"]);
  const settings = await automationSettings(user.id);
  const staffing = await lowVolumeSettings(user.id);

  return (
    <>
      <PageHeader
        title="Reminder policies"
        description="Configure the automatic reminders and their eligible recipients."
      />
      <section className="card card-body space-bottom" aria-labelledby="staffing-alert-title">
        <h2 id="staffing-alert-title">2 PM staffing alert</h2>
        <p>
          When paid tests are <strong>50 or fewer</strong>, remind me to consider sending Clinton
          home. Free retests and aborted tests are excluded.
        </p>
        <p className="muted">
          2:00 PM local Eastern time · Business operating days only · Closures respected
        </p>
        <ActionForm action={saveLowVolumeAlert} submit="Save staffing alert">
          <Field label="Send alert email to">
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              defaultValue={staffing.settings?.email ?? ""}
              required
              maxLength={254}
            />
          </Field>
          <label>
            <input
              type="checkbox"
              name="active"
              defaultChecked={staffing.settings?.active ?? false}
            />{" "}
            Enable in-app and automatic email alerts for my account
          </label>
        </ActionForm>
        <p className="muted">
          Email sender: qpemissions@gmail.com. Text messages and phone calls are not connected. This
          does not contact Clinton or change employee pay.
        </p>
        <p className="muted">
          Checks can retry until 2:15 PM, counting only tests through 2:00 PM. The alert displays
          the actual check time. Missing, stale or incomplete data never counts as zero.
        </p>
        <details>
          <summary>Unattended schedule setup</summary>
          <p>
            Activate a separate Scheduled deployment in Publishing. Do not replace the web
            deployment. Saving alert settings does not activate the scheduler.
          </p>
          <dl>
            <dt>Schedule</dt>
            <dd>
              <code>{staffingSchedule.cron}</code>
            </dd>
            <dt>Time zone</dt>
            <dd>{staffingSchedule.timezone}</dd>
            <dt>Build command</dt>
            <dd>
              <code>{staffingSchedule.build}</code>
            </dd>
            <dt>Run command</dt>
            <dd>
              <code>{staffingSchedule.run}</code>
            </dd>
          </dl>
          <p className="muted">
            Use the same business database and Gmail connection as the app. Confirm a completed
            check here before relying on alerts. An open workspace is not an independent scheduler.
          </p>
        </details>
        {staffing.latest ? (
          <p role="status">
            Last check: {formatDate(staffing.latest.at)} · {staffing.latest.details.message}
          </p>
        ) : (
          <p role="status">No staffing checks recorded yet.</p>
        )}
      </section>
      <section className="two-columns">
        {reminderKinds.map((kind) => {
          const current = settings.policies.find((policy) => policy.kind === kind);
          return (
            <div className="card card-body" key={kind}>
              <h2>{kind.charAt(0) + kind.slice(1).toLowerCase()}</h2>
              <p className="muted">
                {current
                  ? `Revision ${current.revision}, ${current.active ? "enabled" : "disabled"}.`
                  : "Not configured. Revision 0."}
                {kind === "DEALER" || kind === "RENTAL"
                  ? " Authorized recipients only."
                  : " Bookkeepers cannot receive this."}
              </p>
              <PolicyForm kind={kind} current={current} recipients={settings.recipients} />
            </div>
          );
        })}
      </section>
      <p className="muted space-top">
        Changing a reminder policy resolves existing open reminders of that kind; replacements are
        created on the next run. Numeric fields have no default. Enter each value deliberately.
      </p>
    </>
  );
}
