import Link from "next/link";
import { requireRole } from "@/lib/require-role";
import { summaryArchive } from "@/modules/automation/service";
import { Empty, PageHeader } from "@/components/shared";
import { Boundary, Phase5Nav, fmtInstant } from "@/components/phase5";
export default async function Summaries() {
  const user = await requireRole(["OWNER"]);
  const list = await summaryArchive(user.id);
  return (
    <>
      <PageHeader
        title="Consolidated summary archive"
        description="Immutable snapshots captured when each scheduled summary ran."
      />
      <Phase5Nav role={user.role} />
      <Boundary>
        Each summary is a historical snapshot, not current figures or frozen books. For current
        state use <Link href="/overview">live exceptions</Link>.
      </Boundary>
      <section className="card">
        <div className="card-heading">
          <h2>Saved summaries</h2>
          <span className="count">{list.length}</span>
        </div>
        {list.length === 0 ? (
          <Empty
            title="No summaries yet"
            text="Summaries appear after an active schedule runs. Check automation settings and job history."
          />
        ) : (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Saved summaries">
            <table>
              <caption className="sr-only">Saved summaries</caption>
              <thead>
                <tr>
                  <th scope="col">Generated</th>
                  <th scope="col">Period (Eastern dates)</th>
                  <th scope="col">Snapshot</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td>{fmtInstant(s.generatedAt)}</td>
                    <td>
                      {s.periodStart} to {s.periodEnd}
                    </td>
                    <td>
                      <Link className="text-link" href={`/summaries/${s.id}`}>
                        Open snapshot
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
