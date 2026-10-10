import { RecordLink } from "@/components/record-link";
import { currentUser } from "@/lib/access";
import { remindersForUser } from "@/modules/automation/service";
import { ActionForm } from "@/components/action-form";
import { Empty, PageHeader } from "@/components/shared";
import { Badge, ExternalDisabled, fmtInstant } from "@/components/phase5";
import { acknowledgeReminderAction } from "@/app/phase5-actions";
export default async function Reminders() {
  const user = await currentUser();
  const list = await remindersForUser(user.id);
  return (
    <>
      <PageHeader
        title="My reminders"
        description="In-app reminders addressed to you. Acknowledging only records that you saw it."
      />
      <ExternalDisabled />
      <div className="notice">
        Acknowledging does not complete the underlying work. A reminder clears on its own only when
        the source record is actually resolved; complete it from the linked record.
      </div>
      <section className="card">
        <div className="card-heading">
          <h2>Open reminders</h2>
          <span className="count">{list.length}</span>
        </div>
        {list.length === 0 ? (
          <Empty
            title="No open reminders"
            text="Nothing currently requires your attention under the owner's reminder policies."
          />
        ) : (
          list.map((r) => (
            <div className="list-row" key={r.id}>
              <div>
                <strong>{r.title}</strong>
                <small>
                  Due {r.dueDate} · created {fmtInstant(r.createdAt)}
                </small>
                <RecordLink className="text-link" href={r.href}>
                  Open source record
                </RecordLink>
              </div>
              <div>
                <Badge
                  tone={
                    r.stage === "ESCALATED" ? "danger" : r.stage === "OVERDUE" ? "amber" : "neutral"
                  }
                >
                  {r.stage.toLowerCase()}
                </Badge>{" "}
                {r.acknowledgedAt ? (
                  <Badge tone="green">Acknowledged {fmtInstant(r.acknowledgedAt)}</Badge>
                ) : (
                  <ActionForm
                    className="inline-form"
                    action={acknowledgeReminderAction}
                    submit="Acknowledge"
                  >
                    <input type="hidden" name="id" value={r.id} />
                  </ActionForm>
                )}
              </div>
            </div>
          ))
        )}
      </section>
    </>
  );
}
