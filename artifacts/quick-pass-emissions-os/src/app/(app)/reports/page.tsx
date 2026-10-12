import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { businessDate } from "@/lib/time";
import { getOperationalReport } from "@/modules/automation/reports";
import { operationalDatasets, type OperationalDataset } from "@/modules/automation/reports";
import { BusinessError } from "@/modules/phase2";
import { PageHeader } from "@/components/shared";
import { Boundary, ErrorPanel, RowsTable, TotalsList, fmtInstant } from "@/components/phase5";
import { Phase5Field as Field } from "@/components/phase5-field";
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ dataset?: string; start?: string; end?: string }>;
}) {
  const user = await requireRole(["OWNER", "ADMIN"]);
  const q = await searchParams;
  const allowed = [...operationalDatasets];
  const dataset = (allowed.find((d) => d === q.dataset) ?? allowed[0]) as OperationalDataset;
  const end = q.end ?? businessDate();
  const start = q.start ?? `${end.slice(0, 7)}-01`;
  let report: Awaited<ReturnType<typeof getOperationalReport>> | null = null;
  let error: string | null = null;
  try {
    if (q.dataset && !allowed.includes(q.dataset as OperationalDataset)) {
      throw new BusinessError("Requested report is invalid or not allowed for your current role.");
    }
    report = await getOperationalReport(user.id, { dataset, start, end });
  } catch (e) {
    error =
      e instanceof BusinessError
        ? e.message
        : e instanceof z.ZodError
          ? "Enter valid dates: start on or before end, within 366 days, not in the future."
          : "Unable to load this report. Refresh and try again.";
  }
  const exportUrl = `/api/reports/export?dataset=${dataset}&start=${start}&end=${end}`;
  return (
    <>
      <PageHeader
        title="Operational reports"
        description="Entered operational records by Eastern date range. Not complete frozen books."
      />
      <section className="card card-body">
        <form method="get" className="form-grid" aria-label="Report filters">
          <Field label="Report">
            <select name="dataset" defaultValue={dataset}>
              {allowed.map((d) => (
                <option key={d} value={d}>
                  {d.replaceAll("-", " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start date">
            <input type="date" name="start" defaultValue={start} max={businessDate()} required />
          </Field>
          <Field label="End date">
            <input type="date" name="end" defaultValue={end} max={businessDate()} required />
          </Field>
          <div className="form-footer">
            <button className="button button-primary">Run report</button>
          </div>
        </form>
      </section>
      {error && <ErrorPanel message={error} />}
      {report && (
        <>
          <Boundary>{report.semantics}</Boundary>
          <p className="muted">
            Generated {fmtInstant(report.generatedAt)} Eastern. {report.limits}
          </p>
          <div className="space-top">
            <TotalsList totals={report.totals} />
          </div>
          <section className="card space-top">
            <div className="card-heading">
              <div>
                <h2>{dataset.replaceAll("-", " ")}</h2>
                <p>
                  The table displays up to 100 rows. Totals and the CSV export cover all{" "}
                  {report.rows.length} matching rows.
                </p>
              </div>
              <a className="button button-outline" href={exportUrl}>
                Download CSV (all rows)
              </a>
            </div>
            <RowsTable rows={report.rows} caption={`${dataset} report rows`} />
          </section>
        </>
      )}
    </>
  );
}
