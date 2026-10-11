"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ExternalLink } from "lucide-react";
import type { CertificateInsightsData } from "@/modules/certificates/order-history";
import { refreshCertificateInsightsAction } from "@/app/certificate-portal-actions";
import { CERTIFICATE_HISTORY_URL, CERTIFICATE_ANALYZER } from "@/modules/certificates/portal-types";
import { asOf } from "./certificate-portal-banner";

export function CertificateInsights({ initial, canRefresh }: { initial: CertificateInsightsData; canRefresh: boolean }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [analyzerOnly, setAnalyzerOnly] = useState(true);
  const mounted = useRef(false);
  const router = useRouter();

  useEffect(() => { queueMicrotask(() => setData(initial)); }, [initial]);
  async function refresh(force: boolean) {
    setBusy(true); setMessage(null);
    try {
      const result = await refreshCertificateInsightsAction(force);
      if (result.data) setData(result.data);
      if (!result.ok) setMessage(result.message ?? "Unable to refresh. Saved data is unchanged.");
      router.refresh();
    } catch { setMessage("Unable to refresh. Saved data is unchanged."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (mounted.current || !canRefresh) return;
    mounted.current = true;
    void refresh(false);
    // On-view lookup only. Prop refreshes must not trigger further provider calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRefresh]);

  const metrics = data.metrics;
  const records = analyzerOnly ? data.orders.filter((o) => o.analyzer === CERTIFICATE_ANALYZER) : data.orders;
  const pages = Math.max(1, Math.ceil(records.length / 25));
  const currentPage = Math.min(page, pages - 1);
  return (
    <section className="space-top" aria-label="Provider certificate inventory" data-testid="certificate-insights">
      <div className="portal-head">
        <div><h2>Certificate stock & planning</h2><p className="muted">GA102539 · {CERTIFICATE_ANALYZER} · Stock checked {asOf(data.portal.checkedAt)}</p></div>
        {canRefresh && <button type="button" className="button button-outline" onClick={() => void refresh(true)} disabled={busy} data-testid="button-refresh-certificate-insights">
          <RefreshCw size={15} aria-hidden="true" /> {busy ? "Checking provider…" : "Refresh stock & orders"}
        </button>}
      </div>
      {busy && <p role="status" className="muted">Loading the official station report and analyzer balance…</p>}
      {(message || data.error || data.portal.error) && <p role="status" className="notice warning">{message || data.error || data.portal.error}</p>}
      <section className="stats" aria-label="Certificate metrics">
        {[
          { label: "Certificate stock", value: metrics.balance ?? "Awaiting provider",
            note: "Official analyzer balance · no opening count required", id: "stock" },
          { label: "Average cert ordering frequency", value: metrics.averageOrderIntervalDays === null ? "Not enough orders" : `Every ${metrics.averageOrderIntervalDays.toFixed(1)} days`,
            note: metrics.averageOrderIntervalDays === null
              ? "Need two positive-quantity analyzer sale dates to measure order cadence"
              : metrics.sampleMode === "history"
                ? `Using the latest historical Sale Date interval (${metrics.sampleStart}–${metrics.sampleEnd}) until two dates fall within the ${metrics.windowDays}-day window`
                : `Average gap between analyzer Sale Dates · ${metrics.windowDays}-day window`, id: "usage" },
          { label: "Estimated depletion", value: metrics.depletionDate ?? "Awaiting stock & order interval",
            note: metrics.daysRemaining === null ? "Requires a balance and at least two order dates" : `About ${metrics.daysRemaining} days at the estimated ordering rate`, id: "depletion" },
          { label: "Reorder at", value: metrics.reorderAt,
            note: metrics.leadDays === null ? "Configured threshold · set lead time in ordering settings to include demand"
              : `Higher of configured thresholds and ${metrics.leadDays}-day estimated lead-time demand`, id: "reorder" },
        ].map((metric) => <article className="stat" key={metric.id} data-testid={`certificate-metric-${metric.id}`}>
          <div className="stat-top"><span>{metric.label}</span></div>
          <strong style={{ fontSize: "1.35rem" }}>{metric.value}</strong><small>{metric.note}</small>
        </article>)}
      </section>
      <p className="muted">Ordering frequency uses positive-quantity sale dates for {CERTIFICATE_ANALYZER}. Reorder and depletion estimates use certificates purchased between order dates, not measured consumption. Orders do not prove actual usage, voids, receipts or payment settlement. No stock ledger entries are created.</p>
      <section className="card card-body space-top" id="provider-order-history">
        <div className="portal-head">
          <div><h2>Georgia certificate order history</h2><p className="muted">{data.orders.length} station transactions · Report checked {asOf(data.checkedAt)}</p></div>
          <a className="button button-outline" href={CERTIFICATE_HISTORY_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} aria-hidden="true" /> Open official order report
          </a>
        </div>
        <label className="space-top"><input type="checkbox" checked={analyzerOnly} onChange={(event) => { setAnalyzerOnly(event.target.checked); setPage(0); }} /> Show {CERTIFICATE_ANALYZER} only</label>
        {!records.length ? <p className="muted">{data.checkedAt ? "No orders for this analyzer in the loaded station report." : "Order history has not been loaded yet."}</p> :
          <div className="table-scroll space-top"><table data-testid="provider-order-table">
            <thead><tr><th>Order date · provider local</th><th>Transaction</th><th>Analyzer</th><th>Certificates ordered</th><th>Provider analyzer flag</th></tr></thead>
            <tbody>{records.slice(currentPage * 25, (currentPage + 1) * 25).map((order) =>
              <tr key={order.transactionId}><td>{order.saleDate} {order.saleTime}</td><td>{order.transactionId}</td><td>{order.analyzer}</td><td>{order.quantity.toLocaleString("en-US")}</td><td>{order.analyzerFlag}</td></tr>)}</tbody>
          </table></div>}
        {records.length > 25 && <div className="portal-toolbar">
          <button type="button" className="button button-outline button-sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous orders</button>
          <span>Page {currentPage + 1} of {pages} · {records.length} matching orders</span>
          <button type="button" className="button button-outline button-sm" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Next orders</button>
        </div>}
      </section>
    </section>
  );
}
