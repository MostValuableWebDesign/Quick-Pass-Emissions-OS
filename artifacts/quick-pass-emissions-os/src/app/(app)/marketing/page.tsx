import Link from "next/link";
import { requireRole } from "@/lib/require-role";
import { businessDate } from "@/lib/time";
import { marketingOverview } from "@/modules/marketing/service";
import { channels } from "@/modules/marketing/rules";
import { PageHeader, Empty } from "@/components/shared";
import { Boundary } from "@/components/phase5";
import { DirectoryAddDialog } from "@/components/directory-add-dialog";
import {
  CampaignForm,
  Cents,
  MarketingTabs,
  Metric,
  StatusBadge,
  channelLabels,
} from "@/components/marketing";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function Marketing({ searchParams }: { searchParams: Search }) {
  const user = await requireRole(["OWNER", "ADMIN"]);
  const sp = await searchParams;
  const today = businessDate();
  const start = one(sp.start) || `${today.slice(0, 8)}01`;
  const end = one(sp.end) || today;
  const campaignId = one(sp.campaignId);
  const channel = one(sp.channel);
  let data;
  let error: string | null = null;
  try {
    data = await marketingOverview(user.id, { start, end, campaignId, channel });
  } catch (e) {
    error = e instanceof Error ? e.message : "Unable to load the report.";
  }
  if (!data)
    return (
      <>
        <PageHeader eyebrow="MARKETING" title="Marketing" />
        <MarketingTabs current="/marketing" />
        <div className="notice warning">
          {error} <Link href="/marketing">Reset to the current month</Link>
        </div>
      </>
    );
  const r = data.report;
  const c = r.coverage;
  const names = new Map(data.campaigns.map((x) => [x.id, x.name]));
  return (
    <>
      <PageHeader
        eyebrow="MARKETING"
        title="Marketing"
        description="Promotions you planned, and what the business records show. Engagement is not an inspection; only recorded services count."
      >
        {data.isOwner && (
          <DirectoryAddDialog title="New campaign">
            <CampaignForm station={data.station} today={today} />
          </DirectoryAddDialog>
        )}
      </PageHeader>
      <MarketingTabs current="/marketing" />

      <form className="card card-body mk-filter" method="get">
        <label className="field">
          <span>From</span>
          <input type="date" name="start" defaultValue={start} required />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" name="end" defaultValue={end} required />
        </label>
        <label className="field">
          <span>Station</span>
          <select name="stationHash" defaultValue={data.station.hash}>
            <option value={data.station.hash}>{data.station.label}</option>
          </select>
        </label>
        <label className="field">
          <span>Campaign</span>
          <select name="campaignId" defaultValue={campaignId}>
            <option value="">All campaigns</option>
            {data.campaigns.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Channel</span>
          <select name="channel" defaultValue={channel}>
            <option value="">All channels</option>
            {channels.map((x) => (
              <option key={x} value={x}>
                {channelLabels[x]}
              </option>
            ))}
          </select>
        </label>
        <div className="mk-filter-actions">
          <button className="button button-primary">Apply</button>
          <Link className="button button-outline" href="/marketing">
            This month
          </Link>
        </div>
      </form>

      {c.partial && (
        <div className="notice warning">
          Partial period: {c.completeDays} of {c.totalDays} days have complete, reviewed station
          imports
          {r.end >= today ? ", and the period includes today" : ""}. Counts may rise as records
          arrive.
        </div>
      )}

      <section className="mk-metrics">
        <Metric
          label="Attributed paid inspections"
          value={r.attributedPaidInspections}
          note="Recorded services with a promo code or customer-stated campaign, classified paid."
        />
        <Metric
          label="Recorded spending"
          value={<Cents cents={r.spendingCents} />}
          note="Non-voided expenses entered for matching campaigns."
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
          note="Spending divided by attributed paid inspections. Not ROI, profit or incremental revenue."
        />
        <Metric
          label="Receipt-linked collected revenue"
          value={<Cents cents={r.collectedCents} />}
          note={`Verified individually linked retail receipts plus proportional net-of-tax invoice receipts, dated in this period; reversals subtract. ${c.receiptLinkedPaid} in-period inspections receipt-linked. Not a Performance estimate.`}
        />
      </section>

      <div className="two-columns">
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Record coverage</h2>
              <p>
                All recorded station evidence in the period, not filtered by campaign or channel.
              </p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <tbody>
                <tr>
                  <td>Recorded inspections in period</td>
                  <td>{c.recordedInspections}</td>
                </tr>
                <tr>
                  <td>Known customer responses</td>
                  <td>{c.knownResponses}</td>
                </tr>
                <tr>
                  <td>Answered “Unknown”</td>
                  <td>{c.unknown}</td>
                </tr>
                <tr>
                  <td>No response recorded</td>
                  <td>{c.missing}</td>
                </tr>
                <tr>
                  <td>Attributed free retests · not charged · follows campaign filter</td>
                  <td>{r.freeRetests}</td>
                </tr>
                <tr>
                  <td>Attributed, paid status unclassified · follows campaign filter</td>
                  <td>{r.unclassifiedInspections}</td>
                </tr>
                <tr>
                  <td>Complete import days</td>
                  <td>
                    {c.completeDays} / {c.totalDays}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mk-hint card-body">
            Paid status comes from station history (30 complete prior days) or a manual
            classification with evidence. Free retests and unknowns are never counted as paid.
          </p>
        </section>
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Customer-reported sources</h2>
              <p>
                All recorded inspections in the period, not campaign-filtered. Separate from promo
                codes.
              </p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Inspections</th>
                </tr>
              </thead>
              <tbody>
                {r.sourceBreakdown.map((s) => (
                  <tr key={s.source}>
                    <td>{s.label}</td>
                    <td>{s.count}</td>
                  </tr>
                ))}
                <tr>
                  <td className="muted">No response</td>
                  <td>{c.missing}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="card space-top">
        <div className="card-heading">
          <div>
            <h2>
              Promo redemptions <span className="count">{r.recordedRedemptions}</span>
            </h2>
            <p>
              Automatic attribution from codes applied on services. {r.activeRedemptions} not
              cancelled · discounts given <Cents cents={r.discountsCents} />.
            </p>
          </div>
        </div>
        {r.redemptions.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Code</th>
                  <th>Campaign</th>
                  <th>Service</th>
                  <th>Discount</th>
                  <th>Charged</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {r.redemptions.map((x) => (
                  <tr key={x.id}>
                    <td>{x.date}</td>
                    <td className="mk-code">{x.code}</td>
                    <td>{names.get(x.campaignId) ?? "Other station campaign"}</td>
                    <td>{x.reference}</td>
                    <td>
                      <Cents cents={x.discountCents} />
                    </td>
                    <td>
                      <Cents cents={x.finalCents} />
                    </td>
                    <td>
                      <StatusBadge status={x.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No redemptions in this period"
            text="Promo codes applied by the owner on single dealership services appear here."
          />
        )}
      </section>

      {r.recommendations.length > 0 && (
        <section className="card card-body space-top">
          <h2>Things to check</h2>
          <p className="muted">
            Rule-based checks on recorded spending and tracking gaps. They are not claims about
            whether a campaign worked.
          </p>
          {r.recommendations.map((x, i) => (
            <div key={i} className="mk-rec">
              <strong>{x.title}</strong> ·{" "}
              <Link className="text-link" href={`/marketing/campaigns/${x.campaignId}`}>
                {names.get(x.campaignId) ?? "Campaign"}
              </Link>
              <p className="muted">{x.rationale}</p>
            </div>
          ))}
        </section>
      )}

      <section className="card space-top">
        <div className="card-heading">
          <div>
            <h2>
              Campaigns <span className="count">{data.campaigns.length}</span>
            </h2>
            <p>All campaigns at {data.station.label}, including archived history.</p>
          </div>
        </div>
        {data.campaigns.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Channel</th>
                  <th>Period</th>
                  <th>Budget</th>
                  <th>Recorded spending · all time</th>
                  <th>Promo codes</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <Link className="task-name" href={`/marketing/campaigns/${x.id}`}>
                        {x.name}
                      </Link>
                      {x.offer && <small>{x.offer}</small>}
                    </td>
                    <td>{channelLabels[x.channel as keyof typeof channelLabels] ?? x.channel}</td>
                    <td className="nowrap">
                      {x.startDate} to {x.endDate}
                    </td>
                    <td>
                      <Cents cents={x.budgetCents} />
                    </td>
                    <td>
                      <Cents
                        cents={x.expenses
                          .filter((e) => !e.voidedAt)
                          .reduce((n, e) => n + e.amountCents, 0)}
                      />
                    </td>
                    <td>
                      {x.promos.filter((p) => p.active).length} active / {x.promos.length}
                    </td>
                    <td>
                      <StatusBadge status={x.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No campaigns yet"
            text={
              data.isOwner
                ? "Create a campaign to start tracking spending, promo codes and customer-stated sources."
                : "The owner has not created any campaigns."
            }
          />
        )}
      </section>
      <Boundary>
        Reports use recorded station evidence and dealership services only. Google profile views,
        clicks and calls are not inspections or collected sales.
      </Boundary>
    </>
  );
}
