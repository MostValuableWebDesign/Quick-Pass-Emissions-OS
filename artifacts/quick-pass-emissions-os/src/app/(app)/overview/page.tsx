import Link from "next/link";
import { requireRole } from "@/lib/require-role";
import { ownerOverview } from "@/modules/automation/service";
import { PageHeader } from "@/components/shared";
import { Boundary, InventoryTable, ItemsTable, fmtInstant } from "@/components/phase5";
export default async function Overview() {
  const user = await requireRole(["OWNER"]);
  const data = await ownerOverview(user.id);
  const counts = new Map<string, number>();
  for (const i of data.items) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  return (
    <>
      <PageHeader
        title="Live owner exceptions"
        description={`Generated ${fmtInstant(data.generatedAt)} Eastern. Business date ${data.today}.`}
      >
        <Link className="button button-outline" href="/summaries">
          Historical summaries
        </Link>
      </PageHeader>
      <Boundary>{data.limits}</Boundary>
      <section aria-label="Exception counts" className="stats-grid">
        <div className="card stat-card">
          <span className="muted">Total exceptions</span>
          <h2>{data.items.length}</h2>
        </div>
        {[...counts].map(([k, v]) => (
          <div className="card stat-card" key={k}>
            <span className="muted">{k}</span>
            <h2>{v}</h2>
          </div>
        ))}
      </section>
      <section className="card space-top">
        <div className="card-heading">
          <h2>Exceptions needing attention</h2>
          <span className="count">{data.items.length}</span>
        </div>
        <ItemsTable items={data.items} />
      </section>
      <section className="card space-top">
        <div className="card-heading">
          <div>
            <h2>Inventory depletion estimates</h2>
            <p>
              Estimates from recorded consumption only; not purchasing advice. Configure windows in{" "}
              <Link className="text-link" href="/automation">
                automation settings
              </Link>
              .
            </p>
          </div>
        </div>
        <InventoryTable inventory={data.inventory} />
      </section>
    </>
  );
}
