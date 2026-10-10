import { notFound } from "next/navigation";
import { manager } from "@/lib/access";
import { db } from "@/lib/db";
import { canManageRole } from "@/lib/policy";
import { PageHeader, TaskTable, employeeSelect } from "@/components/shared";
import { ActionForm } from "@/components/action-form";
import { EmployeeFields } from "@/components/employee-fields";
import { issueInvite, saveEmployee, setEmployeeActive } from "@/app/actions";
export default async function EmployeeDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await manager();
  const employee = await db.employee.findUnique({
    where: { id: (await params).id },
    include: { user: true, shifts: { orderBy: { date: "desc" }, take: 14 } },
  });
  if (!employee) notFound();
  const tasks = await db.taskInstance.findMany({
    where: { employeeId: employee.id },
    include: { employee: { select: employeeSelect } },
    orderBy: { dueAt: "desc" },
    take: 30,
  });
  return (
    <>
      <PageHeader
        title={employee.user.name}
        description={`${employee.user.role.toLowerCase()} · ${employee.user.active ? "Active" : "Inactive"}`}
      />
      {canManageRole(actor.role, employee.user.role) ? (
        <section className="card card-body">
          <h2>Employee profile</h2>
          <ActionForm action={saveEmployee}>
            <input type="hidden" name="id" value={employee.id} />
            <EmployeeFields employee={employee} owner={actor.role === "OWNER"} />
          </ActionForm>
          <div className="account-actions">
            <ActionForm action={issueInvite} submit="Issue private invitation">
              <input type="hidden" name="id" value={employee.id} />
            </ActionForm>
            <ActionForm
              action={setEmployeeActive}
              submit={employee.user.active ? "Deactivate employee" : "Reactivate employee"}
            >
              <input type="hidden" name="id" value={employee.id} />
              <input type="hidden" name="active" value={String(!employee.user.active)} />
            </ActionForm>
          </div>
          <p className="muted">
            Deactivation revokes sessions and invitations. Existing tasks and shifts remain visible
            for manager reassignment.
          </p>
        </section>
      ) : (
        <p className="notice">Only an owner may edit this account.</p>
      )}
      <section className="card space-top">
        <div className="card-heading">
          <h2>Recent schedules</h2>
        </div>
        {employee.shifts.map((s) => (
          <div className="list-row" key={s.id}>
            <strong>{s.date}</strong>
            <span>
              {s.startTime}–{s.endTime} ET
            </span>
            <span>{s.duties}</span>
          </div>
        ))}
      </section>
      <section className="card space-top">
        <div className="card-heading">
          <h2>Latest 30 responsibilities</h2>
        </div>
        <TaskTable tasks={tasks} />
      </section>
    </>
  );
}
