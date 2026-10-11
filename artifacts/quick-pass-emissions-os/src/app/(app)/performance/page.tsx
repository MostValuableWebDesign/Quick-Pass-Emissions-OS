import { requireRole } from "@/lib/require-role";
import { readDashboard, resolveDashboardQuery } from "@/modules/station/dashboard-service";
import { PerformanceDashboard } from "@/components/performance-dashboard";

type Search = Record<string, string | string[] | undefined>;

export default async function PerformancePage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireRole(["OWNER"]);
  const query = resolveDashboardQuery(await searchParams);
  const initial = await readDashboard(user.id, query);
  return (
    <PerformanceDashboard
      key={`${query.start}:${query.end}:${query.trendDays}:${query.employee ?? ""}`}
      initial={initial}
    />
  );
}
