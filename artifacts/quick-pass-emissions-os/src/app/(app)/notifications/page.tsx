import { RecordLink } from "@/components/record-link";
import Link from "next/link";
import { currentUser } from "@/lib/access";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/time";
import { Empty, PageHeader } from "@/components/shared";
import { ActionForm } from "@/components/action-form";
import { markRead } from "@/app/actions";
import { automationInbox } from "@/modules/automation/service";
import { acknowledgePersonalReminderAction, acknowledgeReminderAction } from "@/app/phase5-actions";
import { listPersonalReminders } from "@/modules/automation/personal-reminders";
export default async function Notifications() {
  const actor = await currentUser();
  const inbox = await automationInbox(actor.id);
  const personal = await listPersonalReminders(actor.id);
  const dueEvents = personal.upcoming.filter((reminder) => reminder.alertAt <= new Date());
  const alerts = await db.notification.findMany({
    where: {
      userId: actor.id,
      resolvedAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Your upcoming event alerts and operational notifications."
      />
      <section className="card">
        <div className="card-heading">
          <h2>Event alerts</h2>
          <span className="count">{dueEvents.filter((reminder) => !reminder.readAt).length}</span>
        </div>
        {dueEvents.length ? (
          dueEvents.map((reminder) => (
            <div className="list-row" key={reminder.id}>
              <div>
                <strong>{reminder.title}</strong>
                <small>
                  {formatDate(reminder.startsAt)} · {reminder.readAt ? "Read" : "Alert active"}
                </small>
                {reminder.description && <p className="preserve-lines">{reminder.description}</p>}
                <Link className="text-link" href={`/reminders#${reminder.id}`}>
                  Manage reminder
                </Link>
              </div>
              {!reminder.readAt && (
                <ActionForm
                  action={acknowledgePersonalReminderAction}
                  submit="Mark read"
                  className="inline-form"
                >
                  <input type="hidden" name="id" value={reminder.id} />
                </ActionForm>
              )}
            </div>
          ))
        ) : (
          <Empty
            title="No event alerts"
            text="Scheduled reminders appear here when their alert time arrives."
          />
        )}
      </section>
      <section className="card">
        <div className="card-heading">
          <h2>Operational alerts</h2>
        </div>
        {alerts.length ? (
          alerts.map((a) => (
            <div className="list-row" key={a.id}>
              <div>
                <RecordLink
                  className="task-name"
                  href={
                    a.taskId
                      ? `/tasks/${a.taskId}`
                      : a.maintenanceId
                        ? `/maintenance/${a.maintenanceId}`
                        : a.sensorIncidentId
                          ? "/chemicals#chemical-level-monitoring"
                          : "/dashboard"
                  }
                >
                  {a.title}
                </RecordLink>
                <small>
                  {formatDate(a.createdAt)} · {a.readAt ? "Acknowledged" : "Unread"}
                </small>
              </div>
              {!a.readAt && (
                <ActionForm action={markRead} submit="Acknowledge" className="inline-form">
                  <input type="hidden" name="id" value={a.id} />
                </ActionForm>
              )}
            </div>
          ))
        ) : (
          <Empty
            title="No open alerts"
            text="New alerts appear after an operations check. Review the task list for live overdue status."
          />
        )}
      </section>
      <section className="card space-top">
        <div className="card-heading">
          <h2>Actionable reminders</h2>
          <Link href="/reminders" className="text-link">
            All current reminders
          </Link>
        </div>
        {inbox.reminders.length ? (
          inbox.reminders.map((r) => (
            <div className="list-row" key={r.id}>
              <div>
                <RecordLink href={r.href} className="task-name">
                  {r.title}
                </RecordLink>
                <small>
                  {r.stage} · Due {r.dueDate} · Acknowledgement does not complete the source.
                </small>
              </div>
              {r.acknowledgedAt ? (
                <span>Acknowledged</span>
              ) : (
                <ActionForm
                  action={acknowledgeReminderAction}
                  submit="Acknowledge"
                  className="inline-form"
                >
                  <input type="hidden" name="id" value={r.id} />
                </ActionForm>
              )}
            </div>
          ))
        ) : (
          <Empty
            title="No current actionable reminders"
            text="Owner-configured reminders appear after an independent operations check. Source changes and current permissions are checked again on read."
          />
        )}
      </section>
      {actor.role === "OWNER" && (
        <section className="card space-top">
          <div className="card-heading">
            <h2>Scheduled summary deliveries</h2>
            <Link href="/summaries" className="text-link">
              Summary archive
            </Link>
          </div>
          {inbox.summaries.length ? (
            inbox.summaries.map((d) => (
              <div className="list-row" key={d.id}>
                <RecordLink href={`/summaries/${d.summaryId}`} className="task-name">
                  Historical summary: {d.summary?.periodStart} to {d.summary?.periodEnd}
                </RecordLink>
                <small>
                  Delivered {formatDate(d.deliveredAt)}. Captured figures, not live values.
                </small>
              </div>
            ))
          ) : (
            <Empty
              title="No scheduled summaries delivered"
              text="Configure a schedule and arrange an independent trigger. A page visit never generates a summary."
            />
          )}
        </section>
      )}
    </>
  );
}
