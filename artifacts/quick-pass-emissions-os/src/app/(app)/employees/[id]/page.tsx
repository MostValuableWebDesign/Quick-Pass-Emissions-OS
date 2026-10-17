import { notFound } from "next/navigation";
import { manager } from "@/lib/access";
import { db } from "@/lib/db";
import { canManageRole } from "@/lib/policy";
import { PageHeader, TaskTable, employeeSelect } from "@/components/shared";
import { ActionForm } from "@/components/action-form";
import { EmployeeFields } from "@/components/employee-fields";
import { saveEmployee, setEmployeeActive } from "@/app/actions";
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
        description={`${employee.jobRole || "Employee"} · ${employee.user.active ? "Active" : "Inactive"}`}
      />
      {canManageRole(actor.role, employee.user.role) ? (
        <section className="card card-body">
          <h2>Employee profile</h2>
          <ActionForm action={saveEmployee}>
            <input type="hidden" name="id" value={employee.id} />
            <EmployeeFields employee={employee} />
          </ActionForm>
          <div className="account-actions">
            {employee.userId !== actor.id && (
              <ActionForm
                action={setEmployeeActive}
                submit={employee.user.active ? "Remove from active staff" : "Restore employee"}
                confirmOnSubmit={
                  employee.user.active
                    ? `Remove ${employee.user.name} from active staff? Their employee record and payroll history will be kept, and they can be restored later.`
                    : undefined
                }
              >
                <input type="hidden" name="id" value={employee.id} />
                <input type="hidden" name="active" value={String(!employee.user.active)} />
              </ActionForm>
            )}
          </div>
          <p className="muted">
            Removing an employee makes their record inactive; it does not delete payroll, schedules
            or operational history. Find them in Removed staff to restore them later.
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
