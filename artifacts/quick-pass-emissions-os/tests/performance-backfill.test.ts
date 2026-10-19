import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PerformanceTrend } from "../src/components/performance-dashboard-trend";
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
    query: { start: "2026-10-18", end: "2026-10-18", trendDays: "since2023" },
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
  it("keeps explicit one-shot refresh semantics for existing smaller views", () => {
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
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2026-10-12");
    expect(dates.at(-1)).toBe("2026-10-18");
  });
});

describe("Multi-year trend controls", () => {
  it("enables saved-source-date progress for both the two-year and 2023-to-today trends", () => {
    expect(supportsTrendBackfill(730)).toBe(true);
    expect(supportsTrendBackfill("since2023")).toBe(true);
    expect(supportsTrendBackfill(365)).toBe(false);
  });
  it("routes saved VIR processing to the Next app, not the scaffold API server", () => {
    const manifest = readFileSync(
      new URL("../.replit-artifact/artifact.toml", import.meta.url),
      "utf8",
    );
    expect(manifest).toMatch(/paths\s*=\s*\[[^\]]*"\/api\/inspection-history"/);
  });
  it("shows the exact 2023–today period while preserving independent report dates", () => {
    const markup = renderToStaticMarkup(
      createElement(PerformanceTrend, {
        series: [],
        filtered: false,
        trendDays: "since2023",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        today: "2026-10-18",
      }),
    );
    expect(markup).toContain('value="since2023" selected=""');
    expect(markup).toContain("Jan 2023–today · monthly totals");
    expect(markup).toMatch(/Jan 2023 through .*monthly totals/);
    expect(markup).toContain('name="start" value="2026-06-01"');
    expect(markup).toContain('name="end" value="2026-06-30"');
    expect(markup).toContain("No complete monthly totals are loaded for this period yet.");
  });
});
