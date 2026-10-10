import Link from "next/link";
import { requireRole } from "@/lib/require-role";
import { addDays, businessDate } from "@/lib/time";
import { performance } from "@/modules/station/performance";
import type { Hours } from "@/modules/station/projections";
import {
  attestStationAction,
  mappingStationAction,
  reconcileStationAction,
  ruleStationAction,
  settingsStationAction,
} from "@/app/station-actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Empty } from "@/components/shared";
import { Badge, Boundary, fmtInstant, usd } from "@/components/phase5";
import { Section } from "@/components/station-ui";
import { StationImportForm } from "@/components/station-import-form";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function StationSettings({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireRole(["OWNER"]);
  const q = await searchParams;
  const today = businessDate();
  const yesterday = addDays(today, -1);
  const date = q.date && DATE.test(q.date) && q.date < today ? q.date : yesterday;
  const data = await performance(user.id, { start: today, end: today });
  const day = date === today ? data : await performance(user.id, { start: date, end: date });
  const latest = [...data.settings].sort((a, b) => b.revision - a.revision)[0] ?? null;
  const hours = (latest?.hours ?? []) as Hours;
  const employees = data.employeeOptions;
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.user.name ?? id;
  const durations = data.imports.filter((i) => i.status === "IMPORTED").map((i) => i.elapsedMs);
  const attestable = data.imports.filter((i) => i.status === "IMPORTED" && i.endDate < today);
  return (
    <>
      <PageHeader
        eyebrow="OWNER · STATION"
        title="Performance setup"
        description="Manual report imports, coverage attestation, effective-dated settings, mappings, prices and payroll reconciliation."
      >
        <Link className="button button-outline" href="/performance">
          Back to performance
        </Link>
      </PageHeader>
      <Boundary>{data.liveAccess}</Boundary>

      <div className="two-columns">
        <Section
          title="Import portal report"
          note="Upload the original portal HTML .xls export, every page. Imports stay partial until attested."
        >
          <div className="card-body">
            <StationImportForm history={durations} />
          </div>
        </Section>
        <Section
          title="Recent imports"
          count={data.imports.length}
          note={`Last successful: ${data.lastSuccessfulImport ? fmtInstant(data.lastSuccessfulImport.createdAt) : "none"}`}
        >
          {data.imports.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Dates</th>
                    <th>Rows</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.imports.map((i) => (
                    <tr key={i.id}>
                      <td>
                        {fmtInstant(i.createdAt)}
                        <small>{(i.elapsedMs / 1000).toFixed(1)} s</small>
                      </td>
                      <td>
                        {i.startDate} to {i.endDate}
                      </td>
                      <td>
                        {i.rows}
                        <small>
                          {i.inserted} new · {i.duplicates} repeats
                        </small>
                      </td>
                      <td>
                        <Badge
                          tone={
                            i.status === "FAILED"
                              ? "danger"
                              : i.coverage === "OWNER_ATTESTED"
                                ? "green"
                                : "amber"
                          }
                        >
                          {i.status === "FAILED"
                            ? "failed"
                            : i.coverage === "OWNER_ATTESTED"
                              ? "attested"
                              : "partial"}
                        </Badge>
                        {i.error && <small>{i.error}</small>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No imports yet" text="Import a portal report to begin." />
          )}
        </Section>
      </div>

      <Section
        title="Attest coverage"
        note="Owner attestation, not a verified complete portal query."
        count={attestable.length}
      >
        <div className="card-body">
          <p className="muted">
            Before attesting: import every portal page for the range, resolve all identities and
            corrections, then enter the portal&apos;s own total. It must equal the combined
            confirmed distinct records across all imported fragments for those dates, not this
            file&apos;s row count.
          </p>
          {attestable.length ? (
            attestable.map((i) => (
              <ActionForm key={i.id} action={attestStationAction} submit="Attest complete">
                <input type="hidden" name="importId" value={i.id} />
                <p className="wide">
                  <strong>
                    {i.startDate} to {i.endDate}
                  </strong>{" "}
                  · imported {fmtInstant(i.createdAt)}
                </p>
                <label className="field">
                  <span>Portal total for these dates (all pages)</span>
                  <input name="expectedRows" type="number" min={0} required inputMode="numeric" />
                </label>
                <label className="field">
                  <span>Reason</span>
                  <input name="reason" required maxLength={2000} />
                </label>
              </ActionForm>
            ))
          ) : (
            <Empty
              title="Nothing to attest"
              text="Only successful imports of finished business days can be attested."
            />
          )}
        </div>
      </Section>

      <Section
        title="Station settings"
        note={
          latest
            ? `Revision ${latest.revision}, effective ${latest.effectiveDate}. New revisions must have a later effective date.`
            : "Not configured. This Week and projections are unavailable."
        }
      >
        <div className="card-body">
          {data.settings.length > 0 && (
            <p className="muted">
              History:{" "}
              {data.settings
                .map(
                  (s) =>
                    `r${s.revision} from ${s.effectiveDate} (week starts ${DAYS[s.weekStart - 1]}${s.sourceTimezoneConfirmed ? ", NY dates confirmed" : ", timezone unconfirmed"})`,
                )
                .join("; ")}
            </p>
          )}
          <ActionForm action={settingsStationAction} submit="Save new revision">
            <input type="hidden" name="revision" value={latest?.revision ?? 0} />
            <label className="field">
              <span>Effective date</span>
              <input type="date" name="effectiveDate" required />
            </label>
            <label className="field">
              <span>Week starts on</span>
              <select name="weekStart" defaultValue={latest?.weekStart ?? ""} required>
                <option value="" disabled>
                  Choose
                </option>
                {DAYS.map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="wide">
              <legend>Operating hours (split overnight hours by date)</legend>
              {DAYS.map((d, i) => {
                const n = i + 1;
                const h = hours.find((x) => x.weekday === n);
                return (
                  <div key={d} className="checks" style={{ alignItems: "center", marginBottom: 8 }}>
                    <label style={{ width: 80 }}>
                      <input
                        type="checkbox"
                        name={`openDay${n}`}
                        value="true"
                        defaultChecked={!!h}
                      />{" "}
                      {d}
                    </label>
                    <label>
                      Open{" "}
                      <input
                        type="time"
                        name={`open${n}`}
                        defaultValue={h?.open ?? ""}
                        style={{ width: 130 }}
                      />
                    </label>
                    <label>
                      Close{" "}
                      <input
                        type="time"
                        name={`close${n}`}
                        defaultValue={h?.close ?? ""}
                        style={{ width: 130 }}
                      />
                    </label>
                  </div>
                );
              })}
            </fieldset>
            <label className="field">
              <span>Observation days (7–365)</span>
              <input
                type="number"
                name="observationDays"
                min={7}
                max={365}
                defaultValue={latest?.observationDays ?? ""}
                required
              />
            </label>
            <label className="field">
              <span>Minimum usable days</span>
              <input
                type="number"
                name="minimumDays"
                min={1}
                max={365}
                defaultValue={latest?.minimumDays ?? ""}
                required
              />
            </label>
            <label className="check wide">
              <input
                type="checkbox"
                name="sourceTimezoneConfirmed"
                value="true"
                defaultChecked={!!latest?.sourceTimezoneConfirmed}
              />
              I confirm the portal&apos;s source calendar dates are America/New_York business dates.
              Provider timezone is unverified; payroll reconciliation is blocked until confirmed.
            </label>
            <label className="field wide">
              <span>Reason</span>
              <input name="reason" required maxLength={2000} />
            </label>
          </ActionForm>
          <p className="muted space-top">
            Closures are managed in{" "}
            <Link className="text-link" href="/settings">
              Settings
            </Link>
            .{" "}
            {data.closures.length
              ? `Current closures: ${data.closures
                  .map((c) => c.date)
                  .sort()
                  .join(", ")}`
              : "No closures recorded."}
          </p>
        </div>
      </Section>

      <div className="two-columns">
        <Section
          title="Issued By mappings"
          note="Exact label match. Existing records keep their attribution unless reattributed in review."
          count={data.mappings.length}
        >
          <div className="card-body">
            <ActionForm action={mappingStationAction} submit="Add mapping">
              <label className="field">
                <span>Exact Issued By label</span>
                <input name="inspector" required maxLength={160} />
              </label>
              <label className="field">
                <span>Employee</span>
                <select name="employeeId" required defaultValue="">
                  <option value="" disabled>
                    Choose
                  </option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.user.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Effective date</span>
                <input type="date" name="effectiveDate" required />
              </label>
              <label className="field">
                <span>Reason</span>
                <input name="reason" required maxLength={2000} />
              </label>
            </ActionForm>
            {data.mappings.map((m) => (
              <div className="list-row" key={m.id}>
                <span>
                  &ldquo;{m.inspector}&rdquo; → {nameOf(m.employeeId)}
                  <small>{m.reason}</small>
                </span>
                <span className="muted">from {m.effectiveDate}</span>
              </div>
            ))}
          </div>
        </Section>
        <Section
          title="Outcome rules & prices"
          note="Estimate inputs only, integer cents."
          count={data.rules.length}
        >
          <div className="card-body">
            <ActionForm action={ruleStationAction} submit="Add rule">
              <label className="field">
                <span>Outcome label</span>
                <input name="outcome" required maxLength={160} />
              </label>
              <label className="field">
                <span>Effective date</span>
                <input type="date" name="effectiveDate" required />
              </label>
              <label className="field">
                <span>Price (integer cents)</span>
                <input type="number" name="priceCents" min={0} step={1} required />
              </label>
              <label className="field">
                <span>Commission eligible</span>
                <select name="eligible" defaultValue="" required>
                  <option value="" disabled>
                    Choose confirmed rule
                  </option>
                  <option value="true">Eligible</option>
                  <option value="false">Not eligible</option>
                </select>
              </label>
              <label className="field wide">
                <span>Reason</span>
                <input name="reason" required maxLength={2000} />
              </label>
            </ActionForm>
            {data.rules.map((r) => (
              <div className="list-row" key={r.id}>
                <span>
                  {r.outcome} · {usd(r.priceCents)} · {r.eligible ? "eligible" : "not eligible"}
                  <small>{r.reason}</small>
                </span>
                <span className="muted">from {r.effectiveDate}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section
        title="Reconcile daily count"
        note="Replaces the payroll daily count and clears its approval. Approval remains independent in Payroll."
      >
        <div className="card-body">
          <form method="get" className="checks" style={{ alignItems: "end", marginBottom: 12 }}>
            <label className="field">
              <span>Date</span>
              <input type="date" name="date" max={yesterday} defaultValue={date} />
            </label>
            <button className="button button-outline button-sm">Load date</button>
          </form>
          <p className="muted">
            Current counts on {date}:{" "}
            {employees
              .map((e) => {
                const d = day.pay.daily.find((x) => x.employeeId === e.id);
                return `${e.user.name} v${d?.version ?? 0}${d ? ` (${d.count}${d.approved ? ", approved" : ""})` : ""}`;
              })
              .join("; ") || "none"}
            .{" "}
            <Link className="text-link" href="/payroll">
              Approve in Payroll
            </Link>
          </p>
          {employees.map((e) => {
            const d = day.pay.daily.find((x) => x.employeeId === e.id);
            return (
              <ActionForm
                key={e.id}
                action={reconcileStationAction}
                submit={`Reconcile ${e.user.name}`}
              >
                <input type="hidden" name="employeeId" value={e.id} />
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="expectedVersion" value={d?.version ?? 0} />
                <label className="field wide">
                  <span>
                    Reason for {e.user.name} on {date} (count version {d?.version ?? 0})
                  </span>
                  <input name="reason" required maxLength={2000} />
                </label>
              </ActionForm>
            );
          })}
          {day.reconciliations.map((r) => (
            <div className="list-row" key={r.id}>
              <span>
                {nameOf(r.employeeId)} · v{r.countVersion}
                <small>{fmtInstant(r.createdAt)}</small>
              </span>
              <Badge tone={r.needsReview ? "danger" : "green"}>
                {r.needsReview ? "needs review" : "current"}
              </Badge>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
