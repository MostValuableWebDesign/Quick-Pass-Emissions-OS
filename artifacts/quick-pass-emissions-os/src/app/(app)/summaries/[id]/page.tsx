import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/require-role";
import { summaryDetail } from "@/modules/automation/service";
import { BusinessError } from "@/modules/phase2";
import { PageHeader } from "@/components/shared";
import {
  Boundary,
  InventoryTable,
  ItemsTable,
  RowsTable,
  TotalsList,
  ErrorPanel,
  fmtInstant,
} from "@/components/phase5";
import { parseSnapshot } from "@/components/phase5-snapshot";
export default async function SummaryDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["OWNER"]);
  const { id } = await params;
  let summary;
  try {
    summary = await summaryDetail(user.id, id);
  } catch (e) {
    if (e instanceof BusinessError) notFound();
    throw e;
  }
  const parsed = parseSnapshot(summary.payload);
  return (
    <>
      <PageHeader
        title={`Summary ${summary.periodStart} to ${summary.periodEnd}`}
        description={`Captured ${fmtInstant(summary.generatedAt)} Eastern. Immutable.`}
      >
        <Link className="button button-outline" href="/overview">
          Open live overview (current data)
        </Link>
      </PageHeader>
      {!parsed.success ? (
        <ErrorPanel message="This snapshot's stored content does not match the expected format and cannot be displayed safely." />
      ) : (
        <Snap data={parsed.data} />
      )}
    </>
  );
}
function Snap({ data }: { data: NonNullable<ReturnType<typeof parseSnapshot>["data"]> }) {
  const s = data.schedule;
  return (
    <>
      <Boundary>
        <strong>{data.label}</strong>. Figures below were fixed at {fmtInstant(data.generatedAt)}{" "}
        for business date {data.today} and do not change. Links open records in their current state.
      </Boundary>
      <section className="card card-body">
        <h2>Schedule and boundaries</h2>
        <p className="muted">
          {s.frequency} at {s.time}
          {s.weekday ? `, weekday ${s.weekday}` : ""} Eastern, revision {s.revision},{" "}
          {s.openDaysOnly ? "open days only" : "all days"}. Reporting window{" "}
          {fmtInstant(data.reportingBoundaries.start)} to before{" "}
          {fmtInstant(data.reportingBoundaries.endExclusive)}.
          {data.scheduledOccurrence
            ? ` Scheduled for ${fmtInstant(data.scheduledOccurrence)}.`
            : ""}
        </p>
      </section>
      <section className="card space-top">
        <div className="card-heading">
          <h2>Exceptions at generation</h2>
          <span className="count">{data.items.length}</span>
        </div>
        <ItemsTable items={data.items} />
      </section>
      <section className="card space-top">
        <div className="card-heading">
          <h2>Inventory estimates at generation</h2>
        </div>
        <InventoryTable inventory={data.inventory} />
      </section>
      {data.reports.map((r) => (
        <section className="card space-top" key={r.dataset}>
          <div className="card-heading">
            <div>
              <h2>{r.dataset.replaceAll("-", " ")} report</h2>
              <p>
                {r.start} to {r.end}. {r.semantics}
              </p>
            </div>
          </div>
          <div className="card-body">
            <TotalsList totals={r.totals} />
            <p className="muted space-top">{r.limits}</p>
          </div>
          <details className="card-body">
            <summary>Captured rows ({r.rows.length})</summary>
            <RowsTable rows={r.rows} caption={`${r.dataset} captured rows`} />
          </details>
        </section>
      ))}
    </>
  );
}
