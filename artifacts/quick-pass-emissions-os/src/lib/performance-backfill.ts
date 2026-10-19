import type { DashboardState } from "@/modules/station/dashboard-types";

export function waitForBackfill(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const finish = (completed: boolean) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      resolve(completed);
    };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(true), ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) finish(false);
  });
}

/**
 * Foreground only: every request remains independently authorized and bounded by
 * the station gate. Cache checkpoints, not a browser timer, make this resumable.
 */
export async function runPerformanceBackfill({
  request,
  onResult,
  onWait,
  signal,
  wait = waitForBackfill,
}: {
  request: () => Promise<DashboardState>;
  onResult: (result: DashboardState) => void;
  onWait: (ms: number) => void;
  signal: AbortSignal;
  wait?: (ms: number, signal: AbortSignal) => Promise<boolean>;
}): Promise<"complete" | "paused" | "failed" | "stalled"> {
  let previous: number | undefined;
  let unchanged = 0;
  while (!signal.aborted) {
    const result = await request();
    if (signal.aborted) return "paused";
    onResult(result);
    const progress = result.data?.backfill;
    if (result.ok === false || !result.data || !progress || progress.interrupted) return "failed";
    if (progress.pendingDates === 0) return "complete";
    const status = result.data.sourceStatus;
    if (status === "failed" || (status === "blocked" && progress.retryAfterMs <= 0))
      return "failed";
    if (status !== "blocked") {
      unchanged = previous !== undefined && progress.pendingDates >= previous ? unchanged + 1 : 0;
      previous = progress.pendingDates;
      if (unchanged >= 2) return "stalled";
    }
    // Use the actual persisted gate delay; never retry exports in a tight loop.
    const delay = Math.max(1000, progress.retryAfterMs || 60_000) + 250;
    onWait(delay);
    if (!(await wait(delay, signal))) return "paused";
  }
  return "paused";
}
