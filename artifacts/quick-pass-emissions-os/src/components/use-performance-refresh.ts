"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DashboardData,
  DashboardQuery,
  DashboardState,
} from "@/modules/station/dashboard-types";
import { supportsTrendBackfill } from "@/modules/station/dashboard-types";
import { getPerformanceDashboardAction } from "@/modules/station/dashboard-actions";
import type { SourceRefreshStatus } from "@/lib/source-refresh";
import { runPerformanceBackfill } from "@/lib/performance-backfill";

type BackfillPhase = "idle" | "running" | "pausing" | "paused" | "complete" | "failed" | "stalled";

export function usePerformanceRefresh(
  query: DashboardQuery,
  onData: (data: DashboardData) => void,
) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<SourceRefreshStatus>("cached");
  const [showSourceStatus, setShowSourceStatus] = useState(false);
  const [phase, setPhase] = useState<BackfillPhase>("idle");
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const [clock, setClock] = useState(0);
  const busy = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const applyResult = useCallback(
    (result: DashboardState) => {
      if (result.data) onData(result.data);
      setSourceStatus(result.data?.sourceStatus ?? (result.ok === false ? "failed" : "cached"));
      setShowSourceStatus(true);
      setMessage(
        result.ok === false || !result.data
          ? (result.message ?? "Could not reach the station portal.")
          : null,
      );
    },
    [onData],
  );

  const loadOnce = useCallback(
    async (refresh: boolean) => {
      if (busy.current) return;
      busy.current = true;
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      if (refresh) setShowSourceStatus(true);
      setSourceStatus("checking");
      try {
        const result = await getPerformanceDashboardAction(query, refresh);
        if (!controller.signal.aborted) applyResult(result);
      } catch {
        if (!controller.signal.aborted) {
          setSourceStatus("failed");
          setShowSourceStatus(true);
          setMessage("Could not reach the station portal. Showing last saved numbers.");
        }
      } finally {
        if (controllerRef.current === controller) {
          busy.current = false;
          setLoading(false);
          controllerRef.current = null;
        }
      }
    },
    [query, applyResult],
  );

  const refresh = useCallback(async () => {
    if (!supportsTrendBackfill(query)) return loadOnce(true);
    if (busy.current) return;
    busy.current = true;
    setShowSourceStatus(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase("running");
    setMessage(null);
    try {
      const outcome = await runPerformanceBackfill({
        signal: controller.signal,
        request: async () => {
          setWaitUntil(null);
          setLoading(true);
          setSourceStatus("checking");
          try {
            // Missing/stale source dates only: never re-export the entire cached history.
            return await getPerformanceDashboardAction(query, false);
          } finally {
            if (controllerRef.current === controller) setLoading(false);
          }
        },
        onResult: applyResult,
        onWait: (ms) => {
          const now = Date.now();
          setClock(now);
          setWaitUntil(now + ms);
        },
      });
      if (controllerRef.current === controller) {
        setPhase(outcome);
        if (outcome === "stalled")
          setMessage(
            "History refresh paused because no additional dates could be resolved. Saved data is unchanged; Refresh can retry later.",
          );
      }
    } catch {
      if (controllerRef.current === controller) {
        setPhase(controller.signal.aborted ? "paused" : "failed");
        setSourceStatus("failed");
        setShowSourceStatus(true);
        setMessage(
          "History refresh interrupted. Saved dates are retained; Refresh will resume missing dates.",
        );
      }
    } finally {
      if (controllerRef.current === controller) {
        busy.current = false;
        controllerRef.current = null;
        setLoading(false);
        setWaitUntil(null);
      }
    }
  }, [query, loadOnce, applyResult]);

  const pause = () => {
    controllerRef.current?.abort();
    setPhase("pausing");
  };

  useEffect(() => {
    // The multi-year source backfill starts only from the owner's Refresh click.
    if (supportsTrendBackfill(query)) return;
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) void loadOnce(false);
    });
    return () => {
      mounted = false;
    };
  }, [query, loadOnce]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (waitUntil === null) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waitUntil]);

  return {
    loading,
    message,
    sourceStatus,
    showSourceStatus,
    refresh,
    pause,
    phase,
    backfillActive: phase === "running" || phase === "pausing",
    waitSeconds: waitUntil === null ? null : Math.max(0, Math.ceil((waitUntil - clock) / 1000)),
  };
}
