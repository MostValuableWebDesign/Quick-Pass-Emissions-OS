import { PayrollAdjustments } from "@/components/payroll-adjustments";
import { currentUser } from "@/lib/access";
import { payrollOverview } from "@/modules/payroll/service";
import { dashboardInput, payrollDashboard } from "@/modules/payroll/dashboard";
import { PayrollSummary, PayrollHistory } from "@/components/payroll-summary";
import { PageHeader } from "@/components/shared";
import { PayrollPaySetup } from "@/components/payroll-pay-setup";
import { readDashboard, resolveDashboardQuery } from "@/modules/station/dashboard-service";

export default async function Payroll({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    status?: string;
    periodId?: string;
    date?: string;
    weekStart?: string;
    employeesPage?: string;
    historyPage?: string;
    periodsPage?: string;
  }>;
}) {
  const actor = await currentUser();
  const params = await searchParams;
  const data = await payrollOverview(actor.id, params);
  const parsed = dashboardInput.safeParse(params);
  const dashboard = await payrollDashboard(actor.id, parsed.success ? parsed.data : {});
  const paySetup =
    actor.role === "OWNER" ? await readDashboard(actor.id, resolveDashboardQuery({})) : null;
  const href = (key: string, page: number) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
    query.set(key, String(page));
    return `/payroll?${query}`;
  };

  return (
    <>
      <PageHeader
        title="Payroll & commissions"
        description="Employee daily and weekly pay, recorded commissions and transaction history."
      >
        {paySetup && <PayrollPaySetup initial={paySetup} />}
      </PageHeader>
      {data.employees.some((employee) => employee.demo) && (
        <div className="notice warning">
          DEMONSTRATION WORKSPACE · Illustrative payroll and stock records. These are not actual
          business records.
        </div>
      )}
      {!parsed.success && (
        <p className="notice warning">
          Choose a valid pay overview date and week start. Showing the current week.
        </p>
      )}
      {actor.role === "OWNER" && (
        <PayrollAdjustments
          key={`${dashboard.employeesPaging.page}:${dashboard.filter.date}`}
          data={dashboard}
          query={new URLSearchParams(
            Object.entries(params).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          ).toString()}
        />
      )}
      <PayrollSummary data={dashboard} href={href} />
      <PayrollHistory
        data={dashboard}
        names={Object.fromEntries(
          data.employees.map((employee) => [employee.id, employee.user.name]),
        )}
        href={(page) => href("historyPage", page)}
      />
    </>
  );
}
