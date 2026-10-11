import Link from "next/link";
import { requireRole } from "@/lib/require-role";
import { addDays, businessDate } from "@/lib/time";
import { performance } from "@/modules/station/performance";
import {
  attestStationAction,
  reconcileStationAction,
} from "@/app/station-actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Empty } from "@/components/shared";
import { Badge, Boundary, fmtInstant } from "@/components/phase5";
import { Section } from "@/components/station-ui";
import { StationImportForm } from "@/components/station-import-form";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function StationDataManagement({
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
  const employees = data.employeeOptions;
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.user.name ?? id;
  const durations = data.imports.filter((i) => i.status === "IMPORTED").map((i) => i.elapsedMs);
  const attestable = data.imports.filter((i) => i.status === "IMPORTED" && i.endDate < today);
  return (
    <>
      <PageHeader
        eyebrow="OWNER · EMISSIONS"
        title="Station data"
        description="Import station reports, review coverage, and reconcile daily counts."
      >
        <Link className="button button-outline" href="/settings">
          Back to Settings
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
                  <input name="expectedRows" type="number" min={1} required inputMode="numeric" />
                  <small>
                    Zero-test days cannot be confirmed: the provider&apos;s zero-report format is
                    unverified.
                  </small>
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
