"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { CertificatePortalStatus } from "@/modules/certificates/portal-types";
import { certificatesLow } from "@/modules/certificates/portal-types";
import { refreshCertificateBalanceAction } from "@/app/certificate-portal-actions";

export function asOf(iso: string | null) {
  if (!iso) return "never checked";
  return (
    new Date(iso).toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    }) + " ET"
  );
}

export function CertificatePortalBanner({
  initial,
  role,
}: {
  initial: CertificatePortalStatus | null;
  role: string;
}) {
  const path = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const statusRef = useRef(initial);
  const inflight = useRef(false);
  const manager = role === "OWNER" || role === "ADMIN";

  useEffect(() => {
    queueMicrotask(() => {
      statusRef.current = initial;
      setStatus(initial);
    });
  }, [initial]);

  useEffect(() => {
    if (!manager || inflight.current) return;
    inflight.current = true;
    refreshCertificateBalanceAction(false)
      .then((res) => {
        const prev = statusRef.current;
        const next = res.data;
        statusRef.current = next;
        setStatus(next);
        if (!prev || prev.balance !== next.balance || prev.threshold !== next.threshold)
          router.refresh();
      })
      .catch(() => {})
      .finally(() => {
        inflight.current = false;
      });
  }, [path, manager, router]);

  if (!status) return null;
  const low = certificatesLow(status.balance, status.threshold);
  if (status.error && !low) {
    return (
      <div
        className="cert-banner"
        role="status"
        data-testid="banner-certificate-balance-unavailable"
      >
        <AlertTriangle size={20} aria-hidden="true" />
        <div>
          <strong>Certificate balance could not be refreshed</strong>
          <span>
            {status.balance === null
              ? " · No verified balance available."
              : ` · Last known: ${status.balance} · As of ${asOf(status.checkedAt)}`}
          </span>
          <small>{status.error}</small>
        </div>
        {["OWNER", "ADMIN", "BOOKKEEPER"].includes(role) && (
          <Link className="cert-banner-link" href="/certificates#portal">
            Check certificates
          </Link>
        )}
      </div>
    );
  }
  if (!low) return null;
  const stale = !!status.error;
  return (
    <div className="cert-banner" role="alert" data-testid="banner-low-certificates">
      <AlertTriangle size={20} aria-hidden="true" />
      <div>
        <strong>Low certificates: {status.balance} left on the portal</strong>
        <span>
          {" "}
          · Alert threshold {status.threshold} · Station {status.station} · As of{" "}
          {asOf(status.checkedAt)}
        </span>
        {stale && (
          <small>
            Latest check failed ({status.error}). Showing last known balance; it may be out of date.
          </small>
        )}
      </div>
      {["OWNER", "ADMIN", "BOOKKEEPER"].includes(role) && (
        <Link className="cert-banner-link" href="/certificates#portal">
          Open purchasing portal
        </Link>
      )}
    </div>
  );
}
