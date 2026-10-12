import Link from "next/link";
import { requireRole } from "@/lib/require-role";
import { recordDetail } from "@/modules/station/service";
import { correctionStationAction, reviewStationAction } from "@/app/station-actions";
import { ActionForm, Field } from "@/components/action-form";
import { marketingOptions, recordSourceDetail } from "@/modules/marketing/service";
import { recordSource } from "@/app/marketing-actions";
import { SourceCampaignFields } from "@/components/marketing-client";
import { sourceOptions } from "@/components/marketing";
import { PageHeader, Empty } from "@/components/shared";
import { RecordLink } from "@/components/record-link";
import { Badge, Boundary, fmtInstant } from "@/components/phase5";
import { Last4, Section, SourceTime, StateBadge } from "@/components/station-ui";

export default async function StationTest({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["OWNER"]);
  const { id } = await params;
  const { record, employees, services, entries, candidates } = await recordDetail(user.id, id);
  const source = record.revisions.find((r) => r.id === record.currentRevisionId) ?? null;
  const nameOf = (eid: string | null) => employees.find((e) => e.id === eid)?.user.name ?? null;
  const [marketing, observation] = await Promise.all([
    marketingOptions(user.id),
    recordSourceDetail(user.id, id),
  ]);
  const editable = record.state !== "SUPERSEDED" && !!source;
  return (
    <>
      <PageHeader
        eyebrow="OWNER · STATION EVIDENCE"
        title={`Station test${source ? ` · ${source.outcome}` : ""}`}
        description={`Record ${record.id} · version ${record.version}`}
      >
        <Link className="button button-outline" href="/performance">
          Performance
        </Link>
      </PageHeader>
      <Boundary>
        The report lacks a stable test ID; identity is confirmed by owner review. Vehicle shown as
        last 4 only. Approved payroll snapshots are never changed here.
      </Boundary>
      <div className="two-columns">
        <Section title="Current source">
          {source ? (
            <div className="card-body">
              <p>
                <StateBadge state={record.state} />{" "}
                <Badge>
                  {record.disposition === "FINANCE"
                    ? "other receipt"
                    : record.disposition.toLowerCase()}
                </Badge>
              </p>
              <dl className="form-grid" style={{ marginTop: 8 }}>
                <div>
                  <dt className="muted">Source calendar date</dt>
                  <dd>{source.businessDate}</dd>
                </div>
                <div>
                  <dt className="muted">Source time</dt>
                  <dd>
                    <SourceTime value={source.sourceDate} />
                  </dd>
                </div>
                <div>
                  <dt className="muted">Issued by</dt>
                  <dd>{source.inspector}</dd>
                </div>
                <div>
                  <dt className="muted">Attributed employee</dt>
                  <dd>{nameOf(record.employeeId) ?? "Unmapped"}</dd>
                </div>
                <div>
                  <dt className="muted">Vehicle</dt>
                  <dd>
                    <Last4 value={source.vehicleSuffix} />
                  </dd>
                </div>
                <div>
                  <dt className="muted">Certificate</dt>
                  <dd>{source.certificate || "None"}</dd>
                </div>
                <div>
                  <dt className="muted">Eligible</dt>
                  <dd>
                    {record.eligible === null ? "Unresolved" : record.eligible ? "Yes" : "No"}
                  </dd>
                </div>
                <div>
                  <dt className="muted">Evidence</dt>
                  <dd>
                    {record.dealerServiceId
                      ? (() => {
                          const s = services.find((x) => x.id === record.dealerServiceId);
                          return s?.invoiceId ? (
                            <RecordLink className="text-link" href={`/invoices/${s.invoiceId}`}>
                              Dealer service {s.reference}
                            </RecordLink>
                          ) : (
                            `Dealer service ${record.dealerServiceId}`
                          );
                        })()
                      : null}
                    {record.financeEntryId ? (
                      <span>
                        Linked receipt record{" "}
                        {entries.find((x) => x.id === record.financeEntryId)?.reference ??
                          record.financeEntryId}
                      </span>
                    ) : null}
                    {!record.dealerServiceId && !record.financeEntryId && "None linked"}
                  </dd>
                </div>
              </dl>
              {record.reason && <p className="muted">Last reason: {record.reason}</p>}
            </div>
          ) : (
            <Empty title="No current source" text="This record was superseded by a correction." />
          )}
        </Section>
        <Section title="Revision history" count={record.revisions.length}>
          <div className="card-body timeline">
            {record.revisions.map((r) => (
              <div key={r.id}>
                <span className="timeline-dot" />
                <p>
                  <strong>{r.id === record.currentRevisionId ? "Current" : "Earlier"}</strong> ·{" "}
                  {r.businessDate} {r.sourceDate} · {r.inspector} · {r.outcome} · …
                  {r.vehicleSuffix.slice(-4)}
                  <small>
                    Observed {fmtInstant(r.observedAt)} · import {r.importId}
                  </small>
                </p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {editable && (
        <Section
          title="Review"
          note="Confirms identity. Changing a reviewed source marks dependent reconciliations as needing review."
        >
          <div className="card-body">
            <ActionForm action={reviewStationAction} submit="Confirm review">
              <input type="hidden" name="recordId" value={record.id} />
              <input type="hidden" name="version" value={record.version} />
              <label className="field">
                <span>Disposition</span>
                <select name="disposition" defaultValue={record.disposition}>
                  <option value="RETAIL">Retail (price estimate)</option>
                  <option value="DEALER">Dealer (link service)</option>
                  <option value="FINANCE">Other receipt record</option>
                  <option value="EXCLUDED">Excluded</option>
                  <option value="UNRESOLVED">Unresolved</option>
                </select>
              </label>
              <label className="field">
                <span>Commission eligibility</span>
                <select name="eligibility" defaultValue="RULE">
                  <option value="RULE">Use effective outcome rule</option>
                  <option value="YES">Eligible (override)</option>
                  <option value="NO">Not eligible (override)</option>
                </select>
              </label>
              <label className="field">
                <span>Dealer service (DEALER only)</span>
                <select name="dealerServiceId" defaultValue={record.dealerServiceId ?? ""}>
                  <option value="">None</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.reference} · qty {s.quantity}
                      {s.invoiceId ? " · invoiced" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Receipt evidence record (revenue only)</span>
                <select name="financeEntryId" defaultValue={record.financeEntryId ?? ""}>
                  <option value="">None</option>
                  {entries.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.reference}
                      {e.verifiedAt ? " · verified" : " · unverified"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check wide">
                <input type="checkbox" name="reattribute" value="true" /> Reapply the current Issued
                By mapping to this historical record (explicit reattribution)
              </label>
              <label className="field wide">
                <span>Reason</span>
                <input name="reason" required maxLength={2000} />
              </label>
            </ActionForm>
          </div>
        </Section>
      )}

      <Section
        title="Possible corrections"
        note="Suggestions share the same vehicle hash only. Nothing is merged automatically."
        count={candidates.length}
      >
        <div className="card-body">
          {record.state !== "PENDING" ? (
            <p className="muted">
              Only a pending incoming record can be linked as a correction of an original.
            </p>
          ) : null}
          {candidates.length === 0 ? (
            <Empty title="No candidates" text="No other record shares this vehicle." />
          ) : (
            candidates.map((c) => (
              <div key={c.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                <p>
                  Original{" "}
                  <RecordLink className="text-link" href={`/performance/tests/${c.id}`}>
                    {c.id}
                  </RecordLink>{" "}
                  · version {c.version}
                </p>
                {record.state === "PENDING" && (
                  <ActionForm
                    action={correctionStationAction}
                    submit="Link this record as its correction"
                  >
                    <input type="hidden" name="recordId" value={record.id} />
                    <input type="hidden" name="version" value={record.version} />
                    <input type="hidden" name="originalId" value={c.id} />
                    <input type="hidden" name="originalVersion" value={c.version} />
                    <label className="field wide">
                      <span>Reason (original returns to pending review)</span>
                      <input name="reason" required maxLength={2000} />
                    </label>
                  </ActionForm>
                )}
              </div>
            ))
          )}
          {record.state === "PENDING" && (
            <ActionForm action={correctionStationAction} submit="Link a verified original record">
              <input type="hidden" name="recordId" value={record.id} />
              <input type="hidden" name="version" value={record.version} />
              <p className="wide muted">
                If the source corrected vehicle information, verify the original in the portal, then
                copy its record ID and current version from its evidence page. Similar vehicle
                information is not identity proof.
              </p>
              <label className="field">
                <span>Verified original record ID</span>
                <input name="originalId" required />
              </label>
              <label className="field">
                <span>Original current version</span>
                <input name="originalVersion" type="number" min={1} required />
              </label>
              <label className="field wide">
                <span>Identity verification reason</span>
                <input name="reason" required maxLength={2000} />
              </label>
            </ActionForm>
          )}
        </div>
      </Section>
      {editable && (
        <Section title="How did you hear about us?">
          <div className="card-body">
            <p className="muted">
              Customer-reported source only. Promo code attribution is tracked separately. Unknown
              or missing answers cannot be assigned to a campaign.
            </p>
            <ActionForm action={recordSource} submit="Save source">
              <input type="hidden" name="recordId" value={record.id} />
              <input type="hidden" name="version" value={observation?.version ?? 0} />
              <SourceCampaignFields
                sources={sourceOptions}
                campaigns={marketing.campaigns}
                source={observation?.source ?? ""}
                campaignId={observation?.campaignId ?? ""}
              />
              <Field label="Evidence · optional" wide>
                <input
                  name="evidence"
                  maxLength={2000}
                  defaultValue={observation?.evidence ?? ""}
                />
              </Field>
            </ActionForm>
          </div>
        </Section>
      )}
    </>
  );
}
