"use client";

import { useRef, useState, useTransition } from "react";
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
  const busy = refreshing || navigationPending;

  async function refreshPanels() {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    setMessage(null);

    const requests: Promise<boolean>[] = [];
    if (canRefreshPerformance) {
      requests.push(
        getPerformanceDashboardAction(
          { start: today, end: today, trendDays: 7 },
          true,
        ).then((result) => result.ok === true).catch(() => false),
      );
    }
    if (canRefreshCertificates) {
      requests.push(
        refreshCertificateBalanceAction(true)
          .then((result) => result.ok === true)
          .catch(() => false),
      );
    }

    try {
      const results = await Promise.all(requests);
      const allSourcesUpdated = results.every(Boolean);
      setMessage(
        allSourcesUpdated
          ? { text: "Dashboard panels refreshed.", error: false }
          : { text: "Some live data could not refresh. Showing saved values.", error: true },
      );
    } finally {
      startTransition(() => router.refresh());
      inFlight.current = false;
      setRefreshing(false);
    }
  }

  return (
    <div className="dashboard-refresh-wrap">
      <button
        type="button"
        className="button dashboard-refresh-button"
        onClick={() => void refreshPanels()}
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
