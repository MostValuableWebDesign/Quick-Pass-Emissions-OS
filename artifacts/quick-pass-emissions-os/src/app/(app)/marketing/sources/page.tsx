import Link from "next/link";
import { requireRole } from "@/lib/require-role";
import { businessDate } from "@/lib/time";
import { marketingOverview } from "@/modules/marketing/service";
import { recordServiceSource, recordSource } from "@/app/marketing-actions";
import { ActionForm, Field } from "@/components/action-form";
import { PageHeader, Empty } from "@/components/shared";
import { Boundary } from "@/components/phase5";
import { SourceCampaignFields } from "@/components/marketing-client";
import { MarketingTabs, StatusBadge, sourceLabel, sourceOptions } from "@/components/marketing";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function Sources({ searchParams }: { searchParams: Search }) {
  const user = await requireRole(["OWNER", "ADMIN"]);
  const sp = await searchParams;
  const today = businessDate();
  const start = one(sp.start) || `${today.slice(0, 8)}01`;
  const end = one(sp.end) || today;
  let data;
  let error = "";
  try {
    data = await marketingOverview(user.id, { start, end });
  } catch (e) {
    error = e instanceof Error ? e.message : "Unable to load sources.";
  }
  const header = (
    <>
      <PageHeader
        eyebrow="MARKETING · SOURCES"
        title="Customer sources"
        description="Record what the customer said. Never guess a campaign; promo code attribution is tracked separately and automatically."
      />
      <MarketingTabs current="/marketing/sources" />
    </>
  );
  if (!data)
    return (
      <>
        {header}
        <div className="notice warning">
          {error} <Link href="/marketing/sources">Reset</Link>
        </div>
      </>
    );
  const all = data.campaigns;
  const campaigns = all.filter((c) => c.status !== "ARCHIVED");
  const name = (cid: string | null | undefined) =>
    cid ? (all.find((c) => c.id === cid)?.name ?? "Campaign") : "None stated";
  return (
    <>
      {header}
      <form className="card card-body mk-filter" method="get">
        <label className="field">
          <span>From</span>
          <input type="date" name="start" defaultValue={start} required />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" name="end" defaultValue={end} required />
        </label>
        <div className="mk-filter-actions">
          <button className="button button-primary">Apply</button>
        </div>
      </form>

      {data.isOwner && (
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>
                Station evidence <span className="count">{data.records.length}</span>
              </h2>
              <p>
                Current station records in the period. Owner only. Detail pages also capture
                sources.
              </p>
            </div>
          </div>
          {data.records.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Record</th>
                    <th>Reported source</th>
                    <th>Named campaign</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((r) => (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td>
                        <Link className="task-name" href={`/performance/tests/${r.id}`}>
                          {r.outcome}
                        </Link>
                        <small>{r.id}</small>
                      </td>
                      <td>
                        {sourceLabel(r.observation?.source)}
                        {r.observation?.evidence && <small>{r.observation.evidence}</small>}
                      </td>
                      <td>{name(r.observation?.campaignId)}</td>
                      <td>
                        <details>
                          <summary>{r.observation ? "Update" : "Record"}</summary>
                          <ActionForm action={recordSource} submit="Save source">
                            <input type="hidden" name="recordId" value={r.id} />
                            <input
                              type="hidden"
                              name="version"
                              value={r.observation?.version ?? 0}
                            />
                            <SourceCampaignFields
                              sources={sourceOptions}
                              campaigns={campaigns}
                              source={r.observation?.source ?? ""}
                              campaignId={r.observation?.campaignId ?? ""}
                            />
                            <Field label="Evidence · optional" wide>
                              <input
                                name="evidence"
                                maxLength={2000}
                                defaultValue={r.observation?.evidence ?? ""}
                              />
                            </Field>
                          </ActionForm>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No station records in this period"
              text="Imported station evidence appears here once reviewed."
            />
          )}
        </section>
      )}

      <section className="card space-top">
        <div className="card-heading">
          <div>
            <h2>
              Dealership single services <span className="count">{data.serviceRecords.length}</span>
            </h2>
            <p>
              Active quantity-1 services only. Batches cannot carry source data. Paid classification
              needs evidence.
            </p>
          </div>
        </div>
        {data.serviceRecords.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Service</th>
                  <th>Reported source</th>
                  <th>Named campaign</th>
                  <th>Classification</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.serviceRecords.map((s) => {
                  const o = s.observation;
                  return (
                    <tr key={s.id}>
                      <td>{s.date}</td>
                      <td>
                        {s.description}
                        <small>{s.reference}</small>
                      </td>
                      <td>
                        {sourceLabel(o?.source)}
                        {o?.evidence && <small>{o.evidence}</small>}
                      </td>
                      <td>{name(o?.campaignId)}</td>
                      <td>
                        <StatusBadge status={o?.inspectionKind ?? "UNKNOWN"} />
                      </td>
                      <td>
                        <details>
                          <summary>{o ? "Update" : "Record"}</summary>
                          <ActionForm action={recordServiceSource} submit="Save source">
                            <input type="hidden" name="serviceId" value={s.id} />
                            <input type="hidden" name="version" value={o?.version ?? 0} />
                            <SourceCampaignFields
                              sources={sourceOptions}
                              campaigns={campaigns}
                              source={o?.source ?? ""}
                              campaignId={o?.campaignId ?? ""}
                            />
                            <Field label="Inspection classification">
                              <select
                                name="inspectionKind"
                                defaultValue={o?.inspectionKind ?? "UNKNOWN"}
                              >
                                <option value="UNKNOWN">Unknown</option>
                                <option value="PAID">Paid inspection · needs evidence</option>
                                <option value="OTHER">Other service</option>
                              </select>
                            </Field>
                            <Field label="Evidence">
                              <input
                                name="evidence"
                                maxLength={2000}
                                defaultValue={o?.evidence ?? ""}
                              />
                            </Field>
                          </ActionForm>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No single services in this period"
            text="Record a quantity-1 completed service on a dealership account first."
          />
        )}
      </section>
      <Boundary>
        Unknown or missing responses cannot be assigned to a campaign. A promo code applied to a
        service attributes it automatically and is reported apart from what the customer said. No
        customer records are created.
      </Boundary>
    </>
  );
}
