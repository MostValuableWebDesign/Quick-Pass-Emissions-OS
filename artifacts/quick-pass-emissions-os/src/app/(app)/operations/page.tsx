import Link from "next/link";
import { currentUser } from "@/lib/access";
import { formatDate } from "@/lib/time";
import { managerOverview, refreshWorkspace } from "@/modules/manager/service";
import { areas } from "@/modules/manager/rules";
import { vendorContacts } from "@/modules/manager/starter";
import { PageHeader, TaskTable } from "@/components/shared";
import { ActionForm } from "@/components/action-form";
import { managerAction } from "@/app/manager-actions";
import {
  WorkspaceTabs,
  Command,
  CreateManagerTask,
  money,
  words,
} from "@/components/manager-workspace";
import "./workspace.css";
export default async function Operations({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; filter?: string; area?: string }>;
}) {
  const actor = await currentUser(),
    query = await searchParams;
  const page = Math.max(1, Math.min(10000, Math.floor(Number(query.page)) || 1)),
    filter = query.filter ?? "active",
    area = areas.includes(query.area as (typeof areas)[number]) ? query.area! : "";
  await refreshWorkspace(actor.id);
  const data = await managerOverview(actor.id, page, filter, area);
  const link = (p: number) =>
    `/operations?page=${p}&filter=${encodeURIComponent(filter)}&area=${encodeURIComponent(area)}`;
  return (
    <>
      <PageHeader
        title="Operations manager"
        description={`Emissions & tag renewal · 3 self-service wash bays · 3 rented detail bays · ${data.today} Eastern`}
      >
        <Link className="button button-primary" href="/operations/schedule">
          View weekly schedule
        </Link>
        <Link className="button button-outline" href="/dashboard">
          Today’s business snapshot
        </Link>
      </PageHeader>
      <WorkspaceTabs />
      {!data.actor.employee && (
        <div className="notice warning">
          Your management account has no responsibility profile. Source-trigger assignment and your
          personal task schedule are unavailable. This creates only your management profile, with no
          pay rates or account-access changes. It can appear as unconfigured in payroll setup.
          <ActionForm action={managerAction} submit="Create my responsibility profile">
            <Command name="PROFILE" />
          </ActionForm>
        </div>
      )}
      {data.templates.some(
        (t) =>
          t.active &&
          t.frequency !== "ONCE" &&
          (!t.generatedThrough || t.generatedThrough < data.today),
      ) && (
        <div className="notice warning">
          Recurring-duty catch-up is pending. Existing tasks remain visible; each workspace refresh
          processes at most 93 calendar days per duty.
          <ActionForm action={managerAction} submit="Continue recurring catch-up">
            <Command name="REFRESH" />
          </ActionForm>
        </div>
      )}
      <div className="notice">
        Confirmed emissions / kiosk hours: Mon–Fri 8 AM–6 PM, Sat 8 AM–5 PM, Sunday closed. Personal
        availability and carwash hours are separate. Recurring work and triggers refresh when this
        workspace opens; unattended reminders need the existing independent runner.
      </div>
      <section className="card card-body">
        <div className="card-heading">
          <h2>Priorities & delegated work</h2>
          <span className="muted">{data.total} matching · 15 per page</span>
        </div>
        <form method="get" className="manager-filters">
          <label>
            Show
            <select name="filter" defaultValue={filter}>
              <option value="active">To do / in progress / waiting</option>
              <option value="overdue">Overdue</option>
              <option value="review">Delegated work awaiting review</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label>
            Business area
            <select name="area" defaultValue={area}>
              <option value="">All operations</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {words(a)}
                </option>
              ))}
            </select>
          </label>
          <button className="button button-outline">Apply</button>
        </form>
        <TaskTable tasks={data.tasks} />
        <div className="pagination">
          {page > 1 && <Link href={link(page - 1)}>← Previous</Link>}
          <span>Page {page}</span>
          {page * 15 < data.total && <Link href={link(page + 1)}>Next →</Link>}
        </div>
      </section>
      <div className="manager-grid">
        <section className="card card-body">
          <h2>Staffing & equipment</h2>
          <p>
            {data.shifts.length
              ? `${data.shifts.length} recorded shifts today. Coverage is partial until confirmed.`
              : "Missing: no shifts recorded for today."}
          </p>
          {data.shifts.map((s) => (
            <p key={s.id}>
              {s.employee.user.name} · {s.startTime}–{s.endTime}
              {!s.employee.user.active ? " · inactive" : ""}
            </p>
          ))}
          <p>
            {data.equipment.length} registered assets ·{" "}
            {data.state.items.filter((i) => i.kind === "Unresolved downtime").length} reported open
            outages. An absence of reports does not confirm availability.
          </p>
          <p>
            {data.bays.length
              ? data.bays.map((b) => `${b.identifier}: ${words(b.status)}`).join(" · ")
              : "Bay readiness missing; configure the existing six-bay register."}
          </p>
          <Link href="/schedule">Staff schedule</Link> · <Link href="/equipment">Equipment</Link> ·{" "}
          <Link href="/carwash">Bays</Link>
        </section>
        <section className="card card-body">
          <h2>Certificates, chemicals & supplies</h2>
          {data.state.inventory.map((i) => (
            <p key={i.key}>
              <Link href={i.key === "certificates" ? "/certificates" : "/chemicals"}>{i.name}</Link>{" "}
              · {i.balance === null ? "Missing stock" : `${i.balance} ${i.unit}`} · {words(i.state)}
              {i.low ? " · reorder attention" : ""}
            </p>
          ))}
          <p>
            {data.supplies.length
              ? `${data.supplies.length} supply types tracked; unknown counts stay missing.`
              : "General supply counts and reorder thresholds are unconfigured."}
          </p>
          <p>
            Certificate orders use ACH, minimum 300. Preparation, external submission, receipt and
            reconciliation are separate.
          </p>
          <Link href="/operations/supplies">Weekly supply review</Link>
        </section>
        <section className="card card-body">
          <h2>Payroll · Monday payment</h2>
          <p>Next payday: {data.nextMonday}. Calculated or approved gross is not paid payroll.</p>
          {data.payroll.length ? (
            data.payroll.map((p) => {
              const d = p.drafts[0],
                paid = data.payments.find((x) => x.sourceKey === `payroll:${p.id}`);
              return (
                <p key={p.id}>
                  <Link href={`/payroll/${p.id}`}>{p.label}</Link> ·{" "}
                  {d ? `${words(d.status)} gross ${money(d.totalCents)}` : "Inputs / draft missing"}{" "}
                  ·{" "}
                  {paid
                    ? paid.reconciledAt
                      ? "payment evidence independently reconciled"
                      : "payment recorded, pending reconciliation"
                    : "payment unconfirmed"}
                </p>
              );
            })
          ) : (
            <p>Missing: no payroll periods recorded.</p>
          )}
          <Link href="/payroll">Prepare / review payroll</Link> ·{" "}
          <Link href="/operations/registers">Record payment evidence</Link>
        </section>
        <section className="card card-body">
          <h2>Billing, balances & deposits</h2>
          {data.state.items
            .filter((i) => ["Dealership receivable", "Rental balance"].includes(i.kind))
            .slice(0, 15)
            .map((i, n) => (
              <p key={n}>
                <Link href={i.href}>
                  {i.kind} · {i.title}
                </Link>{" "}
                · due {i.date} · {i.amountCents === null ? "Missing" : money(i.amountCents)}{" "}
                recorded outstanding
              </p>
            ))}
          <p>
            {data.deposits.filter((d) => !d.reconciledAt).length} unreconciled deposit records in
            latest 15. Bank coverage is unconfirmed.
          </p>
          <Link href="/invoices">All invoices & follow-ups</Link> ·{" "}
          <Link href="/rentals">Rental terms / balances</Link> ·{" "}
          <Link href="/operations/registers">Checks & deposits</Link>
        </section>
        <section className="card card-body">
          <h2>Maintenance & vendor follow-ups</h2>
          {data.state.items
            .filter((i) => /maintenance|downtime/i.test(i.kind))
            .slice(0, 15)
            .map((i, n) => (
              <p key={n}>
                <Link href={i.href}>
                  {i.kind}: {i.title}
                </Link>{" "}
                · {i.date}
              </p>
            ))}
          <p>
            Readiness checks do not confirm repair completion. Use existing contact attempts,
            quotes, appointments and approval history.
          </p>
          <Link href="/maintenance">All reported issues</Link> ·{" "}
          <Link href="/vendors">Service & Support</Link>
        </section>
        <section className="card card-body">
          <h2>Marketing, website & promotions</h2>
          {data.campaigns.length ? (
            data.campaigns.map((c) => (
              <p key={c.id}>
                <Link href={`/marketing/campaigns/${c.id}`}>{c.name}</Link> · {words(c.status)} ·
                through {c.endDate} · {c.actions.filter((a) => a.status !== "COMPLETED").length}{" "}
                recorded actions
              </p>
            ))
          ) : (
            <p>
              Missing: no campaigns configured. Add objectives, owner, channel, drafts, review date
              and supplied budget.
            </p>
          )}
          <p>
            Website work is tracked in responsibilities. No automatic publishing. Confirm Chamber
            dates before scheduling.
          </p>
          <Link href="/marketing/analytics">Measured promotion results</Link> ·{" "}
          <Link href="/operations?area=WEBSITE">Website tasks</Link> ·{" "}
          <Link href="/analytics">Google metrics / review drafts</Link>
        </section>
      </div>
      <CreateManagerTask data={data} />
      <details className="card card-body">
        <summary>Edit future recurring duties · latest 30</summary>
        {data.templates
          .filter((t) => t.frequency !== "ONCE")
          .map((t) => (
            <CreateManagerTask data={data} template={t} key={t.id} />
          ))}
      </details>
      <section className="card card-body">
        <h2>My recurring schedule</h2>
        <p>
          A proposed Monday–Saturday schedule is populated automatically from your responsibilities.
          Review it or adjust recurring times; these are management work blocks, not payroll time
          records. Add inventory, bank, service-call or event tasks only when needed.
        </p>
        <Link className="button button-outline" href="/operations/schedule">
          Review or adjust schedule
        </Link>
      </section>
      <details className="card card-body">
        <summary>Pay guide · unverified reference</summary>
        <p>
          Al: $1,150/week ($23 × 10 hours × 5 days). John: $1,150/week. Clinton: approximately
          $900/week, variable hours. Sabino: $100 each Monday plus $50 for grass cutting when
          performed.
        </p>
        <p>
          Guide commission: $1 per vehicle above 50 daily vehicles per eligible employee (95 → $45).
          Existing approved payroll policies remain authoritative. Verify shop versus personal
          scope, attendance, eligibility, free retests and pay-period rules before changing pay.
          Grass cutting must be included only once in approved pay; no separate payment is created
          here.
        </p>
        <Link href="/payroll">Compare with effective-dated pay rules</Link>
      </details>
      <details className="card card-body">
        <summary>Owner-supplied vendor contacts</summary>
        {vendorContacts.map((v) => (
          <p key={v.name}>
            {v.name} · {v.phone || "Phone missing"} · {v.reference} · {v.services}
          </p>
        ))}
        <p>
          Missing contacts may be added to the existing internal directory. Possible name/phone
          matches remain unchanged for review.
        </p>
        {actor.role === "OWNER" && (
          <ActionForm action={managerAction} submit="Add missing supplied contacts">
            <Command name="CONTACTS" />
          </ActionForm>
        )}
      </details>
      <p className="muted">
        Updated {formatDate(data.now)} Eastern. Confirmed = verified evidence; pending = awaiting
        review; missing = no source; partial = incomplete coverage; estimated = calculated
        assumption. <Link href="/reports">Operational reports</Link> and{" "}
        <Link href="/finance/reports">financial reports</Link> retain their source definitions.
      </p>
    </>
  );
}
