import { requireRole } from "@/lib/require-role";
import { db } from "@/lib/db";
import { readDashboard, resolveDashboardQuery } from "@/modules/station/dashboard-service";
import { PerformanceDashboard } from "@/components/performance-dashboard";
import { normalizeDashboardLayout } from "@/components/performance-dashboard-layout";

type Search = Record<string, string | string[] | undefined>;

export default async function PerformancePage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireRole(["OWNER"]);
  const query = resolveDashboardQuery(await searchParams);
  const [initial, savedLayout] = await Promise.all([
    readDashboard(user.id, query),
    db.performancePanelLayout.findUnique({
      where: { userId: user.id },
      select: { layout: true },
    }),
  ]);
  return (
    <PerformanceDashboard
      key={`${query.start}:${query.end}:${query.trendDays}:${query.employee ?? ""}`}
      initial={initial}
      initialLayout={normalizeDashboardLayout(savedLayout?.layout)}
    />
  );
}
