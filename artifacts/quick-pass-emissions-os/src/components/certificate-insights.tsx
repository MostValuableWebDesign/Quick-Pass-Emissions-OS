"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ExternalLink } from "lucide-react";
import type { CertificateInsightsData } from "@/modules/certificates/order-history";
import { refreshCertificateInsightsAction } from "@/app/certificate-portal-actions";
import {
  CERTIFICATE_HISTORY_URL,
  CERTIFICATE_ANALYZER,
  DEFAULT_CERTIFICATE_THRESHOLD,
  certificatesLow,
} from "@/modules/certificates/portal-types";
import { asOf } from "./certificate-portal-banner";
import type { SourceRefreshStatus } from "@/lib/source-refresh";
import { SourceRefreshIndicator } from "./source-refresh-indicator";

export function CertificateInsights({
  initial,
  canRefresh,
}: {
  initial: CertificateInsightsData;
  canRefresh: boolean;
}) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ordersSourceStatus, setOrdersSourceStatus] = useState<SourceRefreshStatus>("cached");
  const [balanceSourceStatus, setBalanceSourceStatus] = useState<SourceRefreshStatus>("cached");
  const mounted = useRef(false);
  const router = useRouter();

  useEffect(() => {
    queueMicrotask(() => setData(initial));
  }, [initial]);
  async function refresh(force: boolean) {
    setBusy(true);
    setMessage(null);
    setOrdersSourceStatus("checking");
    setBalanceSourceStatus("checking");
    try {
      const result = await refreshCertificateInsightsAction(force);
      if (result.data) setData(result.data);
      setOrdersSourceStatus(result.sourceStatuses?.orders ?? "failed");
      setBalanceSourceStatus(result.sourceStatuses?.balance ?? "failed");
      if (!result.ok) setMessage(result.message ?? "Unable to refresh. Saved data is unchanged.");
      router.refresh();
    } catch {
      setOrdersSourceStatus("failed");
      setBalanceSourceStatus("failed");
      setMessage("Unable to refresh. Saved data is unchanged.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (mounted.current || !canRefresh) return;
    mounted.current = true;
    void refresh(false);
    // On-view lookup only. Prop refreshes must not trigger further provider calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRefresh]);

  const metrics = data.metrics;
  const records = data.orders.filter((o) => o.analyzer === CERTIFICATE_ANALYZER);
  const alertThreshold = data.portal?.threshold ?? DEFAULT_CERTIFICATE_THRESHOLD;
  const lowStock = certificatesLow(metrics.balance, alertThreshold);
  return (
    <section
      className="space-top"
      aria-label="Provider certificate inventory"
      data-testid="certificate-insights"
    >
      <div className="certificate-refresh-stack">
        {canRefresh && (
          <button
            type="button"
            className="button button-outline"
            onClick={() => void refresh(true)}
            disabled={busy}
            data-testid="button-refresh-certificate-insights"
          >
            <RefreshCw size={15} aria-hidden="true" />{" "}
            {busy ? "Checking provider…" : "Refresh stock & orders"}
          </button>
        )}
        <div className="certificate-source-status">
          <SourceRefreshIndicator
            label="Order history"
            status={ordersSourceStatus}
            source="Georgia Dashboard"
          />
          <SourceRefreshIndicator
            label="Stock balance"
            status={balanceSourceStatus}
            source="Georgia Dashboard"
          />
        </div>
      </div>
      {(message || data.error || data.portal.error) && (
        <p role="status" className="notice warning">
          {message || data.error || data.portal.error}
        </p>
      )}
      <section className="stats" aria-label="Certificate metrics">
        {[
          {
            label: "Certificate stock",
            value: metrics.balance ?? "Awaiting provider",
            note: `As of ${asOf(data.portal?.checkedAt ?? null)} · alert at or below ${alertThreshold}`,
            id: "stock",
          },
          {
            label: "Average cert ordering frequency",
            value:
              metrics.averageOrderIntervalDays === null
                ? "Not enough orders"
                : `Every ${metrics.averageOrderIntervalDays.toFixed(1)} days`,
            note:
              metrics.averageOrderIntervalDays === null
                ? "Need two positive-quantity analyzer sale dates to measure order cadence"
                : metrics.sampleMode === "history"
                  ? `Using the latest historical Sale Date interval (${metrics.sampleStart}–${metrics.sampleEnd}) until two dates fall within the ${metrics.windowDays}-day window`
                  : `Average gap between analyzer Sale Dates · ${metrics.windowDays}-day window`,
            id: "usage",
          },
          {
            label: "Estimated depletion",
            value: metrics.depletionDate ?? "Awaiting stock & order interval",
            note:
              metrics.daysRemaining === null
                ? "Requires a balance and at least two order dates"
                : `About ${metrics.daysRemaining} days at the estimated ordering rate`,
            id: "depletion",
          },
          {
            label: "Reorder at",
            value: metrics.reorderAt,
            note:
              metrics.leadDays === null
                ? "Configured threshold · lead-time demand is not included"
                : `Higher of configured thresholds and ${metrics.leadDays}-day estimated lead-time demand`,
            id: "reorder",
          },
        ].map((metric) => (
          <article
            className={`stat${metric.id === "stock" && lowStock ? " certificate-stock-low" : ""}`}
            key={metric.id}
            data-testid={`certificate-metric-${metric.id}`}
            data-low={metric.id === "stock" ? lowStock : undefined}
          >
            <div className="stat-top">
              <span>{metric.label}</span>
            </div>
            <strong style={{ fontSize: "1.35rem" }}>{metric.value}</strong>
            <small>{metric.note}</small>
          </article>
        ))}
      </section>
      <section className="card card-body space-top" id="provider-order-history">
        <div className="portal-head">
          <div>
            <h2>Georgia certificate order history</h2>
            <p className="muted">
              Showing the latest {Math.min(records.length, 10)} of {records.length} matching orders
              · Report checked {asOf(data.checkedAt)}
            </p>
          </div>
          <a
            className="button button-outline"
            href={CERTIFICATE_HISTORY_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={15} aria-hidden="true" /> Open official order report
          </a>
        </div>
        {!records.length ? (
          <p className="muted">
            {data.checkedAt
              ? "No orders for this analyzer in the loaded station report."
              : "Order history has not been loaded yet."}
          </p>
        ) : (
          <div className="table-scroll space-top">
            <table data-testid="provider-order-table">
              <thead>
                <tr>
                  <th>Order date</th>
                  <th>Transaction</th>
                  <th>Analyzer</th>
                  <th>Certificates ordered</th>
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 10).map((order) => (
                  <tr key={order.transactionId}>
                    <td>
                      {order.saleDate} {order.saleTime}
                    </td>
                    <td>{order.transactionId}</td>
                    <td>{order.analyzer}</td>
                    <td>{order.quantity.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
