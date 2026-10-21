import { requireRole } from "@/lib/require-role";
import { db } from "@/lib/db";
import { readDashboard, resolveDashboardQuery } from "@/modules/station/dashboard-service";
import { PerformanceDashboard } from "@/components/performance-dashboard";
import { normalizeDashboardLayout } from "@/components/performance-dashboard-layout";
import { BusinessError } from "@/modules/phase2";

type Search = Record<string, string | string[] | undefined>;

export default async function PerformancePage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireRole(["OWNER"]);
  const query = resolveDashboardQuery(await searchParams);
  let initial;
  let savedLayout;
  try {
    [initial, savedLayout] = await Promise.all([
      readDashboard(user.id, query),
      db.performancePanelLayout.findUnique({
        where: { userId: user.id },
        select: { layout: true },
      }),
    ]);
  } catch (error) {
    if (!(error instanceof BusinessError)) throw error;
    const params = new URLSearchParams({
      period: "7",
      ...(query.employee ? { employee: query.employee } : {}),
    });
    return (
      <section className="panel">
        <h1>Performance</h1>
        <p role="alert">{error.message}</p>
        <a href={`/performance?${params}`}>Return to a shorter trend</a>
      </section>
    );
  }
  return (
    <PerformanceDashboard
      key={`${user.id}:${query.start}:${query.end}:${query.trendDays}:${query.employee ?? ""}`}
      initial={initial}
      initialLayout={normalizeDashboardLayout(savedLayout?.layout)}
      layoutAccountId={user.id}
    />
  );
}
