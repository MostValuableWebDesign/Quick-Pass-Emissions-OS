import Link from "next/link";
import { RecordLink } from "@/components/record-link";
import { manager } from "@/lib/access";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared";
import { ActionForm } from "@/components/action-form";
import { EmployeeFields } from "@/components/employee-fields";
import { saveEmployee } from "@/app/actions";
import { formatContactAddress } from "@/lib/contact-address";
export default async function Employees({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await manager();
  const employees = await db.employee.findMany({
    include: { user: true },
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
        description="Employee contacts, job roles, and active staff."
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
      {status !== "inactive" && (
        <details className="card dealership-add-card space-top">
          <summary className="button button-primary dealership-add-toggle">
            <span>Add employee</span>
          </summary>
          <div className="card-body">
            <ActionForm action={saveEmployee} submit="Create employee">
              <EmployeeFields />
            </ActionForm>
          </div>
        </details>
      )}
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
                <th>Role</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td>
                    <RecordLink className="task-name" href={`/employees/${e.id}`}>
                      {e.user.name}
                    </RecordLink>
                  </td>
                  <td>{e.jobRole || "—"}</td>
                  <td>{e.phone ? <a href={`tel:${e.phone}`}>{e.phone}</a> : "—"}</td>
                  <td className="preserve-lines">{formatContactAddress(e) || "—"}</td>
                  <td>
                    <span className={`badge ${e.user.active ? "green" : "neutral"}`}>
                      {e.user.active ? "Active" : "Removed"}
                    </span>
                  </td>
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
