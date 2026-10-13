import { PayrollAdjustments } from "@/components/payroll-adjustments";
import { currentUser } from "@/lib/access";
import { payrollOverview } from "@/modules/payroll/service";
import { employeePayOverview, payOverviewInput } from "@/modules/payroll/overview";
import { PayrollSummary } from "@/components/payroll-summary";
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
    start?: string;
    end?: string;
    weekStart?: string;
    employeesPage?: string;
    historyPage?: string;
    periodsPage?: string;
  }>;
}) {
  const actor = await currentUser();
  const params = await searchParams;
  const data = await payrollOverview(actor.id, params);
  const parsed = payOverviewInput.safeParse(params);
  const dashboard = await employeePayOverview(actor.id, parsed.success ? parsed.data : {}, actor.role === "OWNER");
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
        description="Employee daily and weekly pay and calculated commissions."
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
          Choose a valid date or range ending today or earlier. Showing today.
        </p>
      )}
      <PayrollSummary data={dashboard} href={href} />
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
    </>
  );
}
