import { requireRole } from "@/lib/require-role";
import { automationSettings } from "@/modules/automation/service";
import { reminderKinds } from "@/modules/automation/rules";
import { PageHeader } from "@/components/shared";
import { PolicyForm } from "@/components/phase5-forms";

export default async function AutomationReminders() {
  const user = await requireRole(["OWNER"]);
  const settings = await automationSettings(user.id);

  return (
    <>
      <PageHeader
        title="Reminder policies"
        description="Configure the automatic reminders and their eligible recipients."
      />
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
