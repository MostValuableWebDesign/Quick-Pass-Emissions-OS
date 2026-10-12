import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/require-role";
import { addDays, businessDate } from "@/lib/time";
import { marketingOverview } from "@/modules/marketing/service";
import * as act from "@/app/marketing-actions";
import { ActionForm } from "@/components/action-form";
import { MarketingField as Field } from "@/components/marketing-field";
import { PageHeader, Empty } from "@/components/shared";
import { Boundary } from "@/components/phase5";
import { DirectoryAddDialog } from "@/components/directory-add-dialog";
import { PromoValueFields } from "@/components/marketing-client";
import {
  CampaignForm,
  Cents,
  MarketingTabs,
  Metric,
  StatusBadge,
  centsInput,
  channelLabels,
} from "@/components/marketing";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
type Baseline = {
  recordedAt?: string;
  periodStart?: string;
  periodEnd?: string;
  spendingCents?: number;
  attributedPaidInspections?: number;
  collectedCents?: number;
  coverage?: { recordedInspections?: number; completeDays?: number; totalDays?: number };
};

export default async function Campaign({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Search;
}) {
  const user = await requireRole(["OWNER", "ADMIN"]);
  const { id } = await params;
  const sp = await searchParams;
  const today = businessDate();
  const probe = await marketingOverview(user.id, { start: today, end: today, campaignId: id });
  const base = probe.campaigns.find((c) => c.id === id);
  if (!base) notFound();
  const defEnd = base.endDate < today ? base.endDate : today;
  let start = one(sp.start) || (base.startDate <= defEnd ? base.startDate : defEnd);
  let end = one(sp.end) || defEnd;
  if (end < start) end = start;
  if (end > addDays(start, 365)) start = addDays(end, -365);
  const data = await marketingOverview(user.id, { start, end, campaignId: id });
  const c = data.campaigns.find((x) => x.id === id)!;
  const r = data.report;
  const owner = data.isOwner;
  const editable = owner && c.status !== "ARCHIVED";
  const redemptionsByCode = new Map<string, number>();
  for (const x of r.redemptions)
    redemptionsByCode.set(x.code, (redemptionsByCode.get(x.code) ?? 0) + 1);
  const spent = c.expenses.filter((e) => !e.voidedAt).reduce((n, e) => n + e.amountCents, 0);

  return (
    <>
      <PageHeader
        eyebrow={`MARKETING · ${channelLabels[c.channel as keyof typeof channelLabels] ?? c.channel}`}
        title={c.name}
        description={
          <>
            <StatusBadge status={c.status} /> {c.startDate} to {c.endDate} · budget{" "}
            <Cents cents={c.budgetCents} /> · recorded spending <Cents cents={spent} />
          </>
        }
      >
        {editable && (
          <DirectoryAddDialog title="Edit campaign">
            <CampaignForm campaign={c} station={data.station} today={today} />
          </DirectoryAddDialog>
        )}
      </PageHeader>
      <MarketingTabs current="" />
      {c.offer && <p className="mk-offer">{c.offer}</p>}
      {c.status === "ARCHIVED" && (
        <div className="notice warning">
          Archived. History is kept read-only. Create a new campaign to run it again.
        </div>
      )}

      <form className="card card-body mk-filter" method="get">
        <label className="field">
          <span>Review from</span>
          <input type="date" name="start" defaultValue={start} required />
        </label>
        <label className="field">
          <span>Review to</span>
          <input type="date" name="end" defaultValue={end} required />
        </label>
        <div className="mk-filter-actions">
          <button className="button button-primary">Show results</button>
        </div>
      </form>
      {r.coverage.partial && (
        <div className="notice warning">
          Partial period: {r.coverage.completeDays} of {r.coverage.totalDays} days have complete
          reviewed imports. {r.coverage.missing + r.coverage.unknown} of{" "}
          {r.coverage.recordedInspections} recorded inspections have no known source.
        </div>
      )}
      <section className="mk-metrics">
        <Metric
          label="Attributed paid inspections"
          value={r.attributedPaidInspections}
          note={`${r.freeRetests} free retests and ${r.unclassifiedInspections} unclassified excluded.`}
        />
        <Metric
          label="Spending in period"
          value={<Cents cents={r.spendingCents} />}
          note="Non-voided expenses dated in the review period."
        />
        <Metric
          label="Cost per attributed paid inspection"
          value={
            r.costPerAttributedPaidCents === null ? (
              "Not available"
            ) : (
              <Cents cents={r.costPerAttributedPaidCents} />
            )
          }
          note="Not ROI, profit or incremental revenue."
        />
        <Metric
          label="Receipt-linked collected revenue"
          value={<Cents cents={r.collectedCents} />}
          note="Verified individually linked retail receipts plus proportional net-of-tax invoice receipts, dated in this period; reversals subtract. Not a Performance estimate."
        />
      </section>

      {/* Expenses */}
      <section className="card space-top">
        <div className="card-heading">
          <div>
            <h2>
              Spending <span className="count">{c.expenses.length}</span>
            </h2>
            <p>Each expense needs a unique reference. Void with a reason; history is kept.</p>
          </div>
          {editable && (
            <DirectoryAddDialog title="Record expense">
              <ActionForm action={act.recordExpense} submit="Record expense">
                <input type="hidden" name="campaignId" value={c.id} />
                <input type="hidden" name="stationHash" value={data.station.hash} />
                <Field label="Date">
                  <input
                    type="date"
                    name="date"
                    required
                    defaultValue={today}
                    min={c.startDate}
                    max={c.endDate < today ? c.endDate : today}
                  />
                </Field>
                <Field label="Amount · USD">
                  <input name="amount" inputMode="decimal" pattern="\d{1,8}(\.\d{1,2})?" required />
                </Field>
                <Field label="Description">
                  <input name="description" required maxLength={160} />
                </Field>
                <Field label="Receipt / invoice reference · unique">
                  <input name="reference" required maxLength={160} />
                </Field>
              </ActionForm>
            </DirectoryAddDialog>
          )}
        </div>
        {c.expenses.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {c.expenses.map((e) => (
                  <tr key={e.id}>
                    <td>{e.date}</td>
                    <td>{e.description}</td>
                    <td>{e.reference}</td>
                    <td className={e.voidedAt ? "mk-strike" : ""}>
                      <Cents cents={e.amountCents} />
                    </td>
                    <td>
                      {e.voidedAt ? (
                        <>
                          <StatusBadge status="VOIDED" />
                          <small>{e.voidReason}</small>
                        </>
                      ) : owner ? (
                        <details>
                          <summary>Void</summary>
                          <ActionForm action={act.voidExpense} submit="Void expense">
                            <input type="hidden" name="id" value={e.id} />
                            <Field label="Reason">
                              <input name="reason" required maxLength={160} />
                            </Field>
                          </ActionForm>
                        </details>
                      ) : (
                        <StatusBadge status="RECORDED" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No spending recorded"
            text="Record an expense with its receipt reference."
          />
        )}
      </section>

      {/* Promo codes */}
      <section className="card space-top">
        <div className="card-heading">
          <div>
            <h2>
              Promo codes <span className="count">{c.promos.length}</span>
            </h2>
            <p>
              Applied only by the owner on single services. Once redeemed, terms are frozen;
              deactivate and create a new code to change them.
            </p>
          </div>
          {editable && (
            <DirectoryAddDialog title="New promo code">
              <PromoForm campaign={c} station={data.station.hash} />
            </DirectoryAddDialog>
          )}
        </div>
        {c.promos.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Offer</th>
                  <th>Valid</th>

                  <th>Lifetime uses / limit</th>
                  <th>Uses in review period</th>
                  <th>State</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {c.promos.map((p) => (
                  <tr key={p.id}>
                    <td className="mk-code">{p.code}</td>
                    <td>
                      {p.kind === "PERCENT" ? (
                        `${p.value / 100}% off`
                      ) : (
                        <>
                          <Cents cents={p.value} /> off
                        </>
                      )}
                    </td>
                    <td className="nowrap">
                      {p.startDate} to {p.endDate}
                    </td>
                    <td>
                      {p._count.redemptions} / {p.usageLimit}
                      {p._count.redemptions > 0 && <small>Terms frozen</small>}
                    </td>
                    <td>{redemptionsByCode.get(p.code) ?? 0}</td>
                    <td>
                      <StatusBadge status={p.active ? "ACTIVE" : "INACTIVE"} />
                    </td>
                    <td>
                      {editable && (
                        <details>
                          <summary>Edit</summary>
                          <PromoForm campaign={c} station={data.station.hash} promo={p} />
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No promo codes"
            text="Codes give automatic attribution when the owner applies them to a service."
          />
        )}
      </section>

      {/* Actions */}
      <section className="card space-top">
        <div className="card-heading">
          <div>
            <h2>
              Planned actions & reviews <span className="count">{c.actions.length}</span>
            </h2>
            <p>
              The baseline is frozen when an action is created. Compare it with the current report
              for the same period.
            </p>
          </div>
          {editable && (
            <DirectoryAddDialog title="Plan an action">
              <ActionForm action={act.saveAction} submit="Save action">
                <input type="hidden" name="campaignId" value={c.id} />
                <input type="hidden" name="version" value={0} />
                <input type="hidden" name="status" value="PLANNED" />
                <Field label="Title">
                  <input name="title" required maxLength={160} />
                </Field>
                <Field label="Review on">
                  <input type="date" name="reviewDate" required defaultValue={addDays(today, 14)} />
                </Field>
                <Field label="Measure period start">
                  <input type="date" name="periodStart" required defaultValue={c.startDate} />
                </Field>
                <Field label="Measure period end">
                  <input type="date" name="periodEnd" required defaultValue={defEnd} />
                </Field>
                <Field label="Why this action" wide>
                  <input name="rationale" required maxLength={160} />
                </Field>
                <input type="hidden" name="resultNotes" value="" />
              </ActionForm>
            </DirectoryAddDialog>
          )}
        </div>
        {c.actions.length ? (
          <div className="mk-actions">
            {c.actions.map((a) => {
              const b = (a.baseline ?? {}) as Baseline;
              return (
                <article key={a.id} className="mk-action">
                  <header>
                    <h3>{a.title}</h3>
                    <StatusBadge status={a.status} />
                  </header>
                  <p className="muted">{a.rationale}</p>
                  <p className="mk-hint">
                    Period {a.periodStart} to {a.periodEnd} · review {a.reviewDate}
                  </p>
                  <div className="mk-baseline">
                    <div>
                      <span>Baseline · recorded {b.recordedAt?.slice(0, 10) ?? "unknown"}</span>
                      <strong>{b.attributedPaidInspections ?? 0} paid</strong>
                      <small>
                        <Cents cents={b.spendingCents ?? 0} /> spent ·{" "}
                        <Cents cents={b.collectedCents ?? 0} /> collected ·{" "}
                        {b.coverage?.completeDays ?? 0}/{b.coverage?.totalDays ?? 0} complete days
                      </small>
                    </div>
                    <Link
                      className="text-link"
                      href={`/marketing/campaigns/${c.id}?start=${a.periodStart}&end=${a.periodEnd}`}
                    >
                      Load current report for this period
                    </Link>
                  </div>
                  {a.resultNotes && <p className="preserve-lines">{a.resultNotes}</p>}
                  {editable && (
                    <details>
                      <summary>Record outcome</summary>
                      <ActionForm action={act.saveAction} submit="Save review">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="version" value={a.version} />
                        <input type="hidden" name="campaignId" value={c.id} />
                        <input type="hidden" name="title" value={a.title} />
                        <input type="hidden" name="rationale" value={a.rationale} />
                        <input type="hidden" name="periodStart" value={a.periodStart} />
                        <input type="hidden" name="periodEnd" value={a.periodEnd} />
                        <Field label="Status">
                          <select name="status" defaultValue={a.status}>
                            <option value="PLANNED">Planned</option>
                            <option value="DONE">Done</option>
                            <option value="REVIEWED">Reviewed</option>
                          </select>
                        </Field>
                        <Field label="Review date">
                          <input
                            type="date"
                            name="reviewDate"
                            required
                            defaultValue={a.reviewDate}
                          />
                        </Field>
                        <Field label="Result notes" wide>
                          <textarea
                            name="resultNotes"
                            maxLength={2000}
                            defaultValue={a.resultNotes}
                          />
                        </Field>
                      </ActionForm>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title="No actions planned"
            text="Plan an action to freeze a baseline you can review later."
          />
        )}
      </section>

      {/* Materials */}
      <section className="card space-top">
        <div className="card-heading">
          <div>
            <h2>
              Materials <span className="count">{c.materials.length}</span>
            </h2>
            <p>
              {owner
                ? "Drafts need approval. Approved copy cannot change; add a new draft to revise."
                : "Approved materials only."}
            </p>
          </div>
          {editable && (
            <DirectoryAddDialog title="New material draft">
              <ActionForm action={act.saveMaterial} submit="Save draft">
                <input type="hidden" name="campaignId" value={c.id} />
                <Field label="Title" wide>
                  <input name="title" required maxLength={160} />
                </Field>
                <Field label="Copy · optional" wide>
                  <textarea name="copy" maxLength={2000} />
                </Field>
                <Field label="File · PNG, JPEG or PDF up to 2 MB, optional" wide>
                  <input type="file" name="file" accept="image/png,image/jpeg,application/pdf" />
                </Field>
              </ActionForm>
            </DirectoryAddDialog>
          )}
        </div>
        {c.materials.length ? (
          <div className="mk-actions">
            {c.materials.map((m) => (
              <article key={m.id} className="mk-action">
                <header>
                  <h3>{m.title}</h3>
                  <StatusBadge status={m.status} />
                </header>
                {m.copy && <p className="preserve-lines mk-copy">{m.copy}</p>}
                {m.filename && (
                  <a className="text-link" href={`/api/marketing/materials/${m.id}`}>
                    Download {m.filename}
                  </a>
                )}
                {owner && m.status !== "ARCHIVED" && (
                  <div className="mk-row">
                    {m.status === "DRAFT" && (
                      <ActionForm
                        action={act.reviewMaterial}
                        submit="Approve"
                        className="mk-inline"
                      >
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="version" value={m.version} />
                        <input type="hidden" name="status" value="APPROVED" />
                      </ActionForm>
                    )}
                    <ActionForm action={act.reviewMaterial} submit="Archive" className="mk-inline">
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="version" value={m.version} />
                      <input type="hidden" name="status" value="ARCHIVED" />
                    </ActionForm>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty title="No materials" text="Draft flyer copy or upload a file for approval." />
        )}
      </section>

      {editable && (
        <section className="card card-body space-top">
          <h2>Archive campaign</h2>
          <p className="muted">
            Archiving keeps expenses, codes, sources and reviews. It cannot be undone.
          </p>
          <ActionForm action={act.archiveCampaign} submit="Archive campaign">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="version" value={c.version} />
          </ActionForm>
        </section>
      )}
      <Boundary>
        Sending or publishing materials is not part of this module. Use approved materials manually.
      </Boundary>
    </>
  );
}

function PromoForm({
  campaign,
  station,
  promo,
}: {
  campaign: { id: string; startDate: string; endDate: string };
  station: string;
  promo?: {
    id: string;
    version: number;
    code: string;
    kind: string;
    value: number;
    startDate: string;
    endDate: string;
    usageLimit: number;
    active: boolean;
    _count: { redemptions: number };
  };
}) {
  const locked = !!promo && promo._count.redemptions > 0;
  return (
    <ActionForm action={act.savePromo} submit={promo ? "Save promo" : "Create promo"}>
      <input type="hidden" name="id" value={promo?.id ?? ""} />
      <input type="hidden" name="version" value={promo?.version ?? 0} />
      <input type="hidden" name="campaignId" value={campaign.id} />
      <input type="hidden" name="stationHashes" value={station} />
      <Field label="Code">
        <input
          name="code"
          required
          pattern="[A-Za-z0-9][A-Za-z0-9_\-]{2,29}"
          defaultValue={promo?.code}
          readOnly={locked}
        />
      </Field>
      <PromoValueFields
        kind={promo?.kind}
        value={promo ? centsInput(promo.value) : ""}
        locked={locked}
      />
      <Field label="Valid from">
        <input
          type="date"
          name="startDate"
          required
          min={campaign.startDate}
          max={campaign.endDate}
          defaultValue={promo?.startDate ?? campaign.startDate}
          readOnly={locked}
        />
      </Field>
      <Field label="Valid to">
        <input
          type="date"
          name="endDate"
          required
          min={campaign.startDate}
          max={campaign.endDate}
          defaultValue={promo?.endDate ?? campaign.endDate}
          readOnly={locked}
        />
      </Field>
      <Field label="Usage limit · whole number">
        <input
          type="number"
          name="usageLimit"
          min={1}
          step={1}
          required
          defaultValue={promo?.usageLimit ?? 100}
          readOnly={locked}
        />
      </Field>
      <Field label="State">
        <select name="active" defaultValue={promo ? String(promo.active) : "true"}>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </Field>
      {locked && (
        <p className="mk-hint wide">
          Used {promo._count.redemptions} times (including cancellations). Offer terms are frozen;
          only the active state can change. Create a new code for different terms.
        </p>
      )}
    </ActionForm>
  );
}
