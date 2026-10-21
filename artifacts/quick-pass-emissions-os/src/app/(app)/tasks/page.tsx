import Link from "next/link";
import { Prisma } from "@prisma/client";
import { currentUser } from "@/lib/access";
import { db } from "@/lib/db";
import { isManager } from "@/lib/policy";
import { PageHeader, TaskTable, employeeSelect } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { WorkspaceTabs } from "@/components/manager-workspace";
import { businessDate, dueInstant, addDays } from "@/lib/time";
export default async function Tasks({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const user = await currentUser();
  const management = isManager(user.role);
  const query = await searchParams;
  const filter = query.filter ?? "active";
  const page = Math.max(1, Math.min(10000, Math.floor(Number(query.page)) || 1));
  const today = businessDate();
  const where: Prisma.TaskInstanceWhereInput = {};
  if (filter === "overdue") {
    where.dueAt = { lt: new Date() };
    where.status = { notIn: ["COMPLETED", "CANCELLED"] };
  } else if (filter === "completed") where.status = "COMPLETED";
  else if (filter === "cancelled") where.status = "CANCELLED";
  else if (filter === "today")
    where.dueAt = { gte: dueInstant(today, "00:00"), lt: dueInstant(addDays(today, 1), "00:00") };
  else if (filter === "review") {
    where.status = "COMPLETED";
    where.reviewRequired = true;
    where.reviewedAt = null;
  } else where.status = { notIn: ["COMPLETED", "CANCELLED"] };
  const [tasks, count] = await Promise.all([
    db.taskInstance.findMany({
      where,
      include: { employee: { select: employeeSelect } },
      orderBy: { dueAt: "asc" },
      take: 50,
      skip: (page - 1) * 50,
    }),
    db.taskInstance.count({ where }),
  ]);
  return (
    <>
      <PageHeader
        title="Team responsibilities"
        description="Clear ownership. A complete record of every task."
      >
        {management && (
          <Button asChild>
            <Link href="/tasks/templates">Manage recurring duties</Link>
          </Button>
        )}
      </PageHeader>
      {management && <WorkspaceTabs active="responsibilities" />}
      <nav className="tabs" aria-label="Task filters">
        {[
          "active",
          "today",
          "overdue",
          "completed",
          ...(management ? ["review", "cancelled"] : []),
        ].map((f) => (
          <Link className={f === filter ? "selected" : ""} href={`/tasks?filter=${f}`} key={f}>
            {f === "review" ? "Awaiting review" : f}
          </Link>
        ))}
      </nav>
      <section className="card">
        <div className="card-heading">
          <h2>{count} responsibilities</h2>
          <span className="muted">Page {page}</span>
        </div>
        <TaskTable tasks={tasks} />
      </section>
      <div className="pagination">
        {page > 1 && <Link href={`/tasks?filter=${filter}&page=${page - 1}`}>← Previous</Link>}
        {page * 50 < count && <Link href={`/tasks?filter=${filter}&page=${page + 1}`}>Next →</Link>}
      </div>
    </>
  );
}
