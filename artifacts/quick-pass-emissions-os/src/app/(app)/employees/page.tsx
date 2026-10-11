import Link from "next/link";
import { RecordLink } from "@/components/record-link";
import { manager } from "@/lib/access";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared";
import { ActionForm } from "@/components/action-form";
import { EmployeeFields } from "@/components/employee-fields";
import { saveEmployee } from "@/app/actions";
export default async function Employees({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const actor = await manager();
  const employees = await db.employee.findMany({
    include: { user: true, _count: { select: { tasks: true, shifts: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const requested = (await searchParams).status;
  const status = requested === "inactive" || requested === "all" ? requested : "active";
  const shown = employees.filter((e) =>
    status === "all" ? true : e.user.active === (status === "active"),
  );
  return (
    <>
      <PageHeader
        title="Employees"
        description="Staff records for management’s payroll, schedules, and responsibilities. Only owners and managers can sign in."
      />
      <nav className="filter-tabs" aria-label="Employee status filters">
        {[
          ["active", "Active staff"],
          ["inactive", "Removed staff"],
          ["all", "All staff"],
        ].map(([value, label]) => (
          <Link
            key={value}
            href={value === "active" ? "/employees" : `/employees?status=${value}`}
            aria-current={status === value ? "page" : undefined}
            className={`badge ${status === value ? "green" : "neutral"}`}
          >
            {label}
          </Link>
        ))}
        <Link href="/payroll" className="badge neutral">Manage pay & commissions</Link>
      </nav>
      {status !== "inactive" && <details className="card card-body space-top">
        <summary>+ Add an employee</summary>
        <p className="muted">
          Staff records have no login. Owners can also provision Owner or Manager access.
        </p>
        <ActionForm action={saveEmployee} submit="Create employee">
          <EmployeeFields owner={actor.role === "OWNER"} />
        </ActionForm>
      </details>}
      <section className="card space-top">
        <div className="card-heading">
          <h2>
            Employee directory <span className="count">{shown.length}</span>
          </h2>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>App access</th>
                <th>Status</th>
                <th>Responsibilities</th>
                <th>Schedule records</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td>
                    <RecordLink className="task-name" href={`/employees/${e.id}`}>
                      {e.user.name}
                    </RecordLink>
                    <small>{e.user.email}</small>
                  </td>
                  <td>
                    {e.user.role === "OWNER"
                      ? "Owner"
                      : e.user.role === "ADMIN"
                        ? "Manager"
                        : "No app access"}
                  </td>
                  <td>
                    <span className={`badge ${e.user.active ? "green" : "neutral"}`}>
                      {e.user.active ? "Active" : "Removed"}
                    </span>
                  </td>
                  <td>{e._count.tasks}</td>
                  <td>{e._count.shifts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && (
          <p className="card-body muted">
            {status === "inactive" ? "No removed employees." : "No employees in this view."}
          </p>
        )}
      </section>
    </>
  );
}
