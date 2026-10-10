import Link from "next/link";
import { requireRole } from "@/lib/require-role";
import { businessDate } from "@/lib/time";
import { BusinessError } from "@/modules/phase2";
import { performance } from "@/modules/station/performance";
import { weekBounds } from "@/modules/station/projections";
import { PageHeader, Empty } from "@/components/shared";
import { RecordLink } from "@/components/record-link";
import { Badge, Boundary, fmtInstant, usd } from "@/components/phase5";
import {
  Last4,
  Section,
  SourceTime,
  StateBadge,
  StationStat,
  inclusiveDays,
} from "@/components/station-ui";
import { PerformanceDayFilter } from "@/components/performance-day-filter";

type Search = { preset?: string; date?: string; start?: string; end?: string; employeeId?: string };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function PerformancePage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireRole(["OWNER"]);
  const q = await searchParams;
  const today = businessDate();
  // Initial station-wide read for today: settings and employee list.
  const base = await performance(user.id, { start: today, end: today });
  const setting = base.settings.find((s) => s.effectiveDate <= today) ?? null;
  const preset =
    q.preset === "week" || q.preset === "custom" || q.preset === "day" ? q.preset : "today";
  let start = today;
  let end = today;
  let problem: string | null = null;
  if (preset === "day") {
    const selected = q.date ?? "";
    if (!DATE.test(selected)) problem = "Choose a valid daily count date; showing today.";
    else if (selected > today)
      problem = "Daily counts cannot be requested for a future date; showing today.";
    else start = end = selected;
  } else if (preset === "week") {
    if (!setting)
      problem =
        "This Week needs an owner-confirmed week start. Configure it in performance setup; showing today.";
    else {
      const w = weekBounds(today, setting.weekStart);
      start = w.start;
      end = w.end > today ? today : w.end;
    }
  } else if (preset === "custom") {
    const s = q.start ?? "";
    const e = q.end ?? "";
    if (!DATE.test(s) || !DATE.test(e)) problem = "Enter both custom dates; showing today.";
    else if (s > e) problem = "Start must be on or before end; showing today.";
    else if (e > today) problem = "Custom ranges cannot include future dates; showing today.";
    else if (inclusiveDays(s, e) > 367)
      problem = "Custom ranges are limited to 367 inclusive days; showing today.";
    else {
      start = s;
      end = e;
    }
  }
  const employeeId =
    q.employeeId && base.employeeOptions.some((x) => x.id === q.employeeId)
      ? q.employeeId
      : undefined;
  let data = base;
  if (start !== today || end !== today || employeeId) {
    try {
      data = await performance(user.id, { start, end, employeeId });
    } catch (e) {
      if (!(e instanceof BusinessError)) throw e;
      problem = `${e.message} Showing today.`;
      start = end = today;
    }
  }
  const nameOf = (id: string | null) =>
    base.employeeOptions.find((x) => x.id === id)?.user.name ?? null;
  const tzConfirmed = !!setting?.sourceTimezoneConfirmed;
  const dateLabel = tzConfirmed ? "Business date" : "Inferred source calendar date";
  const rangePreset = preset === "day" ? "custom" : preset;
  const dailyDate = preset === "day" || (preset === "custom" && start === end) ? start : today;
  const attested = data.days.filter((d) => d.attested).length;
  const p = data.projection;
  const f = data.finance.totals;
  return (
    <>
      <PageHeader
        eyebrow="OWNER · STATION"
        title="Station performance"
        description={`${start === end ? start : `${start} to ${end}`} inclusive, America/New_York. Generated ${fmtInstant(data.generatedAt)}.`}
      >
        <Link className="button button-outline" href="/performance/settings">
          Setup &amp; imports
        </Link>
      </PageHeader>
      <Boundary>
        {data.liveAccess} Station-reported tests are evidence for review, not approved wages or
        collected cash.
      </Boundary>
      {!tzConfirmed && (
        <div className="notice warning">
          Source timezone unverified. Dates are inferred from the portal calendar until you confirm
          they are America/New_York dates in <Link href="/performance/settings">setup</Link>.
          Payroll reconciliation is blocked until then.
        </div>
      )}
      {problem && (
        <div className="notice warning" role="alert">
          {problem}
        </div>
      )}

      <PerformanceDayFilter date={dailyDate} today={today} employeeId={employeeId} />

      <form
        className="card card-body"
        method="get"
        style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "end" }}
      >
        <fieldset className="checks" style={{ margin: 0 }}>
          <legend>Range</legend>
          {[
            ["today", "Today"],
            ["week", "This week"],
            ["custom", "Custom"],
          ].map(([v, l]) => (
            <label key={v}>
              <input type="radio" name="preset" value={v} defaultChecked={rangePreset === v} /> {l}
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>Custom start</span>
          <input
            type="date"
            name="start"
            max={today}
            defaultValue={rangePreset === "custom" ? start : ""}
          />
        </label>
        <label className="field">
          <span>Custom end</span>
          <input
            type="date"
            name="end"
            max={today}
            defaultValue={rangePreset === "custom" ? end : ""}
          />
        </label>
        <label className="field">
          <span>Employee (records and pay; station totals unchanged)</span>
          <select name="employeeId" defaultValue={employeeId ?? ""}>
            <option value="">All employees</option>
            {base.employeeOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.user.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-primary">Apply</button>
        {rangePreset === "week" && !setting && (
          <small className="muted">Week start not configured.</small>
        )}
      </form>

      <section className="stats space-top" aria-label="Station-wide totals">
        <StationStat
          label="Station recorded (confirmed)"
          value={data.stationRecorded}
          note="Station-wide, all employees"
        />
        <StationStat
          label="Pending identities"
          value={data.stationPending}
          note="Not counted until reviewed"
        />
        <StationStat
          label="Coverage days attested"
          value={`${attested} / ${data.days.length}`}
          note="Owner-attested, not live sync"
        />
        <StationStat
          label="Estimated retail revenue"
          value={data.estimatedRevenueCents === null ? "None" : usd(data.estimatedRevenueCents)}
          note={`Estimate only · ${data.estimateIncluded} included, ${data.excluded} excluded, ${data.unresolved} unresolved`}
        />
      </section>

      <div className="two-columns">
        <Section
          title="Station groups"
          note="Station-wide by mapped employee or raw Issued By label. Not filtered."
          count={data.groups.length}
        >
          {data.groups.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Mapping</th>
                    <th>Confirmed</th>
                    <th>Eligible</th>
                    <th>Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {data.groups.map((g) => (
                    <tr key={g.label}>
                      <td>{g.label}</td>
                      <td>
                        <Badge tone={g.employeeId ? "green" : "amber"}>
                          {g.employeeId ? "mapped" : "unmapped"}
                        </Badge>
                      </td>
                      <td>{g.confirmed}</td>
                      <td>{g.eligible}</td>
                      <td>{g.pending}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No station rows"
              text="No imported rows for this range. That does not prove zero tests."
            />
          )}
        </Section>

        <Section title="Projection" note={p.scope}>
          <div className="card-body">
            <p>
              <strong>{p.status}</strong>
              {p.projected !== null && ` · ${p.projected} tests`}
            </p>
            <p className="muted">{p.reason}</p>
            <p>
              Usable observation days: {p.observations.length}
              {setting
                ? ` (minimum ${setting.minimumDays} of ${setting.observationDays})`
                : " · settings not configured"}
            </p>
            <p>
              Today operating time:{" "}
              {p.operating
                ? `${Math.round(p.operating.elapsed)} min elapsed, ${Math.round(p.operating.remaining)} min remaining of ${Math.round(p.operating.total)}`
                : "unknown (hours not configured)"}
            </p>
            {p.status === "Insufficient data" && (
              <ul className="muted" style={{ fontSize: 12, paddingLeft: 18 }}>
                {!setting && <li>No effective schedule settings.</li>}
                {setting && p.observations.length < setting.minimumDays && (
                  <li>Fewer attested, fully confirmed historical days than the minimum.</li>
                )}
                {data.stationPending > 0 && <li>Pending identities in this range.</li>}
                {data.days.some((d) => !d.attested) && (
                  <li>Not every day has owner-attested coverage.</li>
                )}
                {end >= today && (
                  <li>Range includes today; manual reports have no verified cutoff.</li>
                )}
              </ul>
            )}
          </div>
        </Section>
      </div>

      <Section
        title={employeeId ? `Records for ${nameOf(employeeId)}` : "Station records"}
        note="Vehicle last 4 only. Open a record to review evidence."
        count={data.records.length}
      >
        {data.records.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{dateLabel}</th>
                  <th>Source time</th>
                  <th>Issued by</th>
                  <th>Employee</th>
                  <th>Vehicle</th>
                  <th>Result</th>
                  <th>State</th>
                  <th>Disposition</th>
                  <th>Estimate</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.records.map((r) => (
                  <tr key={r.id}>
                    <td>{r.source.businessDate}</td>
                    <td>
                      <SourceTime value={r.source.sourceDate} />
                    </td>
                    <td>{r.source.inspector}</td>
                    <td>{nameOf(r.employeeId) ?? <Badge tone="amber">unmapped</Badge>}</td>
                    <td>
                      <Last4 value={r.source.vehicleSuffix} />
                    </td>
                    <td>
                      {r.source.outcome}
                      <small>
                        Eligible: {r.eligible === null ? "unresolved" : r.eligible ? "yes" : "no"}
                      </small>
                    </td>
                    <td>
                      <StateBadge state={r.state} />
                    </td>
                    <td>{r.disposition.toLowerCase()}</td>
                    <td>{r.estimatedCents === null ? "—" : usd(r.estimatedCents)}</td>
                    <td>
                      <RecordLink className="text-link" href={`/performance/tests/${r.id}`}>
                        Details
                      </RecordLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No matching records"
            text="No imported records match. Import every portal page in setup."
          />
        )}
      </Section>

      <Section
        title="Finance register (separate)"
        note="Global existing finance register for this range, not station actuals. Never summed with station estimates."
      >
        <div className="card-body">
          <dl className="stats" style={{ marginBottom: 12 }}>
            {[
              ["Verified manual revenue", f.verifiedRevenue],
              ["Unverified manual revenue", f.manualRevenue],
              ["Dealer receipts", f.dealerReceipts],
              ["Approved dealer billing", f.billed],
            ].map(([k, v]) => (
              <div className="stat" key={k as string}>
                <dt className="stat-top">{k}</dt>
                <dd style={{ margin: 0 }}>
                  <strong>{usd(v as number)}</strong>
                </dd>
              </div>
            ))}
          </dl>
          <p className="muted">
            Evidence:{" "}
            <Link className="text-link" href="/finance">
              finance entries ({data.finance.entries.length})
            </Link>
            {" · "}
            <Link className="text-link" href="/invoices">
              invoices ({data.finance.invoices.length})
            </Link>
            {" · "}
            <Link className="text-link" href={`/finance/reports?start=${start}&end=${end}`}>
              finance report
            </Link>
          </p>
        </div>
      </Section>

      <Section
        title="Daily pay evidence"
        note="Daily qualifying personal counts. Approval happens only in payroll."
        count={data.pay.daily.length}
      >
        {data.pay.daily.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Count</th>
                  <th>Approval</th>
                  <th>Policy</th>
                  <th>Commission</th>
                </tr>
              </thead>
              <tbody>
                {data.pay.daily.map((d) => (
                  <tr key={d.id}>
                    <td>{d.date}</td>
                    <td>{d.employee}</td>
                    <td>
                      {d.count}
                      <small>
                        v{d.version}
                        {d.sourceRef ? ` · ${d.sourceRef}` : ""}
                      </small>
                    </td>
                    <td>
                      <Badge tone={d.approved ? "green" : "amber"}>
                        {d.approved ? "approved" : "not approved"}
                      </Badge>
                    </td>
                    <td>
                      {d.policy ? (
                        <>
                          {d.policy.eligible ? "Eligible" : "Not eligible"} ·{" "}
                          {usd(d.policy.rateCents)} over {d.policy.threshold}
                          <small>Effective {d.policy.effectiveDate}</small>
                        </>
                      ) : (
                        "No effective policy"
                      )}
                    </td>
                    <td>
                      {d.commissionCents === null ? "Unknown" : usd(d.commissionCents)}
                      <small>{d.calculationPeriod}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No daily counts" text="No payroll daily counts exist in this range." />
        )}
      </Section>

      <Section
        title="Payroll periods overlapping range"
        note="Full actual period amounts. Never add these once per day."
        count={data.pay.periods.length}
      >
        {data.pay.noPeriod ? (
          <Empty title="No payroll period" text="No payroll period overlaps this range." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Employee</th>
                  <th>Status</th>
                  <th>Full base</th>
                  <th>Commission</th>
                  <th>Gross</th>
                  <th>Missing / snapshot</th>
                </tr>
              </thead>
              <tbody>
                {data.pay.periods.map((r) => (
                  <tr key={`${r.periodId}-${r.employeeId}`}>
                    <td>
                      <RecordLink className="text-link" href={`/payroll/${r.periodId}`}>
                        {r.start} to {r.end}
                      </RecordLink>
                    </td>
                    <td>
                      {r.employee}
                      <small>{r.eligibleCounts} counted tests</small>
                    </td>
                    <td>
                      <Badge tone={r.snapshot ? "green" : r.missing.length ? "amber" : "neutral"}>
                        {r.status}
                      </Badge>
                    </td>
                    <td>{r.baseCents === null ? "Incomplete" : usd(r.baseCents)}</td>
                    <td>{r.commissionCents === null ? "Incomplete" : usd(r.commissionCents)}</td>
                    <td>{r.grossCents === null ? "Incomplete" : usd(r.grossCents)}</td>
                    <td>
                      {r.snapshot ? (
                        <>
                          Approved snapshot: {usd(r.snapshot.baseCents)} +{" "}
                          {usd(r.snapshot.commissionCents)} = {usd(r.snapshot.totalCents)}
                          <small>Immutable; later source changes do not alter it.</small>
                        </>
                      ) : null}
                      {r.missing.map((m) => (
                        <small key={m}>Missing: {m}</small>
                      ))}
                      <small>{r.explanation}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Coverage by day"
        note={`Last successful manual import: ${data.lastSuccessfulImport ? fmtInstant(data.lastSuccessfulImport.createdAt) : "none"}. No live sync.`}
      >
        <div className="card-body checks">
          {data.days.map((d) => (
            <Badge key={d.date} tone={d.attested ? "green" : "amber"}>
              {d.date} · {d.attested ? "attested" : "missing"}
              {d.pending ? ` · ${d.pending} pending` : ""}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="Reconciliations in range" count={data.reconciliations.length}>
        {data.reconciliations.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Count version</th>
                  <th>Review</th>
                  <th>Approval</th>
                </tr>
              </thead>
              <tbody>
                {data.reconciliations.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{nameOf(r.employeeId) ?? r.employeeId}</td>
                    <td>
                      v{r.countVersion}
                      <small>Current v{r.currentCountVersion ?? "missing"}</small>
                    </td>
                    <td>
                      <Badge tone={r.needsReview ? "danger" : "green"}>
                        {r.needsReview ? "needs review: source changed" : "matches evidence"}
                      </Badge>
                    </td>
                    <td>{r.approved ? "Approved in payroll" : "Not approved"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No reconciliations" text="Reconcile finished, attested days in setup." />
        )}
      </Section>
    </>
  );
}
