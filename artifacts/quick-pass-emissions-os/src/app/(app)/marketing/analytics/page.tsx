import { requireRole } from "@/lib/require-role";
import { businessDate } from "@/lib/time";
import { marketingOverview } from "@/modules/marketing/service";
import { PageHeader } from "@/components/shared";
import { MarketingTabs } from "@/components/marketing";

export default async function Analytics() {
  const user = await requireRole(["OWNER", "ADMIN"]);
  const today = businessDate();
  const data = await marketingOverview(user.id, { start: today, end: today });
  return (
    <>
      <PageHeader
        eyebrow="MARKETING · GOOGLE BUSINESS"
        title="Google Business Profile"
        description="Profile analytics and reviews would live here once an authorized connection exists."
      />
      <MarketingTabs current="/marketing/analytics" />
      <section className="card card-body mk-boundary">
        <span className="badge neutral">Not connected</span>
        <h2>No profile data is available</h2>
        <p>{data.analytics.reason}</p>
        <ul>
          <li>
            No views, searches, calls, direction requests or website clicks are shown, because none
            are collected.
          </li>
          <li>No reviews are imported, summarized or grouped into themes.</li>
          <li>Review replies are not drafted or published from this app.</li>
          <li>
            Connecting requires the owner to authorize Google access in a separate setup step.
          </li>
        </ul>
        <p className="muted">
          Until then, “Google Search / Maps” answers recorded on station evidence and dealership
          services are the only Google signal, and they appear under Customer sources.
        </p>
      </section>
    </>
  );
}
