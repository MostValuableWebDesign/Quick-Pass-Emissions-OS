import Link from "next/link";
import { Prisma } from "@prisma/client";
import { CheckCheck, Clock3, AlertTriangle, Users, ArrowUpRight, CalendarDays } from "lucide-react";
import { currentUser } from "@/lib/access";
import { db } from "@/lib/db";
import { isManager } from "@/lib/policy";
import { businessDate, dueInstant, addDays, formatDate } from "@/lib/time";
import { PageHeader, TaskTable, employeeSelect } from "@/components/shared";
import { maintenanceSummary } from "@/modules/maintenance/service";
import { certificateOverview } from "@/modules/certificates/service";
import { Button } from "@/components/ui/button";
export default async function Dashboard() {
  const user = await currentUser();
  const management = isManager(user.role);
  if (user.role === "BOOKKEEPER")
    return (
      <>
        <PageHeader
          title="Welcome to Quick Pass"
          description="Prepare payroll, certificates, dealership invoices, rental receipts and finance records."
        />
        <section className="card card-body">
          <h2>Payroll preparation</h2>
          <p>
            Review approved source records and prepare payroll drafts for independent manager or
            owner approval.
          </p>
          <Link className="text-link" href="/payroll">
            Open payroll & commissions →
          </Link>
          <Link className="text-link" href="/certificates">
            Open certificate records →
          </Link>
          <Link className="text-link" href="/rentals">
            Open detailing rental records →
          </Link>
          <Link className="text-link" href="/dealerships">
            Open dealerships & invoices →
          </Link>
          <Link className="text-link" href="/finance">
            Open operational finance & reports →
          </Link>
        </section>
      </>
    );
  const certificates = management ? await certificateOverview(user.id) : null;
  const maintenance = management ? await maintenanceSummary(user.id) : null;
  const today = businessDate();
  const now = new Date();
  const start = dueInstant(today, "00:00");
  const end = dueInstant(addDays(today, 1), "00:00");
  const scope: Prisma.TaskInstanceWhereInput = management
    ? {}
    : { employeeId: user.employee?.id ?? "none" };
  const [todays, lateCount, shifts, activity, upcoming, settings, demoCount, run] =
    await Promise.all([
      db.taskInstance.findMany({
        where: { ...scope, dueAt: { gte: start, lt: end } },
        include: { employee: { select: employeeSelect } },
        orderBy: { dueAt: "asc" },
      }),
      db.taskInstance.count({
        where: { ...scope, dueAt: { lt: now }, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      }),
      db.employeeSchedule.findMany({
        where: { date: today, ...(management ? {} : { employeeId: user.employee?.id ?? "none" }) },
        include: { employee: { select: { user: { select: { name: true, active: true } } } } },
        orderBy: { startTime: "asc" },
      }),
      db.taskEvent.findMany({
        where: { task: scope },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          actorName: true,
          action: true,
          createdAt: true,
          task: { select: { id: true, title: true } },
        },
      }),
      db.taskInstance.findMany({
        where: { ...scope, dueAt: { gte: end }, status: { notIn: ["COMPLETED", "CANCELLED"] } },
        include: { employee: { select: employeeSelect } },
        orderBy: { dueAt: "asc" },
        take: 5,
      }),
      db.businessSetting.findUnique({ where: { id: "business" } }),
      db.employee.count({ where: { demo: true } }),
      management ? db.jobRun.findFirst({ orderBy: { startedAt: "desc" } }) : null,
    ]);
  const completed = todays.filter((t) => t.status === "COMPLETED").length;
  const active = todays.filter((t) => t.status !== "CANCELLED").length;
  return (
    <>
      <PageHeader
        title="Your operations, at a glance."
        description={new Intl.DateTimeFormat("en-US", {
          dateStyle: "full",
          timeZone: "America/New_York",
        }).format(now)}
      >
        {management && (
          <Button asChild>
            <Link href="/tasks/templates">+ Create a responsibility</Link>
          </Button>
        )}
      </PageHeader>
      {demoCount > 0 && (
        <div className="notice">
          DEMONSTRATION WORKSPACE · Sample employees and operations. These are not actual business
          records.
        </div>
      )}
      {!settings?.configured && (
        <div className="notice warning">
          Business operating days are not configured.{" "}
          {management ? (
            <Link href="/settings">Complete setup to start scheduling →</Link>
          ) : (
            "Ask your manager to complete setup."
          )}
        </div>
      )}
      {management &&
        certificates &&
        (!certificates.stock || !certificates.settings || certificates.estimate?.low) && (
          <div className="notice warning">
            <Link href="/certificates">
              {!certificates.stock || !certificates.settings
                ? "Certificate inventory setup requires a physical count and owner-confirmed ordering settings."
                : `Certificate reorder needed: ${certificates.stock.balance} recorded in stock.`}{" "}
              Review certificates →
            </Link>
          </div>
        )}
      {maintenance && (
        <section className="card card-body space-top">
          <h2>Carwash & maintenance</h2>
          <p>
            {maintenance.openTickets} open tickets · {maintenance.overdueTickets} overdue ·{" "}
            {maintenance.offlineBays} bays offline · {maintenance.lowChemicals} supplies at low
            recorded stock.
          </p>
          {maintenance.configuredBays < 6 || maintenance.unknownBays > 0 ? (
            <p className="notice warning">
              Confirm the six-bay layout and inspect unknown bay conditions.
            </p>
          ) : null}
          <div className="module-links">
            <Link href="/carwash">Review bays →</Link>
            <Link href="/maintenance">Review maintenance →</Link>
            <Link href="/chemicals">Review chemical stock →</Link>
          </div>
        </section>
      )}
      <section className="stats" aria-label="Operations metrics">
        {[
          {
            label: "Due today",
            value: active,
            note: "Scheduled responsibilities",
            icon: CalendarDays,
            color: "blue",
          },
          {
            label: "Completed today",
            value: completed,
            note: `${active ? Math.round((completed / active) * 100) : 0}% of today's responsibilities`,
            icon: CheckCheck,
            color: "green",
          },
          {
            label: "Overdue tasks",
            value: lateCount,
            note: lateCount ? "Need follow-up" : "No overdue responsibilities",
            icon: AlertTriangle,
            color: "orange",
          },
          {
            label: management ? "Today's coverage" : "Your shifts today",
            value: shifts.length,
            note: "Scheduled employee shifts",
            icon: Users,
            color: "purple",
          },
        ].map((m) => (
          <article className="stat" key={m.label}>
            <div className="stat-top">
              <span>{m.label}</span>
              <span className={`stat-icon ${m.color}`}>
                <m.icon size={19} />
              </span>
            </div>
            <strong>{m.value}</strong>
            <small>{m.note}</small>
          </article>
        ))}
      </section>
      <div className="dashboard-grid">
        <div className="stack">
          <section className="card">
            <div className="card-heading">
              <div>
                <h2>
                  Today’s responsibilities <span className="count">{todays.length}</span>
                </h2>
                <p>Keep the day moving, one task at a time.</p>
              </div>
              <Link className="text-link" href="/tasks">
                View all <ArrowUpRight size={15} />
              </Link>
            </div>
            <TaskTable tasks={todays} />
          </section>
          <section className="card">
            <div className="card-heading">
              <div>
                <h2>Coming up next</h2>
                <p>A look ahead at your upcoming responsibilities.</p>
              </div>
              <Clock3 size={19} />
            </div>
            <TaskTable tasks={upcoming} />
          </section>
        </div>
        <div className="stack">
          <section className={`attention-card ${lateCount ? "has-alert" : ""}`}>
            <AlertTriangle size={23} />
            <h2>{lateCount ? "A little attention needed" : "Keep an eye on the details"}</h2>
            <p>
              {lateCount
                ? `${lateCount} overdue responsibilities need follow-up.`
                : "Review blocked work and upcoming responsibilities before the next shift."}
            </p>
            <Link href="/tasks?filter=overdue">
              Review exceptions <ArrowUpRight size={15} />
            </Link>
          </section>
          <section className="card">
            <div className="card-heading">
              <h2>On the schedule</h2>
              <span className="badge neutral">Today</span>
            </div>
            <div className="card-body">
              {shifts.length ? (
                shifts.map((s) => (
                  <div className="coverage-row" key={s.id}>
                    <span className="avatar">{s.employee.user.name[0]}</span>
                    <div>
                      <strong>
                        {s.employee.user.name}
                        {!s.employee.user.active && " · inactive"}
                      </strong>
                      <small>{s.duties || "No duties specified"}</small>
                    </div>
                    <span>
                      {s.startTime}–{s.endTime}
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted">No shifts recorded for today.</p>
              )}
            </div>
          </section>
          <section className="card">
            <div className="card-heading">
              <h2>Recent activity</h2>
            </div>
            <div className="card-body timeline">
              {activity.length ? (
                activity.map((a) => (
                  <div key={a.id}>
                    <span className="timeline-dot" />
                    <p>
                      <strong>{a.actorName}</strong> · {a.action.toLowerCase().replaceAll("_", " ")}
                      <Link href={`/tasks/${a.task.id}`}>{a.task.title}</Link>
                      <small>{formatDate(a.createdAt)}</small>
                    </p>
                  </div>
                ))
              ) : (
                <p className="muted">Task activity will appear here.</p>
              )}
            </div>
          </section>
        </div>
      </div>
      {management && (
        <p className="footnote">
          Last operations check:{" "}
          {run ? `${formatDate(run.startedAt)} · ${run.status.toLowerCase()}` : "Not run yet"}.
          Dashboard counts use current database records.{" "}
          <Link href="/settings">Manage scheduler</Link>
        </p>
      )}
    </>
  );
}
