import Link from "next/link";
import { currentUser } from "@/lib/access";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/time";
import { Empty, PageHeader } from "@/components/shared";
import { ActionForm } from "@/components/action-form";
import { markRead } from "@/app/actions";
import { automationInbox } from "@/modules/automation/service";
import { acknowledgeReminderAction } from "@/app/phase5-actions";
export default async function Notifications() {
  const actor = await currentUser();
  const inbox = await automationInbox(actor.id);
  const alerts = await db.notification.findMany({
    where: {
      userId: actor.id,
      resolvedAt: null,
      ...(actor.role === "EMPLOYEE"
        ? {
            OR: [
              { task: { employeeId: actor.employee?.id ?? "none" } },
              { maintenance: { assignedId: actor.employee?.id ?? "none" } },
            ],
          }
        : actor.role === "BOOKKEEPER"
          ? { id: "none" }
          : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <>
      <PageHeader
        title="Your attention, where it matters"
        description="Operational alerts from the scheduled operations check. Latest 100 unresolved alerts."
      />
      <section className="card">
        {alerts.length ? (
          alerts.map((a) => (
            <div className="list-row" key={a.id}>
              <div>
                <Link
                  className="task-name"
                  href={
                    a.taskId
                      ? `/tasks/${a.taskId}`
                      : a.maintenanceId
                        ? `/maintenance/${a.maintenanceId}`
                        : "/dashboard"
                  }
                >
                  {a.title}
                </Link>
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
                <Link href={r.href} className="task-name">
                  {r.title}
                </Link>
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
                <Link href={`/summaries/${d.summaryId}`} className="task-name">
                  Historical summary: {d.summary?.periodStart} to {d.summary?.periodEnd}
                </Link>
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
