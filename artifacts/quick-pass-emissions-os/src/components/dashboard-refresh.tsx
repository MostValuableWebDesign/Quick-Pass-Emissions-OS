"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshCertificateBalanceAction } from "@/app/certificate-portal-actions";
import { getPerformanceDashboardAction } from "@/modules/station/dashboard-actions";
import { sourceRefreshLabel, type SourceRefreshStatus } from "@/lib/source-refresh";

export function DashboardRefresh({
  today,
  canRefreshPerformance,
  canRefreshCertificates,
}: {
  today: string;
  canRefreshPerformance: boolean;
  canRefreshCertificates: boolean;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [navigationPending, startTransition] = useTransition();
  const [performanceSourceStatus, setPerformanceSourceStatus] =
    useState<SourceRefreshStatus>("cached");
  const [certificateSourceStatus, setCertificateSourceStatus] =
    useState<SourceRefreshStatus>("cached");
  const inFlight = useRef(false);
  const lastAutoSyncAt = useRef(0);
  const busy = refreshing || navigationPending;

  const refreshPanels = useCallback(
    async (force: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setRefreshing(true);
      if (canRefreshPerformance) setPerformanceSourceStatus("checking");
      if (canRefreshCertificates && force) setCertificateSourceStatus("checking");

      const requests: Promise<void>[] = [];
      if (canRefreshPerformance) {
        requests.push(
          getPerformanceDashboardAction({ start: today, end: today, trendDays: 7 }, force)
            .then((result) => {
              setPerformanceSourceStatus(
                result.data?.sourceStatus ?? (result.ok ? "cached" : "failed"),
              );
            })
            .catch(() => setPerformanceSourceStatus("failed")),
        );
      }
      // The global certificate banner already performs a cache-aware check on page visits.
      // Include certificate balance here only when the user explicitly requests a refresh.
      if (canRefreshCertificates && force) {
        requests.push(
          refreshCertificateBalanceAction(force)
            .then((result) => setCertificateSourceStatus(result.sourceStatus ?? "failed"))
            .catch(() => setCertificateSourceStatus("failed")),
        );
      }

      try {
        await Promise.all(requests);
      } finally {
        startTransition(() => router.refresh());
        inFlight.current = false;
        setRefreshing(false);
      }
    },
    [canRefreshCertificates, canRefreshPerformance, router, startTransition, today],
  );

  useEffect(() => {
    if (!canRefreshPerformance) return;
    const syncVisibleDashboard = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastAutoSyncAt.current < 15_000) return;
      lastAutoSyncAt.current = now;
      void refreshPanels(false);
    };
    syncVisibleDashboard();
    document.addEventListener("visibilitychange", syncVisibleDashboard);
    window.addEventListener("pageshow", syncVisibleDashboard);
    return () => {
      document.removeEventListener("visibilitychange", syncVisibleDashboard);
      window.removeEventListener("pageshow", syncVisibleDashboard);
    };
  }, [canRefreshPerformance, refreshPanels]);

  return (
    <div className="dashboard-refresh-wrap">
      <button
        type="button"
        className="button dashboard-refresh-button"
        onClick={() => void refreshPanels(true)}
        disabled={busy}
        aria-busy={busy}
        data-testid="button-dashboard-refresh"
      >
        <RefreshCw
          size={16}
          aria-hidden="true"
          className={busy ? "dashboard-refresh-icon--busy" : undefined}
        />
        {busy ? "Refreshing…" : "Refresh panels"}
      </button>
      <div className="dashboard-refresh-provenance" role="status" aria-live="polite">
        <p data-source-status={performanceSourceStatus}>
          <strong>Performance panels:</strong>{" "}
          {sourceRefreshLabel(performanceSourceStatus, "Georgia I/M")}
        </p>
        <p data-source-status={certificateSourceStatus}>
          <strong>Certificates remaining:</strong>{" "}
          {sourceRefreshLabel(certificateSourceStatus, "Georgia Dashboard")}
        </p>
      </div>
    </div>
  );
}
