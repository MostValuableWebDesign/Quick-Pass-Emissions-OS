import { GoogleSync } from "@/components/google-sync";
import { AnalyticsTrend } from "@/components/analytics-trend";
import type { Metadata } from "next";
import Link from "next/link";
import { manager } from "@/lib/access";
import { addDays, businessDate, formatDate } from "@/lib/time";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { analyticsOverview } from "@/modules/analytics/report";
import { METRICS } from "@/modules/analytics/rules";
import * as actions from "@/app/analytics-actions";
export const metadata: Metadata = { title: "Analytics" };
const money = (v: string | null) => {
  if (v === null) return "Unavailable";
  const cents = BigInt(v),
    absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "−" : ""}$${(absolute / 100n).toLocaleString("en-US")}.${String(absolute % 100n).padStart(2, "0")}`;
};
const shown = (v: number | null) => (v === null ? "Unavailable" : v.toLocaleString("en-US"));
const Stamp = ({ date }: { date: Date | null }) => <>{date ? formatDate(date) : "Never synced"}</>;
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await manager(),
    q = await searchParams,
    today = businessDate();
  let data: Awaited<ReturnType<typeof analyticsOverview>>;
  try {
    data = await analyticsOverview(actor.id, {
      start: q.start || today.slice(0, 7) + "-01",
      end: q.end || today,
      stationId: q.station || undefined,
      page: Math.max(1, Math.floor(Number(q.page)) || 1),
    });
  } catch {
    return (
      <>
        <PageHeader title="Analytics" />
        <section className="card card-body">
          <p role="alert">
            This station or date range is unavailable. Choose an authorized station and 1–367 days
            ending by today.
          </p>
          <Link href="/analytics" className="button button-outline">
            Reset filters
          </Link>
        </section>
      </>
    );
  }
  const { station, range, report } = data,
    location = station?.locations[0],
    owner = actor.role === "OWNER";
  const href = (page: number, start = range.start, end = range.end) =>
    `/analytics?${new URLSearchParams({ ...(station ? { station: station.id } : {}), start, end, page: String(page) })}`;
  const callback: Record<string, string> = {
    connected:
      "Google authorized. Refresh authorized locations, then map the business to your station.",
    denied: "Google authorization was cancelled. Existing business records remain saved.",
    failed: "Google authorization could not be verified. Start Connect Google again.",
    setup: "Configure Google OAuth and the encryption key before connecting.",
  };
  return (
    <>
      <PageHeader
        eyebrow="QUICK PASS BUSINESS INTELLIGENCE"
        title="Analytics"
        description="Google discovery alongside recorded business results. All reporting dates use Eastern time."
      />
      {q.google && callback[q.google] ? (
        <p role="status" className="card card-body">
          {callback[q.google]}
        </p>
      ) : null}
      <section className="card">
        <div className="card-heading">
          <h2>Google Business Profile</h2>
          <span className="badge neutral">{data.connection?.status ?? "DISCONNECTED"}</span>
        </div>
        <div className="card-body">
          <p>
            Connect the Google account authorized for{" "}
            <strong>Quick Pass Emissions &amp; Tag Renewal</strong>. Reporting access never changes
            your listing or posts review replies.
          </p>
          {data.connection?.error ? (
            <p role="alert" className="error-text">
              {data.connection.error}
            </p>
          ) : null}
          {data.redirectUri ? (
            <p>
              Google Cloud authorized redirect URI: <code>{data.redirectUri}</code>
            </p>
          ) : (
            <p>Set the canonical HTTPS BETTER_AUTH_URL to display the exact Google redirect URI.</p>
          )}
          {!data.configured ? (
            <div>
              <h3>Connection setup needed</h3>
              <p>
                Configure a Google Cloud web OAuth client, approved Business Profile API access, the
                enabled reporting/location/review APIs, and a stable server encryption key. Register{" "}
                <code>/api/google-business/callback</code> on this app’s canonical URL. Full
                instructions: GOOGLE_ANALYTICS.md in the project.
              </p>
            </div>
          ) : (
            <form action={actions.connectGoogleAction}>
              <button className="button" type="submit">
                {data.connection?.status === "CONNECTED" ? "Reconnect Google" : "Connect Google"}
              </button>
            </form>
          )}
          <p className="muted">
            Google requires the business.manage permission for these read APIs. Quick Pass uses only
            read endpoints for locations, metrics and reviews. Tokens stay encrypted on the server.
            Google source caches refresh and expire within 30 days; your business records and action
            history persist.
          </p>
          {data.connection?.status === "CONNECTED" && (owner || data.connection.canDisconnect) ? (
            <ActionForm
              action={actions.discoverGoogleAction}
              submit="Refresh authorized locations"
            />
          ) : null}
          {data.connection?.canDisconnect && data.connection.status !== "DISCONNECTED" ? (
            <ActionForm action={actions.disconnectGoogleAction} submit="Disconnect Google">
              <p>
                Disconnect removes local credentials and cached Google content, and requests
                revocation at Google.
              </p>
            </ActionForm>
          ) : null}
          <p className="muted">
            Authorized <Stamp date={data.connection?.connectedAt ?? null} /> · Locations refreshed{" "}
            <Stamp date={data.connection?.discoveryAt ?? null} />
          </p>
        </div>
      </section>
      {owner ? (
        <details className="card">
          <summary className="card-heading">Station mapping &amp; manager access</summary>
          <div className="card-body">
            <h3>Register the configured Quick Pass station</h3>
            <p>
              The app currently has one configured analyzer station. Registration reuses that source
              identity. Other stations require their own source configuration before comparison.
            </p>
            <ActionForm
              action={actions.registerAnalyticsStationAction}
              submit="Save Analytics station"
            >
              <Field label="Station display name">
                <input name="name" required maxLength={100} defaultValue={station?.name} />
              </Field>
              <Field label="Confirm business dates">
                <span>
                  <input type="checkbox" name="timezoneConfirmed" required /> This station and its
                  Google location report America/New_York calendar dates.
                </span>
              </Field>
            </ActionForm>
            {station && data.options.length ? (
              <ActionForm action={actions.mapGoogleLocationAction} submit="Map authorized location">
                <input type="hidden" name="stationId" value={station.id} />
                <Field label="Google business location">
                  <select name="location" required>
                    {data.options.map((l) => (
                      <option
                        key={`${l.accountName}|${l.name}`}
                        value={`${l.accountName}|${l.name}`}
                      >
                        {l.title} · {l.name} · {l.accountName}
                      </option>
                    ))}
                  </select>
                </Field>
              </ActionForm>
            ) : (
              <p className="muted">
                Connect Google and refresh authorized locations to select the correct business. No
                match is guessed from the business name.
              </p>
            )}
            {station && data.managers.length ? (
              <ActionForm
                action={actions.grantAnalyticsStationAction}
                submit="Update manager access"
              >
                <input type="hidden" name="stationId" value={station.id} />
                <Field label="Manager">
                  <select name="userId">
                    {data.managers.map((m) => (
                      <option value={m.id} key={m.id}>
                        {m.name}
                        {data.grants.some((g) => g.userId === m.id) ? " · has access" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Station permission">
                  <select name="allow">
                    <option value="yes">Allow Analytics for this station</option>
                    <option value="no">Remove Analytics access</option>
                  </select>
                </Field>
              </ActionForm>
            ) : null}
          </div>
        </details>
      ) : null}
      {!station ? (
        <section className="card card-body">
          <h2>No authorized station</h2>
          <p>
            {owner
              ? "Register the configured station above to start comparing business results."
              : "An owner must grant you access to an Analytics station."}
          </p>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="card-heading">
              <h2>Reporting period</h2>
            </div>
            <form className="form-grid card-body" method="get">
              <Field label="Station / Google location">
                <select name="station" defaultValue={station.id}>
                  {data.stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.locations[0] ? ` · ${s.locations[0].locationName}` : " · not mapped"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="From">
                <input type="date" name="start" defaultValue={range.start} max={today} required />
              </Field>
              <Field label="Through">
                <input type="date" name="end" defaultValue={range.end} max={today} required />
              </Field>
              <div className="form-footer">
                <button className="button">Apply filters</button>
                <Link className="button button-outline" href={href(1, "2026-05-01", "2026-05-31")}>
                  May 2026
                </Link>
                <Link className="button button-outline" href={href(1, "2026-09-01", "2026-09-30")}>
                  September 2026
                </Link>
              </div>
            </form>
            <div className="card-body">
              <p>
                Previous comparison: {range.previous.start} – {range.previous.end} ({range.days}{" "}
                days). {range.end === today ? "Current day is partial." : ""}
              </p>
              <p className="muted">
                Google’s web report documents six months of history. Current API references do not
                guarantee an 18-month retention window. May and September are requested directly
                when available; an omitted date is unavailable, never assumed zero. Search terms are
                monthly and can take five days to appear.
              </p>
              {location?.enabled && data.connection?.status === "CONNECTED" ? (
                <GoogleSync
                  locationId={location.id}
                  start={range.start}
                  end={range.end}
                  previousStart={range.previous.start}
                  previousEnd={range.previous.end}
                  request={report?.latestRequest ?? null}
                />
              ) : (
                <p>
                  Google data is disconnected or this station is not mapped. Recorded Quick Pass
                  results remain available below.
                </p>
              )}
            </div>
          </section>
          {report ? (
            <>
              <section className="card">
                <div className="card-heading">
                  <h2>Google performance</h2>
                  <span className="muted">
                    Newest displayed response: <Stamp date={report.fetchedAt} />
                  </span>
                </div>
                <div className="card-body">
                  <p>
                    Source: Google Business Profile API. Impressions count a unique user once per
                    day within each device/platform metric. These categories are not a
                    cross-platform unique audience. Call clicks are not answered calls; directions
                    are not visits; website clicks are not customers.
                  </p>
                  <p>
                    Displayed data fetched between <Stamp date={report.oldestFetchedAt} /> and{" "}
                    <Stamp date={report.fetchedAt} />. Refreshing keeps earlier usable results with
                    their original fetch times.
                  </p>
                  <AnalyticsTrend
                    labels={METRICS}
                    rows={report.monthly.map((m) => ({ month: m.month, metrics: m.metrics }))}
                  />
                  {report.unreadable ? (
                    <p role="alert">
                      {report.unreadable} source responses could not be read. Reconnect or restore
                      the encryption key.
                    </p>
                  ) : null}
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Reported value</th>
                        <th>Coverage</th>
                        <th>Previous period</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.current.map((m) => {
                        const previous = report.previous.find((p) => p.metric === m.metric)!,
                          change = report.comparisons.find((p) => p.metric === m.metric)?.change;
                        return (
                          <tr key={m.metric}>
                            <td>{METRICS[m.metric]}</td>
                            <td>
                              {shown(m.value)}
                              {m.value !== null && !m.complete ? " · partial / provisional" : ""}
                            </td>
                            <td>
                              {m.reportedDays}/{m.expectedDays} days · {m.missingDays} missing
                              {m.delayedDays
                                ? ` · ${m.delayedDays} recent days may be delayed`
                                : ""}
                            </td>
                            <td>
                              {shown(previous.value)}
                              {previous.value !== null && !previous.complete ? " · partial" : ""}
                            </td>
                            <td>
                              {change
                                ? `${change.absolute > 0 ? "+" : ""}${change.absolute} (${change.percent === null ? "no percentage from zero" : change.percent.toFixed(1) + "%"})`
                                : "Unavailable · complete comparable data required"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="card">
                <div className="card-heading">
                  <h2>Quick Pass business results</h2>
                  <span className="badge neutral">
                    {report.currentBusiness.complete
                      ? "Source coverage complete"
                      : "Partial / missing source data"}
                  </span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Recorded business measure</th>
                        <th>Selected period</th>
                        <th>Previous period</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Paid inspections · passed/failed, excluding free retests</td>
                        <td>{shown(report.currentBusiness.paidInspections)}</td>
                        <td>{shown(report.previousBusiness.paidInspections)}</td>
                      </tr>
                      <tr>
                        <td>Free retests</td>
                        <td>{shown(report.currentBusiness.freeRetests)}</td>
                        <td>{shown(report.previousBusiness.freeRetests)}</td>
                      </tr>
                      <tr>
                        <td>Aborted / other tests · excluded from paid inspections</td>
                        <td>{shown(report.currentBusiness.abortedOrOther)}</td>
                        <td>{shown(report.previousBusiness.abortedOrOther)}</td>
                      </tr>
                      <tr>
                        <td>Collected retail revenue · station-linked</td>
                        <td>Unavailable · collection records not linked to this station</td>
                        <td>Unavailable</td>
                      </tr>
                      <tr>
                        <td>Actual customer refunds</td>
                        <td>Unavailable · no refund register</td>
                        <td>Unavailable</td>
                      </tr>
                      <tr>
                        <td>Recorded marketing attribution · entered customer counts</td>
                        <td>{shown(report.attributedCustomers)}</td>
                        <td>See prior-period filter</td>
                      </tr>
                      <tr>
                        <td>Recorded marketing cost · entered items only</td>
                        <td>{money(report.recordedCostCents)}</td>
                        <td>See prior-period filter</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="card-body">
                  <p>
                    {report.currentBusiness.reportedDays}/{report.currentBusiness.expectedDays}{" "}
                    station days have the required test and preceding 30-day VIN evidence.{" "}
                    {report.currentBusiness.staleDates.length} days are provisional. No missing day
                    is counted as zero. Counts reflect source evidence and the existing 30-day
                    free-retest rule, not proof of payment.
                  </p>
                  {report.currentBusiness.missingDates.length ? (
                    <details>
                      <summary>
                        Missing or incomplete station submissions (
                        {report.currentBusiness.missingDates.length})
                      </summary>
                      <p>{report.currentBusiness.missingDates.join(", ")}</p>
                    </details>
                  ) : null}
                  {owner ? (
                    <p>
                      Business-wide dealership receipts, net of recorded reversals:{" "}
                      {report.unallocatedReceiptCount
                        ? money(report.unallocatedDealerReceiptsCents)
                        : "Unavailable · no receipts recorded"}
                      . These receipts have no station allocation and are excluded from station
                      revenue. Reversals are not evidence of refunds.
                    </p>
                  ) : null}
                  <p className="muted">
                    Conversion rates and ROI are unavailable: these datasets do not match Google
                    interactions to confirmed customers, receipts and complete costs.
                  </p>
                </div>
              </section>
              <section className="card">
                <div className="card-heading">
                  <h2>Monthly summaries</h2>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Month / scope</th>
                        <th>Call clicks</th>
                        <th>Directions</th>
                        <th>Website clicks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.monthly.map((m) => (
                        <tr key={m.month}>
                          <td>
                            {m.month} · {m.start} – {m.end}
                            {m.partial ? " · partial month" : ""}
                          </td>
                          {(
                            [
                              "CALL_CLICKS",
                              "BUSINESS_DIRECTION_REQUESTS",
                              "WEBSITE_CLICKS",
                            ] as const
                          ).map((key) => {
                            const metric = m.metrics.find((r) => r.metric === key)!;
                            return (
                              <td key={key}>
                                {shown(metric.value)}
                                {!metric.complete ? " · incomplete / provisional" : ""}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="card">
                <div className="card-heading">
                  <h2>Search keywords · monthly Google impressions</h2>
                </div>
                <div className="card-body">
                  <p>
                    Whole-month source counts are never prorated into a selected partial month.
                    “Below N” is a privacy threshold, not an exact count. An empty list may mean
                    unavailable or delayed data.
                  </p>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Keyword</th>
                        <th>Google value</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.keywordRows
                        .slice((data.page - 1) * 15, data.page * 15)
                        .map((k, i) => (
                          <tr key={i}>
                            <td>{k.period}</td>
                            <td>{k.keyword}</td>
                            <td>
                              {k.value ?? (k.threshold ? `Below ${k.threshold}` : "Unavailable")}
                            </td>
                            <td>{k.complete ? "Response complete" : "Partial / provisional"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="card">
                <div className="card-heading">
                  <h2>Performance recommendations</h2>
                </div>
                <div className="card-body">
                  <p>
                    Rules compare {range.start} – {range.end} with {range.previous.start} –{" "}
                    {range.previous.end}. Alerts require complete comparable days, at least 10
                    previous interactions and a decline of 20% or more.
                  </p>
                  {report.recommendations.length ? (
                    report.recommendations.map((r) => (
                      <article key={r.metric}>
                        <h3>
                          {METRICS[r.metric]} declined {Math.abs(r.change)}%
                        </h3>
                        <p>
                          {r.current} versus {r.previous}. {r.action}
                        </p>
                        <p className="muted">{r.limitation}</p>
                      </article>
                    ))
                  ) : (
                    <p>
                      No supported performance recommendation for this period. Missing or
                      provisional data does not produce an insight.
                    </p>
                  )}
                </div>
              </section>
              <section className="card">
                <div className="card-heading">
                  <h2>Google reviews &amp; feedback</h2>
                  <span className="badge neutral">
                    {report.reviewComplete
                      ? "All returned review pages cached"
                      : "Incomplete / unavailable review import"}
                  </span>
                </div>
                <div className="card-body">
                  <p>
                    Source: Google Business Profile reviews. {report.reviewCount} imported reviews
                    created during the selected period. Theme counts use literal text matches and
                    can overlap; they do not establish causation or all customers’ views. Recent
                    edits retain the original review date. Reply drafts require owner review and are
                    never published from this app.
                  </p>
                  {report.themes.map((t) => (
                    <article key={t.theme}>
                      <h3>{t.theme}</h3>
                      <p>
                        {t.current} selected-period mentions · {t.previous} previous-period mentions
                        · {t.older} older mentions · {t.negative} selected-period mentions with 1–2
                        stars.
                      </p>
                      {t.excerpts.map((e) => (
                        <blockquote key={e.id}>
                          “{e.text}” — {e.date} · {e.rating.toLowerCase()} stars
                        </blockquote>
                      ))}
                      <p className="muted">
                        Hypothesis:{" "}
                        {t.negative >= 2
                          ? "Review this recurring concern with management, record one specific service change, then compare review mentions over the next 30 days."
                          : "Monitor this topic over the next 30 days; the observed mentions alone do not justify a business conclusion."}
                      </p>
                    </article>
                  ))}
                  {!report.reviews.length ? (
                    <p>No review data available for the selected dates.</p>
                  ) : (
                    report.reviews.map((r) => (
                      <article key={r.reviewId} className="card-body">
                        <h3>
                          {r.starRating.toLowerCase()} stars ·{" "}
                          {r.reviewer?.displayName || "Anonymous reviewer"}
                        </h3>
                        <p>
                          {r.localDate} Eastern · updated {formatDate(new Date(r.updateTime))}
                        </p>
                        <p>{r.comment || "No written comment"}</p>
                        {r.reviewReply ? (
                          <>
                            <strong>Existing business reply</strong>
                            <p>{r.reviewReply.comment || "No reply text returned"}</p>
                          </>
                        ) : (
                          <>
                            <span className="badge amber">Unanswered review</span>
                            <p>
                              <strong>Suggested draft · owner review required</strong>
                            </p>
                            <p>{r.draft}</p>
                            <a
                              className="button button-outline"
                              href="https://business.google.com/"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Review on Google
                            </a>
                          </>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </section>
              <section className="card">
                <div className="card-heading">
                  <h2>Actions &amp; follow-up</h2>
                </div>
                <div className="card-body">
                  {owner ? (
                    <ActionForm
                      action={actions.recordAnalyticsActionAction}
                      submit="Record action taken"
                    >
                      <input name="stationId" type="hidden" value={station.id} />
                      <Field label="Evidence category">
                        <select name="category">
                          <option value="PERFORMANCE">Performance metrics</option>
                          <option value="REVIEWS">Customer reviews</option>
                          <option value="OPERATIONS">Business operations</option>
                        </select>
                      </Field>
                      <Field label="Action date">
                        <input name="date" type="date" defaultValue={today} max={today} required />
                      </Field>
                      <Field label="Review results on">
                        <input
                          name="reviewDate"
                          type="date"
                          defaultValue={addDays(today, 30)}
                          required
                        />
                      </Field>
                      <Field label="Action taken" wide>
                        <textarea name="action" required maxLength={2000} />
                      </Field>
                      <Field label="Measurable target and comparison plan" wide>
                        <input
                          name="target"
                          required
                          maxLength={500}
                          placeholder="Example: compare unanswered review count after 30 days"
                        />
                      </Field>
                    </ActionForm>
                  ) : null}
                  {report.actions.map((a) => (
                    <article className="card-body" key={a.id}>
                      <h3>
                        {a.category} · {a.date}
                      </h3>
                      <p>{a.action}</p>
                      <p>
                        Target: {a.target} · Review on {a.reviewDate}
                      </p>
                      <Link href={href(1, a.date, a.reviewDate > today ? today : a.reviewDate)}>
                        Open subsequent performance
                      </Link>
                      {a.reviewedAt ? (
                        <p>Recorded outcome: {a.outcome}</p>
                      ) : owner && a.reviewDate <= today ? (
                        <ActionForm
                          action={actions.reviewAnalyticsActionAction}
                          submit="Save follow-up results"
                        >
                          <input name="id" type="hidden" value={a.id} />
                          <Field label="Measured result and limitations">
                            <textarea name="outcome" required maxLength={2000} />
                          </Field>
                        </ActionForm>
                      ) : (
                        <p className="muted">Awaiting follow-up review</p>
                      )}
                    </article>
                  ))}
                </div>
              </section>
              <details className="card">
                <summary className="card-heading">Recorded marketing attribution</summary>
                <div className="card-body">
                  <p>
                    Record only actual, documented customer attribution. These are
                    management-entered observations with references, not Google-confirmed
                    conversions. A unique source reference prevents duplicate entry. Blank cost
                    means unknown.
                  </p>
                  <ActionForm action={actions.recordAttributionAction} submit="Record attribution">
                    <input name="stationId" type="hidden" value={station.id} />
                    <Field label="Date">
                      <input name="date" type="date" defaultValue={today} max={today} required />
                    </Field>
                    <Field label="Channel">
                      <input
                        name="channel"
                        maxLength={100}
                        required
                        placeholder="Customer reported Google"
                      />
                    </Field>
                    <Field label="Attributed customers">
                      <input name="customers" type="number" min="0" max="2000000000" required />
                    </Field>
                    <Field label="Recorded marketing cost (integer cents, optional)">
                      <input name="costCents" type="number" min="0" max="2000000000" />
                    </Field>
                    <Field label="Unique source reference">
                      <input name="reference" required maxLength={160} />
                    </Field>
                    <Field label="Evidence / collection method" wide>
                      <textarea name="evidence" required maxLength={2000} />
                    </Field>
                  </ActionForm>
                  {report.attribution.map((a) => (
                    <p key={a.id}>
                      {a.date} · {a.channel} · {a.customers} customers · cost{" "}
                      {money(a.costCents === null ? null : String(a.costCents))} · {a.reference}
                      <br />
                      {a.evidence}
                    </p>
                  ))}
                </div>
              </details>
              <section className="card">
                <div className="card-heading">
                  <h2>Sync status</h2>
                </div>
                <div className="card-body">
                  <p>
                    Google syncing is manual only. The independent worker processes already
                    requested pages and retries; running it never authorizes a new Google
                    collection.
                  </p>
                  <p>
                    Last fully successful sync: <Stamp date={report.lastSuccessfulSync} />
                  </p>
                  {report.latestRequest ? (
                    <p>
                      Latest request: {report.latestRequest.status} · reporting{" "}
                      {report.latestRequest.start} – {report.latestRequest.end} · requested{" "}
                      <Stamp date={report.latestRequest.createdAt} />
                      {report.latestRequest.completedAt ? (
                        <>
                          {" "}
                          · finished <Stamp date={report.latestRequest.completedAt} />
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  {report.freshness.slice((data.page - 1) * 15, data.page * 15).map((f, i) => (
                    <p key={i}>
                      Displayed {f.kind} · {f.period} · page {f.page + 1} · fetched{" "}
                      <Stamp date={f.fetchedAt} />
                    </p>
                  ))}
                  {!report.tasks.length ? (
                    <p>No sync requests yet.</p>
                  ) : (
                    report.tasks.map((t, i) => (
                      <p key={i}>
                        <strong>
                          {t.kind} · {t.period} · {t.status}
                        </strong>
                        <br />
                        Last complete response: <Stamp date={t.lastSuccessAt} />
                        {t.error ? <span className="error-text"> · {t.error}</span> : null}
                      </p>
                    ))
                  )}
                </div>
              </section>
              <nav className="pagination" aria-label="Analytics pages">
                {data.page > 1 ? (
                  <Link className="button button-outline" href={href(data.page - 1)}>
                    Previous
                  </Link>
                ) : null}
                <span>Page {data.page} · up to 15 items per list</span>
                {data.page * 15 <
                Math.max(
                  report.reviewCount,
                  report.keywordRows.length,
                  report.actionCount,
                  report.attributionCount,
                  report.taskCount,
                  report.freshness.length,
                ) ? (
                  <Link className="button button-outline" href={href(data.page + 1)}>
                    Next
                  </Link>
                ) : null}
              </nav>
            </>
          ) : null}
        </>
      )}
    </>
  );
}
