import { RecordLink } from "./record-link";
import { PayrollDateFilter } from "./payroll-date-filter";
import { PayrollPagination } from "./payroll-pagination";
import { formatMoney } from "@/modules/payroll/calculations";
import { businessDate } from "@/lib/time";
import type { employeePayOverview } from "@/modules/payroll/overview";

type Overview = Awaited<ReturnType<typeof employeePayOverview>>;
const money = (n: number | null) => n === null ? "Unavailable" : formatMoney(n);

export function PayrollSummary({
  data, href,
}: { data: Overview; href: (key: string, page: number) => string }) {
  return (
    <section className="card space-top" aria-label="Employee pay overview">
      <div className="card-heading"><h2>Employee pay overview</h2></div>
      <PayrollDateFilter key={`${data.selection.start}:${data.selection.end}`}
        start={data.selection.start} end={data.selection.end} today={businessDate()} />
      <p className="card-body muted">
        {data.selection.range ? "Selected range" : "Selected day"}: {data.selection.start}
        {data.selection.range && ` — ${data.selection.end}`}
        {" · "}Week to date: {data.week.start} — {data.week.end > businessDate() ? businessDate() : data.week.end}
      </p>
      <PayrollPagination label="Employees" paging={data.employeesPaging}
        href={(page) => href("employeesPage", page)} />
      <div className="table-scroll">
        <table aria-label="Employee pay summary">
          <thead><tr>
            <th>Employee</th>
            <th>Base pay · daily / weekly</th>
            <th>Commission · {data.selection.range ? "range" : "daily"} / weekly</th>
            <th>Average daily recorded commission</th>
            <th>Commission rate</th>
          </tr></thead>
          <tbody>
            {data.employees.filter((employee) => employee.active).map((employee) => (
              <tr key={employee.id}>
                <td>
                  <RecordLink href={`/employees/${employee.id}`}>{employee.name}</RecordLink>
                  {!employee.active && <small>Inactive</small>}
                </td>
                <td><strong>{money(employee.base.daily)} / {money(employee.base.weekly)}</strong></td>
                <td>{money(employee.commission.daily)} / {money(employee.commission.weekly)}</td>
                <td>
                  {money(employee.commission.average)}
                  {employee.commission.recordedDays > 0 &&
                    <small>Across {employee.commission.recordedDays} recorded working days
                      {data.selection.range ? " in range" : " this week"}</small>}
                  {employee.commission.missingDays > 0 &&
                    <small>{employee.commission.missingDays} days pending data · recorded totals only</small>}
                </td>
                <td>{employee.rate
                  ? employee.rate.eligible
                    ? `${formatMoney(employee.rate.rateCents)} / ${employee.rate.attribution === "SHOP_WIDE_APPROVED_DAILY" ? "shop car" : "test"} above ${employee.rate.threshold} per day`
                    : "Not eligible"
                  : "Unavailable"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.employees.some((employee) => employee.active) &&
        <p className="card-body muted">No active employees to display.</p>}
    </section>
  );
}
