import Link from "next/link";
import { currentUser } from "@/lib/access";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/time";
import { Empty, PageHeader } from "@/components/shared";
import { ActionForm } from "@/components/action-form";
import { markRead } from "@/app/actions";
export default async function Notifications() {
  const actor = await currentUser();
  const alerts = await db.notification.findMany({
    where: {
      userId: actor.id,
      resolvedAt: null,
      ...(actor.role === "EMPLOYEE"
        ? { task: { employeeId: actor.employee?.id ?? "none" } }
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
                <Link className="task-name" href={a.taskId ? `/tasks/${a.taskId}` : "/dashboard"}>
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
    </>
  );
}
