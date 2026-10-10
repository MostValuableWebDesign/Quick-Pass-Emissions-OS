import { RecordLink } from "@/components/record-link";
import { manager } from "@/lib/access";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared";
import { ActionForm } from "@/components/action-form";
import { EmployeeFields } from "@/components/employee-fields";
import { saveEmployee } from "@/app/actions";
export default async function Employees() {
  const actor = await manager();
  const employees = await db.employee.findMany({
    include: { user: true, _count: { select: { tasks: true, shifts: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return (
    <>
      <PageHeader
        title="The people behind Quick Pass"
        description="Manage your team, responsibilities, and access."
      />
      <details className="card card-body">
        <summary>+ Add an employee</summary>
        <p className="muted">
          Create the employee, then open their profile to issue a private invitation.
        </p>
        <ActionForm action={saveEmployee} submit="Create employee">
          <EmployeeFields owner={actor.role === "OWNER"} />
        </ActionForm>
      </details>
      <section className="card space-top">
        <div className="card-heading">
          <h2>
            Employee directory <span className="count">{employees.length}</span>
          </h2>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th>Status</th>
                <th>Responsibilities</th>
                <th>Schedule records</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td>
                    <RecordLink className="task-name" href={`/employees/${e.id}`}>
                      {e.user.name}
                    </RecordLink>
                    <small>{e.user.email}</small>
                  </td>
                  <td>{e.user.role.toLowerCase()}</td>
                  <td>
                    <span className={`badge ${e.user.active ? "green" : "neutral"}`}>
                      {e.user.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>{e._count.tasks}</td>
                  <td>{e._count.shifts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
