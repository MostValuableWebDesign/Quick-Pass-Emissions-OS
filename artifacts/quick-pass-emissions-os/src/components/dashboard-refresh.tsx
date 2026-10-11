"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshCertificateBalanceAction } from "@/app/certificate-portal-actions";
import { getPerformanceDashboardAction } from "@/modules/station/dashboard-actions";

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
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const inFlight = useRef(false);
  const lastAutoSyncAt = useRef(0);
  const busy = refreshing || navigationPending;

  const refreshPanels = useCallback(
    async (force: boolean, announce = true) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setRefreshing(true);
      if (announce) setMessage(null);

      const requests: Promise<boolean>[] = [];
      if (canRefreshPerformance) {
        requests.push(
          getPerformanceDashboardAction(
            { start: today, end: today, trendDays: 7 },
            force,
          )
            .then((result) => result.ok === true)
            .catch(() => false),
        );
      }
      // The global certificate banner already performs a cache-aware check on page visits.
      // Include certificate balance here only when the user explicitly requests a refresh.
      if (canRefreshCertificates && force) {
        requests.push(
          refreshCertificateBalanceAction(force)
            .then((result) => result.ok === true)
            .catch(() => false),
        );
      }

      try {
        const results = await Promise.all(requests);
        const allSourcesUpdated = results.every(Boolean);
        if (announce || !allSourcesUpdated)
          setMessage(
            allSourcesUpdated
              ? { text: "Dashboard panels refreshed.", error: false }
              : { text: "Some live data could not refresh. Showing saved values.", error: true },
          );
        else setMessage(null);
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
      void refreshPanels(false, false);
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
      {message && (
        <span
          className="dashboard-refresh-status"
          data-error={message.error}
          role="status"
          aria-live="polite"
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
