"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCcw } from "lucide-react";
import type { CertificatePortalStatus } from "@/modules/certificates/portal-types";
import { refreshCertificateBalanceAction } from "@/app/certificate-portal-actions";
import {
  CERTIFICATE_ORDER_URL,
  DEFAULT_CERTIFICATE_THRESHOLD,
  certificatesLow,
} from "@/modules/certificates/portal-types";
import { asOf } from "./certificate-portal-banner";
import type { SourceRefreshStatus } from "@/lib/source-refresh";
import { SourceRefreshIndicator } from "./source-refresh-indicator";

export function CertificatePortalBrowser({
  initial,
  canRefresh,
}: {
  initial: CertificatePortalStatus | null;
  canRefresh: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourceStatus, setSourceStatus] = useState<SourceRefreshStatus>("cached");

  useEffect(() => {
    queueMicrotask(() => setStatus(initial));
  }, [initial]);

  async function refresh() {
    setBusy(true);
    setMsg(null);
    setSourceStatus("checking");
    try {
      const res = await refreshCertificateBalanceAction(true);
      setSourceStatus(res.sourceStatus ?? "failed");
      const changed =
        !status || status.balance !== res.data.balance || status.threshold !== res.data.threshold;
      setStatus(res.data);
      setMsg(res.message ?? (res.ok ? null : "Balance check failed."));
      if (changed) router.refresh();
    } catch {
      setSourceStatus("failed");
      setMsg("Balance check failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const low = status ? certificatesLow(status.balance, status.threshold) : false;
  return (
    <section
      className="card card-body portal-card"
      id="portal"
      aria-label="Certificate purchasing portal"
    >
      <div className="portal-head">
        <div>
          <h2>Purchase certificates on the provider portal</h2>
          <dl className="portal-ids">
            <div>
              <dt>Station</dt>
              <dd data-testid="text-station">
                {status?.station ?? "GA102539 - QUICK PASS EMISSIONS INC"}
              </dd>
            </div>
            <div>
              <dt>Analyzer</dt>
              <dd data-testid="text-analyzer">{status?.analyzer ?? "HT111411"}</dd>
            </div>
          </dl>
        </div>
        <div className={`portal-balance${low ? " low" : ""}`} data-testid="status-portal-balance">
          <span>Portal balance</span>
          <strong>{status?.balance ?? "Unknown"}</strong>
          <small>
            As of {asOf(status?.checkedAt ?? null)} · alert at or below{" "}
            {status?.threshold ?? DEFAULT_CERTIFICATE_THRESHOLD}
          </small>
          {status?.error && <small className="error-text">Last check failed: {status.error}</small>}
          {canRefresh && (
            <button
              type="button"
              className="button button-outline button-sm"
              onClick={refresh}
              disabled={busy}
              data-testid="button-refresh-balance"
            >
              <RefreshCcw size={14} aria-hidden="true" /> {busy ? "Checking…" : "Refresh balance"}
            </button>
          )}
          <SourceRefreshIndicator status={sourceStatus} source="Georgia Dashboard" />
          {msg && <small role="status">{msg}</small>}
        </div>
      </div>
      <div className="portal-sign-in">
        <a
          className="button button-primary"
          href={CERTIFICATE_ORDER_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="link-open-portal"
        >
          <ExternalLink size={16} aria-hidden="true" /> Open Georgia dashboard
        </a>
      </div>
    </section>
  );
}
