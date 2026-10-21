import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PerformanceTrend } from "../src/components/performance-dashboard-trend";
import { monthlyTrendRangePoints } from "../src/components/performance-dashboard-format";
import { runPerformanceBackfill, waitForBackfill } from "../src/lib/performance-backfill";
import { pendingDashboardSourceDates } from "../src/modules/station/dashboard-refresh";
import type { DashboardData, DashboardState } from "../src/modules/station/dashboard-types";
import { supportsTrendBackfill } from "../src/modules/station/dashboard-types";

function batch(
  pendingDates: number,
  sourceStatus: DashboardData["sourceStatus"] = "partial",
  retryAfterMs = 60_000,
  interrupted = false,
): DashboardState {
  return {
    ok: true,
    data: {
      sourceStatus,
      backfill: { totalDates: 1417, pendingDates, incompleteDates: 0, retryAfterMs, interrupted },
    } as DashboardData,
  };
}
function setup(request: () => Promise<DashboardState>) {
  const controller = new AbortController();
  const onResult = vi.fn();
  const onWait = vi.fn();
  const wait = vi.fn(async () => true);
  return { controller, options: { request, onResult, onWait, wait, signal: controller.signal } };
}

afterEach(() => vi.useRealTimers());

describe("Foreground Performance backfill", () => {
  it("continues bounded batches after the persisted cooldown and stops when complete", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(batch(6))
      .mockResolvedValueOnce(batch(3))
      .mockResolvedValueOnce(batch(0, "source"));
    const { options } = setup(request);
    expect(await runPerformanceBackfill(options)).toBe("complete");
    expect(request).toHaveBeenCalledTimes(3);
    expect(options.onResult).toHaveBeenCalledTimes(3);
    expect(options.wait).toHaveBeenCalledTimes(2);
    expect(options.wait).toHaveBeenCalledWith(60_250, options.signal);
  });

  it("waits for another tab's gate without treating it as a failed source attempt", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(batch(3, "blocked", 35_000))
      .mockResolvedValueOnce(batch(0, "source"));
    const { options } = setup(request);
    expect(await runPerformanceBackfill(options)).toBe("complete");
    expect(options.wait).toHaveBeenCalledWith(35_250, options.signal);
  });

  it("stops after an export failure even if earlier chunks were saved", async () => {
    const request = vi.fn().mockResolvedValue(batch(5, "partial", 300_000, true));
    const { options } = setup(request);
    expect(await runPerformanceBackfill(options)).toBe("failed");
    expect(request).toHaveBeenCalledTimes(1);
    expect(options.wait).not.toHaveBeenCalled();
    expect(options.onResult).toHaveBeenCalledTimes(1);
  });

  it("does not poll a permissions/configuration failure without a gate retry time", async () => {
    const { options } = setup(vi.fn().mockResolvedValue(batch(5, "blocked", 0)));
    expect(await runPerformanceBackfill(options)).toBe("failed");
    expect(options.wait).not.toHaveBeenCalled();
  });

  it("stops when authentication expires", async () => {
    const { options } = setup(vi.fn().mockResolvedValue({ ok: false, message: "Sign in again." }));
    expect(await runPerformanceBackfill(options)).toBe("failed");
    expect(options.wait).not.toHaveBeenCalled();
  });

  it("does not start another request after Pause during an in-flight batch", async () => {
    let complete!: (value: DashboardState) => void;
    const request = vi.fn(
      () =>
        new Promise<DashboardState>((resolve) => {
          complete = resolve;
        }),
    );
    const { controller, options } = setup(request);
    const running = runPerformanceBackfill(options);
    controller.abort();
    complete(batch(3));
    expect(await running).toBe("paused");
    expect(request).toHaveBeenCalledTimes(1);
    expect(options.onResult).not.toHaveBeenCalled();
    expect(options.wait).not.toHaveBeenCalled();
  });

  it("stops new work when the cooldown wait is cancelled", async () => {
    const request = vi.fn().mockResolvedValue(batch(3));
    const { options } = setup(request);
    options.wait.mockResolvedValue(false);
    expect(await runPerformanceBackfill(options)).toBe("paused");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("pauses instead of endlessly re-fetching dates that cannot be resolved", async () => {
    const request = vi.fn().mockResolvedValue(batch(3, "source"));
    const { options } = setup(request);
    expect(await runPerformanceBackfill(options)).toBe("stalled");
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("completes from cache without a timer when no dates remain", async () => {
    const { options } = setup(vi.fn().mockResolvedValue(batch(0, "cached")));
    expect(await runPerformanceBackfill(options)).toBe("complete");
    expect(options.wait).not.toHaveBeenCalled();
  });

  it("clears the actual cooldown timer on Pause or page unmount", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const waiting = waitForBackfill(60_000, controller.signal);
    controller.abort();
    expect(await waiting).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Source backlog checkpoints", () => {
  const data = {
    query: { start: "2026-10-18", end: "2026-10-18", trendDays: 1825 },
    today: "2026-10-18",
    missingDates: ["2023-01-02", "2023-01-03"],
    timingMissingDates: ["2023-01-02"],
    retestMissingDates: ["2022-12-02", "2023-01-02"],
    staleDates: ["2026-10-18"],
    knownIncompleteDates: ["2023-01-03", "2026-10-18"],
  } as DashboardData;

  it("deduplicates missing dates, includes VIN lookback, and avoids retrying known invalid history", () => {
    expect(pendingDashboardSourceDates(data)).toEqual(["2023-01-02", "2022-12-02", "2026-10-18"]);
  });
  it("does not re-export cached historical dates when resumed", () => {
    expect(
      pendingDashboardSourceDates({
        ...data,
        missingDates: [],
        timingMissingDates: [],
        retestMissingDates: [],
      }),
    ).toEqual(["2026-10-18"]);
  });
  it("refreshes only the selected date for a single-day report", () => {
    const dates = pendingDashboardSourceDates(
      {
        ...data,
        query: { ...data.query, trendDays: 7 },
        missingDates: [],
        timingMissingDates: [],
        retestMissingDates: [],
        knownIncompleteDates: [],
      },
      true,
    );
    expect(dates).toHaveLength(1);
    expect(dates[0]).toBe("2026-10-18");
    expect(dates.at(-1)).toBe("2026-10-18");
  });
  it("uses the server-resolved All Time boundary when explicitly refreshing a fully cached range", () => {
    const dates = pendingDashboardSourceDates(
      {
        ...data,
        query: { ...data.query, trendDays: "all" },
        trendStart: "2026-10-16",
        missingDates: [],
        timingMissingDates: [],
        retestMissingDates: [],
        staleDates: [],
      },
      true,
    );
    expect(dates).toEqual(["2026-10-16", "2026-10-17", "2026-10-18"]);
  });
});

describe("Multi-year trend controls", () => {
  it("enables saved-source-date progress for all multi-year trends", () => {
    const q = { start: "2024-01-01", end: "2026-10-20", trendDays: "custom" as const };
    expect(supportsTrendBackfill(q)).toBe(true);
    expect(supportsTrendBackfill({ ...q, start: "2025-10-20" })).toBe(false);
    expect(supportsTrendBackfill({ ...q, trendDays: "all" })).toBe(true);
  });
  it("routes saved VIR processing to the Next app, not the scaffold API server", () => {
    const manifest = readFileSync(
      new URL("../.replit-artifact/artifact.toml", import.meta.url),
      "utf8",
    );
    expect(manifest).toMatch(/paths\s*=\s*\[[^\]]*"\/api\/inspection-history"/);
  });
  it("shows the shared all-time dates in the chart without a second period selector", () => {
    const markup = renderToStaticMarkup(
      createElement(PerformanceTrend, {
        series: [],
        filtered: false,
        trendDays: "all",
        startDate: "2012-06-18",
        endDate: "2026-10-19",
      }),
    );
    expect(markup).not.toContain("select-report-period");
    expect(markup).not.toContain("select-trend");
    expect(markup).toContain("All time · monthly totals · Jun 18 – Oct 19");
    expect(markup).toContain("No complete monthly totals are loaded for this period yet.");
  });
  it("keeps missing months unknown across a full six-calendar-year chart", () => {
    const rows = monthlyTrendRangePoints([], "2021-01-01", "2026-10-19");
    expect(rows).toHaveLength(70);
    expect(rows.every((row) => row.value === null)).toBe(true);
  });
  it("keeps missing months unknown from the station's verified all-time start", () => {
    const rows = monthlyTrendRangePoints([], "2012-06-18", "2026-10-19");
    expect(rows).toHaveLength(173);
    expect(rows.every((row) => row.value === null)).toBe(true);
  });
});
