import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  DollarSign,
  CheckCircle2,
  FileCheck2,
  Gauge,
  Phone,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { currentUser } from "@/lib/access";
import { isEmissionsClosedOn } from "@/modules/station/operating-hours";
import { approvalRoles, BusinessError } from "@/modules/phase2";
import { readDashboard } from "@/modules/station/dashboard-service";
import type { DashboardData } from "@/modules/station/dashboard-types";
import { PageHeader } from "@/components/shared";
import { DashboardClock } from "@/components/dashboard-clock";
import { DashboardRefresh } from "@/components/dashboard-refresh";
import { RecordLink } from "@/components/record-link";
import { CertificateOrderLink } from "@/components/certificate-order-link";
import { businessDashboard } from "@/modules/dashboard/service";
import { readCertificatePortalStatus } from "@/modules/certificates/portal";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const dashboardUpdatedAtFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});
function DashboardLastUpdated({ at }: { at: Date }) {
  return (
    <p className="dashboard-panel-updated">
      Last updated{" "}
      <time dateTime={at.toISOString()}>{dashboardUpdatedAtFormat.format(at)}</time>
    </p>
  );
}
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ attentionPage?: string }>;
}) {
  const user = await currentUser();
  const now = new Date();
  const [data, certificateStatus] = await Promise.all([
    businessDashboard(user.id, now),
    readCertificatePortalStatus().catch(() => null),
  ]);
  let performanceData: DashboardData | null = null;
  if (user.role === "OWNER") {
    try {
      performanceData = await readDashboard(
        user.id,
        { start: data.today, end: data.today, trendDays: 7 },
        now,
      );
    } catch (error) {
      if (!(error instanceof BusinessError)) throw error;
    }
  }
  const performanceSummary = performanceData?.summary ?? null;
  const performanceDataIncomplete =
    performanceData !== null &&
    (performanceData.summary.cars === null || performanceData.summary.revenueCents === null);
  const performanceDataStale = performanceData?.staleDates.includes(data.today) ?? false;
  const emissionsClosedToday = isEmissionsClosedOn(data.today);
  const params = await searchParams;
  const requested = Number(params.attentionPage ?? 1);
  const pages = Math.max(1, Math.ceil(data.attention.length / 15));
  const page = Math.min(pages, Number.isSafeInteger(requested) && requested > 0 ? requested : 1);
  const attention = data.attention.slice((page - 1) * 15, page * 15);
  const dashboardUpdatedAt = new Date();
  return (
    <div className="business-dashboard">
      <PageHeader
        title="Dashboard"
        description={<DashboardClock businessDay={data.today} initialTime={now.toISOString()} />}
      >
        <DashboardRefresh
          today={data.today}
          canRefreshPerformance={user.role === "OWNER"}
          canRefreshCertificates={approvalRoles.includes(data.role)}
        />
      </PageHeader>
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
      {(performanceDataIncomplete || performanceDataStale) && (
        <div className="notice warning" role="status">
          {performanceDataIncomplete &&
            "Today’s Performance count or VIN history is incomplete; totals remain unavailable. "}
          {performanceDataStale && "Today’s cached Performance data is stale. "}
          <Link href="/performance">Review Performance</Link>
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
              <span className="dashboard-metric-icon dashboard-metric-icon--tests" aria-hidden="true">
                <Gauge size={19} />
              </span>
            </div>
            <strong>
              {performanceSummary?.cars == null
                ? "Unavailable"
                : performanceSummary.cars.toLocaleString("en-US")}
            </strong>
            <p>Paid cars</p>
            <small>
              Free 30-day retests excluded · {performanceSummary?.freeRetests ?? "—"} today.
            </small>
            <DashboardLastUpdated at={dashboardUpdatedAt} />
          </article>
          <article className="stat">
            <div className="stat-top">
              <h3>Revenue today</h3>
              <span className="dashboard-metric-icon dashboard-metric-icon--revenue" aria-hidden="true">
                <DollarSign size={19} />
              </span>
            </div>
            <strong>
              {performanceSummary?.revenueCents == null
                ? "Unavailable"
                : money(performanceSummary.revenueCents)}
            </strong>
            <p>Estimated at $20 per paid Pass/Fail test.</p>
            <DashboardLastUpdated at={dashboardUpdatedAt} />
          </article>
          <article className="stat">
            <div className="stat-top">
              <h3>Employee gross pay so far</h3>
              <span className="dashboard-metric-icon dashboard-metric-icon--pay" aria-hidden="true">
                <Users className="dashboard-pay-users" size={19} />
                <DollarSign className="dashboard-pay-dollar" size={14} />
              </span>
            </div>
            <strong>{performanceSummary?.payCents == null ? "Incomplete" : money(performanceSummary.payCents)}</strong>
            <dl className="snapshot-breakdown">
              <div>
                <dt>Estimated base pay</dt>
                <dd>
                  {performanceSummary?.baseCents == null
                    ? "Unavailable"
                    : money(performanceSummary.baseCents)}
                </dd>
              </div>
              <div>
                <dt>Estimated commission</dt>
                <dd>
                  {performanceSummary?.commissionCents == null
                    ? "Unavailable"
                    : money(performanceSummary.commissionCents)}
                </dd>
              </div>
            </dl>
            {!performanceData && (
              <p className="muted">
                {user.role === "OWNER"
                  ? "Performance data is unavailable."
                  : "Performance estimates require owner access."}
              </p>
            )}
            {performanceData && performanceSummary?.payCents == null && (
              <small>Performance pay inputs or daily test coverage are incomplete.</small>
            )}
            <DashboardLastUpdated at={dashboardUpdatedAt} />
          </article>
          <article
            className="stat dashboard-certificate-panel"
            data-low={
              certificateStatus?.balance !== null &&
              certificateStatus?.balance !== undefined &&
              certificateStatus.balance < certificateStatus.threshold
            }
          >
            <div className="stat-top">
              <h3>Certificates remaining</h3>
              <span
                className="dashboard-metric-icon dashboard-metric-icon--certificates"
                aria-hidden="true"
              >
                <FileCheck2 size={19} />
              </span>
            </div>
            <strong>{certificateStatus?.balance?.toLocaleString("en-US") ?? "Unavailable"}</strong>
            {certificateStatus && (
              <p>
                Station {certificateStatus.station} · Analyzer {certificateStatus.analyzer}
              </p>
            )}
            {certificateStatus?.error && certificateStatus.balance !== null && (
              <small className="dashboard-certificate-stale">
                Last refresh failed; showing the saved balance.
              </small>
            )}
            {certificateStatus?.balance !== null &&
              certificateStatus?.balance !== undefined &&
              certificateStatus.balance < certificateStatus.threshold && (
                <small className="dashboard-certificate-low">
                  Low · reorder threshold {certificateStatus.threshold}
                </small>
              )}
            {["OWNER", "ADMIN", "BOOKKEEPER"].includes(data.role) && (
              <Link className="dashboard-certificate-link" href="/certificates#portal">
                Certificate details <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            )}
            <DashboardLastUpdated at={dashboardUpdatedAt} />
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
          <div className="dashboard-shortcut dashboard-shortcut--certificates">
            <CertificateOrderLink role={data.role} compact />
          </div>
          <div className="dashboard-shortcut dashboard-shortcut--support">
            <Link className="button" href="/vendors">
              <Phone size={17} aria-hidden="true" /> Call Service & Support
            </Link>
            <p className="muted">
              Choose the right provider and use their verified contact details.
            </p>
          </div>
          <div className="dashboard-shortcut dashboard-shortcut--payroll">
            <Link className="button" href="/payroll">
              <Wallet size={17} aria-hidden="true" /> Review payroll
            </Link>
            <p className="muted">Review employee pay, commissions and missing inputs.</p>
          </div>
          <div className="dashboard-shortcut dashboard-shortcut--performance">
            {data.role === "OWNER" ? (
              <Link className="button" href="/performance">
                <TrendingUp size={17} aria-hidden="true" /> Open Performance
              </Link>
            ) : (
              <span className="button" aria-disabled="true">
                <TrendingUp size={17} aria-hidden="true" /> Open Performance · owner access
              </span>
            )}
            <p className="muted">View emission volume, revenue trends and pay evidence.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
