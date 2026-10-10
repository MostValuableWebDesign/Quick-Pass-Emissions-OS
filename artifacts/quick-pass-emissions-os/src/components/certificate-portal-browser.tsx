"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RotateCw, Maximize2, Minimize2, RefreshCcw } from "lucide-react";
import type { CertificatePortalStatus } from "@/modules/certificates/portal-types";
import { refreshCertificateBalanceAction } from "@/app/certificate-portal-actions";
import { CERTIFICATE_ORDER_URL } from "@/modules/certificates/portal-types";
import { asOf } from "./certificate-portal-banner";

export function CertificatePortalBrowser({ initial, canRefresh }: { initial: CertificatePortalStatus | null; canRefresh: boolean }) {
  const router = useRouter();
  const [frameKey, setFrameKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [embedded, setEmbedded] = useState(false);
  const [status, setStatus] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => { queueMicrotask(() => setStatus(initial)); }, [initial]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [expanded]);

  async function refresh() {
    setBusy(true); setMsg(null);
    try {
      const res = await refreshCertificateBalanceAction(true);
      const changed = !status || status.balance !== res.data.balance || status.threshold !== res.data.threshold;
      setStatus(res.data);
      setMsg(res.message ?? (res.ok ? "Portal balance updated." : "Balance check failed."));
      if (changed) router.refresh();
    } catch { setMsg("Balance check failed. Try again."); }
    finally { setBusy(false); }
  }

  const low = status?.balance != null && status.balance < status.threshold;
  return (
    <section className="card card-body portal-card" id="portal" aria-label="Certificate purchasing portal">
      <div className="portal-head">
        <div>
          <h2>Purchase certificates on the provider portal</h2>
          <dl className="portal-ids">
            <div><dt>Station</dt><dd data-testid="text-station">{status?.station ?? "GA102539 - QUICK PASS EMISSIONS INC"}</dd></div>
            <div><dt>Analyzer</dt><dd data-testid="text-analyzer">{status?.analyzer ?? "HT111411"}</dd></div>
          </dl>
        </div>
        <div className={`portal-balance${low ? " low" : ""}`} data-testid="status-portal-balance">
          <span>Portal balance</span>
          <strong>{status?.balance ?? "Unknown"}</strong>
          <small>As of {asOf(status?.checkedAt ?? null)} · alert below {status?.threshold ?? 30}</small>
          {status?.error && <small className="error-text">Last check failed: {status.error}</small>}
          {canRefresh && (
            <button type="button" className="button button-outline button-sm" onClick={refresh} disabled={busy} data-testid="button-refresh-balance">
              <RefreshCcw size={14} aria-hidden="true" /> {busy ? "Checking…" : "Refresh balance"}
            </button>
          )}
          {msg && <small role="status">{msg}</small>}
        </div>
      </div>
      <p className="muted">
        The portal loads directly from the provider. You sign in and place orders yourself; this app does
        not see, store or submit anything on it. Portal balance is read separately and is not ledger stock.
      </p>
      <div className="portal-sign-in">
        <p>The Georgia portal requires a separate browser tab for sign-in. Its session cookies do not support embedded login.</p>
        <a className="button" href={CERTIFICATE_ORDER_URL} target="_blank" rel="noopener noreferrer" data-testid="link-open-portal">
          <ExternalLink size={16} aria-hidden="true" /> Open Georgia dashboard
        </a>
        <button type="button" className="button button-outline" aria-expanded={embedded} aria-controls="embedded-georgia-portal"
          data-testid="button-toggle-embedded-portal"
          onClick={() => { setEmbedded((value) => !value); setExpanded(false); }}>
          {embedded ? "Hide embedded preview" : "Show embedded preview"}
        </button>
      </div>
      {embedded && <div ref={wrap} id="embedded-georgia-portal" className={`portal-frame-wrap${expanded ? " expanded" : ""}`}>
        <div className="portal-toolbar">
          <span className="portal-url">{CERTIFICATE_ORDER_URL}</span>
          <button type="button" className="button button-ghost button-sm" onClick={() => setFrameKey((k) => k + 1)} data-testid="button-reload-portal">
            <RotateCw size={14} aria-hidden="true" /> Reload
          </button>
          <button type="button" className="button button-ghost button-sm" onClick={() => setExpanded((v) => !v)} aria-pressed={expanded} data-testid="button-expand-portal">
            {expanded ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />} {expanded ? "Exit full screen" : "Full screen"}
          </button>
          <a className="button button-ghost button-sm" href={CERTIFICATE_ORDER_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} aria-hidden="true" /> Open sign-in tab
          </a>
        </div>
        <iframe key={frameKey} src={CERTIFICATE_ORDER_URL} title="Georgia dashboard certificate purchasing portal" className="portal-frame" referrerPolicy="no-referrer" />
      </div>}
    </section>
  );
}
