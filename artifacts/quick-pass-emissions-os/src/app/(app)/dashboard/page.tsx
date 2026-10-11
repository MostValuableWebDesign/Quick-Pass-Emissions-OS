import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Gauge,
  Phone,
  Users,
} from "lucide-react";
import { currentUser } from "@/lib/access";
import { isEmissionsClosedOn } from "@/modules/station/operating-hours";
import { PageHeader } from "@/components/shared";
import { RecordLink } from "@/components/record-link";
import { CertificateOrderLink } from "@/components/certificate-order-link";
import { businessDashboard } from "@/modules/dashboard/service";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ attentionPage?: string }>;
}) {
  const user = await currentUser();
  const data = await businessDashboard(user.id);
  const emissionsClosedToday = isEmissionsClosedOn(data.today);
  const params = await searchParams;
  const requested = Number(params.attentionPage ?? 1);
  const pages = Math.max(1, Math.ceil(data.attention.length / 15));
  const page = Math.min(pages, Number.isSafeInteger(requested) && requested > 0 ? requested : 1);
  const attention = data.attention.slice((page - 1) * 15, page * 15);
  return (
    <div className="business-dashboard">
      <PageHeader
        title="Dashboard"
        description={`${data.today} · Today so far · America/New_York`}
      />
      {data.demo && (
        <div className="notice">
          <strong>DEMONSTRATION WORKSPACE</strong> · These figures may include sample data.
        </div>
      )}
      {emissionsClosedToday && (
        <div className="notice warning dashboard-sunday-closure" role="status">
          <CalendarDays size={18} aria-hidden="true" />
          <strong>Emissions testing is closed today (Sunday).</strong>
        </div>
      )}
      <section aria-labelledby="snapshot-heading">
        <h2 id="snapshot-heading" className="dashboard-section-title">
          Today’s business snapshot
        </h2>
        <div className="business-snapshot">
          <article className="stat">
            <div className="stat-top">
              <h3>Tests performed today</h3>
              <Gauge size={19} aria-hidden="true" />
            </div>
            <strong>{data.tests.performed ?? "Unavailable"}</strong>
            {data.tests.performed !== null ? (
              <>
                <p>
                  <b>{data.tests.eligible}</b> confirmed commission-eligible
                </p>
                <p className="muted">
                  {data.tests.awaitingReview} awaiting eligibility review. Imported tests only;
                  today may be incomplete.
                </p>
              </>
            ) : (
              <p className="muted">
                No reviewed station import for today. Missing data does not mean zero tests.
              </p>
            )}
            <small>
              {data.tests.approvedEmployeeCounts} approved employee test counts for commissions.
              Separate from station totals.
            </small>
          </article>
          <article className="stat">
            <div className="stat-top">
              <h3>Revenue today</h3>
              <ArrowUpRight size={19} aria-hidden="true" />
            </div>
            <strong>{money(data.revenue.received)}</strong>
            <p>Received · dealer & rental payments, net of reversals</p>
            {data.revenue.received === 0 && <p className="muted">No payment receipts recorded today.</p>}
            <dl className="snapshot-breakdown">
              <div>
                <dt>Billed · dealer invoices</dt>
                <dd>{money(data.revenue.billed)}</dd>
              </div>
              <div>
                <dt>Estimated · imported retail tests</dt>
                <dd>
                  {data.revenue.retailEstimate === null
                     ? data.tests.performed === null ? "No station import" : "Pricing/review required"
                    : money(data.revenue.retailEstimate)}
                </dd>
              </div>
            </dl>
            <details className="revenue-details">
              <summary>More revenue details</summary>
              <dl className="snapshot-breakdown">
                <div>
                  <dt>Other recorded estimates</dt>
                  <dd>{money(data.revenue.otherEstimates)}</dd>
                </div>
                <div>
                  <dt>Verified manual revenue</dt>
                  <dd>{money(data.revenue.verifiedManual)}</dd>
                </div>
              </dl>
              <p className="muted">
                Received includes dated dealer and rental payments, net of reversals. Estimates are
                not receipts. Unrecorded revenue is not included.
              </p>
            </details>
            <small>
              Separate measures; do not add them together.{" "}
              {data.revenue.unpricedRetail > 0 &&
                `${data.revenue.unpricedRetail} retail tests lack pricing. `}
              {data.revenue.unverifiedManual > 0 &&
                `${money(data.revenue.unverifiedManual)} manual revenue awaits verification. `}
            </small>
          </article>
          <article className="stat">
            <div className="stat-top">
              <h3>Employee gross pay so far</h3>
              <Users size={19} aria-hidden="true" />
            </div>
            <strong>
              {data.pay.grossCents === null ? "Incomplete" : money(data.pay.grossCents)}
            </strong>
            <dl className="snapshot-breakdown">
              <div>
                <dt>Base pay{data.pay.baseCents === null ? " · recorded subtotal" : ""}</dt>
                <dd>{money(data.pay.knownBaseCents)}</dd>
              </div>
              <div>
                <dt>
                  Commissions{data.pay.commissionCents === null ? " · recorded subtotal" : ""}
                </dt>
                <dd>{money(data.pay.knownCommissionCents)}</dd>
              </div>
            </dl>
            <p className="muted">
              Approved payroll inputs only; Performance pay estimates are separate.
            </p>
            {data.pay.grossCents === null && <Link href="/payroll">Review payroll inputs</Link>}
            {data.pay.missing.length > 0 && (
              <details className="pay-input-gaps">
                <summary>{data.pay.missing.length} employees have incomplete inputs</summary>
                <ul>
                  {data.pay.missing.slice(0, 15).map((p) => (
                    <li key={p.id}>
                      {p.name}: {p.missing.join("; ")}.
                    </li>
                  ))}
                </ul>
                {data.pay.missing.length > 15 && <p>More employees need review in Payroll.</p>}
              </details>
            )}
            {data.pay.employees === 0 && (
              <p className="muted">No employee payroll records configured.</p>
            )}
            {data.pay.grossCents === null && (
              <small>Subtotals exclude missing inputs; they are not complete gross pay.</small>
            )}
          </article>
        </div>
      </section>
      <section className="card business-attention" aria-labelledby="attention-heading">
        <div className="card-heading">
          <div>
            <h2 id="attention-heading">
              <AlertTriangle size={22} aria-hidden="true" /> Needs attention
            </h2>
            <p>
              {data.attention.length} unresolved items · critical first, then overdue/reorder, then
              upcoming
            </p>
          </div>
          <span className={`badge ${data.attention.length ? "amber" : "green"}`}>
            {data.attention.length} open
          </span>
        </div>
        {attention.length ? (
          <ol className="attention-items" start={(page - 1) * 15 + 1}>
            {attention.map((item) => (
              <li key={item.id}>
                <span
                  className={`badge ${item.severity === "critical" ? "danger" : item.severity === "urgent" ? "amber" : "neutral"}`}
                >
                  {item.severity === "critical"
                    ? "Critical"
                    : item.severity === "urgent"
                      ? "Action needed"
                      : "Upcoming"}
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.detail}</p>
                </div>
                <RecordLink
                  className="text-link"
                  href={item.href}
                  aria-label={`Review ${item.title}`}
                >
                  Review <ArrowUpRight size={15} aria-hidden="true" />
                </RecordLink>
              </li>
            ))}
          </ol>
        ) : (
          <div className="card-body dashboard-clear">
            <CheckCircle2 size={23} aria-hidden="true" />
            <p>No unresolved attention items in the recorded data.</p>
          </div>
        )}
        <div className="dashboard-attention-footer">
          <p className="muted">
            Certifications: expired or due within {data.certificationDays} days. Only overdue,
            unpaid invoices and rental charges appear.{" "}
            {data.unknownInventory > 0 &&
              `${data.unknownInventory} inventory items have missing stock or planning setup; review Certificates and Chemicals for full coverage.`}
          </p>
          {pages > 1 && (
            <nav aria-label="Attention pages" className="pagination">
              {page > 1 && (
                <Link href={`/dashboard?attentionPage=${page - 1}#attention-heading`}>
                  Previous
                </Link>
              )}
              <span>
                Page {page} of {pages} · up to 15 items per page
              </span>
              {page < pages && (
                <Link href={`/dashboard?attentionPage=${page + 1}#attention-heading`}>Next</Link>
              )}
            </nav>
          )}
        </div>
      </section>
      <section aria-labelledby="quick-actions-heading">
        <h2 id="quick-actions-heading" className="dashboard-section-title">
          Quick actions
        </h2>
        <div className="dashboard-quick-actions">
          <div className="dashboard-shortcut">
            <CertificateOrderLink role={data.role} compact />
          </div>
          <div className="dashboard-shortcut">
            <Link className="button" href="/vendors">
              <Phone size={17} aria-hidden="true" /> Call Service & Support
            </Link>
            <p className="muted">
              Choose the right provider and use their verified contact details.
            </p>
          </div>
          <div className="dashboard-shortcut">
            <Link className="button" href="/payroll">
              Review payroll
            </Link>
            <p className="muted">Review employee pay, commissions and missing inputs.</p>
          </div>
          <div className="dashboard-shortcut">
            {data.role === "OWNER" ? (
              <Link className="button" href="/performance">
                Open Performance
              </Link>
            ) : (
              <span className="button" aria-disabled="true">
                Open Performance · owner access
              </span>
            )}
            <p className="muted">View emission volume, revenue trends and pay evidence.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
