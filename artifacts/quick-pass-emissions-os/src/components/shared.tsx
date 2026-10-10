import { RecordLink } from "@/components/record-link";
import type { TaskInstance } from "@prisma/client";
import { ArrowRight, CheckCircle2, Clock3, AlertCircle } from "lucide-react";
import { formatDate } from "@/lib/time";
import { overdue } from "@/lib/policy";
export function PageHeader({
  eyebrow = "QUICK PASS OPERATIONS",
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <CheckCircle2 size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export function Status({ task }: { task: Pick<TaskInstance, "status" | "dueAt"> }) {
  const late = overdue(task.status, task.dueAt);
  return (
    <span
      className={`badge ${late ? "danger" : task.status === "COMPLETED" ? "green" : task.status === "BLOCKED" ? "amber" : "neutral"}`}
    >
      {late ? (
        <AlertCircle size={12} />
      ) : task.status === "COMPLETED" ? (
        <CheckCircle2 size={12} />
      ) : (
        <Clock3 size={12} />
      )}{" "}
      {late ? "Overdue" : task.status.toLowerCase().replaceAll("_", " ")}
    </span>
  );
}
export function TaskTable({
  tasks,
}: {
  tasks: (TaskInstance & { employee: { user: { name: string } } })[];
}) {
  if (!tasks.length)
    return (
      <Empty
        title="Nothing here yet"
        text="Assigned responsibilities will appear here once tasks are scheduled."
      />
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Responsibility</th>
            <th>Assigned to</th>
            <th>Due · Eastern</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>
                <RecordLink className="task-name" href={`/tasks/${t.id}`}>
                  {t.title}
                </RecordLink>
                <small className={`priority priority-${t.priority.toLowerCase()}`}>
                  {t.priority.toLowerCase()} priority
                </small>
              </td>
              <td>
                <span className="person">
                  <span className="avatar tiny">{t.employee.user.name.slice(0, 1)}</span>
                  {t.employee.user.name}
                </span>
              </td>
              <td className="nowrap">{formatDate(t.dueAt)}</td>
              <td>
                <Status task={t} />
              </td>
              <td>
                <RecordLink aria-label={`Open ${t.title}`} href={`/tasks/${t.id}`}>
                  <ArrowRight size={17} />
                </RecordLink>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export const employeeSelect = { id: true, user: { select: { name: true } } } as const;
