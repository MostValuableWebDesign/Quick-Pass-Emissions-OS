import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDate, addDays } from "../src/lib/time";
import { digest } from "../src/modules/station/report";
import { calendarDays } from "../src/modules/station/dashboard-calculations";
import type { PortalDay } from "../src/modules/station/dashboard-types";

const portal = vi.hoisted(() => ({ daily: vi.fn(), range: vi.fn() }));
vi.mock("../src/modules/station/portal-client", async (original) => ({
  ...(await original<typeof import("../src/modules/station/portal-client")>()),
  portalDailyTotal: portal.daily,
  portalRangeDays: portal.range,
}));
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Requires disposable _test database.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
const station = "EXPORT_FIXTURE";
const hash = digest(station);
const today = businessDate();
const query = { start: today, end: today, trendDays: 7 as const };
const empty = (date: string): PortalDay => ({
  date,
  retrievedAt: new Date().toISOString(),
  total: 0,
  passed: 0,
  failed: 0,
  aborted: 0,
  other: 0,
  inspectors: [],
  testTimes: [],
  verifiedEmpty: true,
});
const daily = {
  date: today,
  total: 3,
  passed: 2,
  failed: 1,
  aborted: 0,
  other: 0,
  retrievedAt: new Date().toISOString(),
};

(enabled ? describe : describe.skip)("station test export coordination in PostgreSQL", () => {
  let db: typeof import("../src/lib/db").db;
  let gate: typeof import("../src/modules/station/test-export-gate");
  let dashboard: typeof import("../src/modules/station/dashboard-service");
  let counts: typeof import("../src/modules/station/portal-service");
  let owners: string[];
  let manager: string;
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    gate = await import("../src/modules/station/test-export-gate");
    dashboard = await import("../src/modules/station/dashboard-service");
    counts = await import("../src/modules/station/portal-service");
  });
  beforeEach(async () => {
    process.env.GA_STATION_ID = station;
    await db.$executeRawUnsafe('TRUNCATE "StationTestExportState", "User" CASCADE');
    owners = [];
    for (let index = 0; index < 2; index++)
      owners.push(
        (
          await db.user.create({
            data: {
              email: `${randomUUID()}@example.test`,
              name: "Fixture owner",
              role: "OWNER",
            },
          })
        ).id,
      );
    manager = (
      await db.user.create({
        data: { email: `${randomUUID()}@example.test`, name: "Fixture manager", role: "ADMIN" },
      })
    ).id;
    vi.clearAllMocks();
    portal.daily.mockResolvedValue(daily);
    portal.range.mockImplementation(async (start: string, end: string) =>
      calendarDays(start, end).map(empty),
    );
  });
  const expireCooldown = () =>
    db.stationTestExportState.update({
      where: { stationHash: hash },
      data: { cooldownUntil: new Date(0) },
    });

  it("allows one active lookup across owners and entry points, even beyond the old 15-second window", async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let complete!: (value: typeof daily) => void;
    portal.daily.mockImplementationOnce(async () => {
      started();
      return new Promise<typeof daily>((resolve) => {
        complete = resolve;
      });
    });
    const first = counts.retrievePortalCount(owners[0], today);
    await ready;
    try {
      await db.auditLog.updateMany({
        where: { action: "STATION_TEST_EXPORT_STARTED" },
        data: { createdAt: new Date(Date.now() - 30_000) },
      });
      const blocked = await dashboard.loadDashboard(owners[1], query, true);
      expect(blocked.error).toContain("already running");
      await expect(counts.retrievePortalCount(owners[1], today)).rejects.toThrow("already running");
      expect(portal.daily).toHaveBeenCalledTimes(1);
      expect(portal.range).not.toHaveBeenCalled();
    } finally {
      complete(daily);
    }
    await expect(first).resolves.toEqual(daily);
    expect(
      (await db.stationTestExportState.findUniqueOrThrow({ where: { stationHash: hash } }))
        .activeToken,
    ).toBeNull();
  });

  it("shares completion cooldown across manual refresh, other dates and both export entry points", async () => {
    await counts.retrievePortalCount(owners[0], today);
    const state = await db.stationTestExportState.findUniqueOrThrow({
      where: { stationHash: hash },
    });
    expect(state.cooldownUntil.getTime() - Date.now()).toBeGreaterThan(55_000);
    expect((await dashboard.loadDashboard(owners[1], query, true)).error).toContain("cooling down");
    await expect(counts.retrievePortalCount(owners[1], addDays(today, -1))).rejects.toThrow(
      "cooling down",
    );
    expect(portal.range).not.toHaveBeenCalled();
    expect(portal.daily).toHaveBeenCalledTimes(1);
    await expireCooldown();
    await dashboard.loadDashboard(owners[1], query, true);
    expect(portal.range).toHaveBeenCalled();
    await expect(counts.retrievePortalCount(owners[0], today)).rejects.toThrow("cooling down");
  });

  it("retains the five-minute failure cooldown across queries and manual refresh", async () => {
    portal.daily.mockRejectedValueOnce(new Error("Synthetic provider failure"));
    await expect(counts.retrievePortalCount(owners[0], today)).rejects.toThrow(
      "Synthetic provider failure",
    );
    const state = await db.stationTestExportState.findUniqueOrThrow({
      where: { stationHash: hash },
    });
    expect(state.activeToken).toBeNull();
    expect(state.cooldownUntil.getTime() - Date.now()).toBeGreaterThan(295_000);
    expect(
      (await dashboard.loadDashboard(owners[1], { ...query, start: addDays(today, -10) }, true))
        .error,
    ).toContain("cooling down");
    expect(portal.range).not.toHaveBeenCalled();
    expect(await db.auditLog.count({ where: { action: "STATION_PORTAL_COUNT_RETRIEVED" } })).toBe(
      0,
    );
    expect(
      (await db.auditLog.findFirstOrThrow({ where: { action: "STATION_TEST_EXPORT_FINISHED" } }))
        .details,
    ).toMatchObject({ failed: true });
  });

  it("uses three-day historical batches, only three requests, and continues from saved dates after cooldown", async () => {
    const result = await dashboard.loadDashboard(owners[0], query);
    expect(result.error).toContain("partially loaded");
    expect(portal.range).toHaveBeenCalledTimes(3);
    expect(portal.range.mock.calls[0].slice(0, 2)).toEqual([today, today]);
    for (const [start, end] of portal.range.mock.calls)
      expect(calendarDays(start, end).length).toBeLessThanOrEqual(3);
    const cached = await db.auditLog.findMany({
      where: { action: "STATION_PERFORMANCE_DAY_CACHED" },
    });
    const savedDates = new Set(cached.map((entry) => (entry.details as { date: string }).date));
    expect(savedDates.size).toBeGreaterThan(3);
    expect(result.summary.cars).toBe(0);
    await expireCooldown();
    portal.range.mockClear();
    await dashboard.loadDashboard(owners[1], query);
    expect(portal.range).toHaveBeenCalledTimes(3);
    for (const [start, end] of portal.range.mock.calls)
      expect(calendarDays(start, end).some((date) => savedDates.has(date))).toBe(false);
  });

  it("counts single-day empty checks in the same request budget and never invents zeros", async () => {
    portal.range.mockImplementation(async (start: string, end: string) =>
      start === end ? [empty(start)] : [],
    );
    const result = await dashboard.loadDashboard(owners[0], query, true);
    expect(result.error).toContain("partially loaded");
    expect(portal.range).toHaveBeenCalledTimes(3);
    const cached = await db.auditLog.findMany({
      where: { action: "STATION_PERFORMANCE_DAY_CACHED" },
    });
    expect(cached).toHaveLength(2);
  });

  it("rejects unauthorized/inactive actors before claiming or contacting the provider", async () => {
    await expect(counts.retrievePortalCount(manager, today)).rejects.toThrow("permission");
    await db.user.update({ where: { id: owners[0] }, data: { active: false } });
    await expect(counts.retrievePortalCount(owners[0], today)).rejects.toThrow("permission");
    expect(portal.daily).not.toHaveBeenCalled();
    expect(await db.stationTestExportState.count()).toBe(0);
  });

  it("rechecks a deactivated owner before saving and still releases the reservation", async () => {
    portal.daily.mockImplementationOnce(async () => {
      await db.user.update({ where: { id: owners[0] }, data: { active: false } });
      return daily;
    });
    await expect(counts.retrievePortalCount(owners[0], today)).rejects.toThrow("permission");
    const state = await db.stationTestExportState.findUniqueOrThrow({
      where: { stationHash: hash },
    });
    expect(state.activeToken).toBeNull();
    expect(state.cooldownUntil.getTime() - Date.now()).toBeGreaterThan(295_000);
    expect(await db.auditLog.count({ where: { action: "STATION_PORTAL_COUNT_RETRIEVED" } })).toBe(
      0,
    );
  });

  it("keeps separate stations independent while sharing the gate within a station", async () => {
    await gate.withStationTestExport(owners[0], "PERFORMANCE", async () => {
      process.env.GA_STATION_ID = "OTHER_EXPORT_FIXTURE";
      try {
        await gate.withStationTestExport(owners[1], "DAILY_COUNT", async () => {
          expect(
            await db.stationTestExportState.count({ where: { activeToken: { not: null } } }),
          ).toBe(2);
        });
      } finally {
        process.env.GA_STATION_ID = station;
      }
    });
    expect(await db.stationTestExportState.count()).toBe(2);
    expect(await db.stationTestExportState.count({ where: { activeToken: { not: null } } })).toBe(
      0,
    );
  });

  it("recovers an expired abandoned reservation without deleting saved station data", async () => {
    await db.stationTestExportState.create({
      data: {
        stationHash: hash,
        activeToken: "abandoned",
        activeUntil: new Date(0),
        cooldownUntil: new Date(0),
      },
    });
    await counts.retrievePortalCount(owners[0], today);
    expect(portal.daily).toHaveBeenCalledTimes(1);
    expect(await db.auditLog.count({ where: { action: "STATION_PORTAL_COUNT_RETRIEVED" } })).toBe(
      1,
    );
  });

  it("does not let a stale run store results or release another run's token", async () => {
    const { stationTransaction } = await import("../src/modules/station/service");
    await gate.withStationTestExport(owners[0], "PERFORMANCE", async (run) => {
      await db.stationTestExportState.update({
        where: { stationHash: hash },
        data: { activeToken: "replacement", activeUntil: new Date(Date.now() + 120_000) },
      });
      await expect(
        stationTransaction(owners[0], (tx, stationHash) =>
          gate.requireActiveTestExport(tx, stationHash, run),
        ),
      ).rejects.toThrow("reservation ended");
    });
    expect(
      (await db.stationTestExportState.findUniqueOrThrow({ where: { stationHash: hash } }))
        .activeToken,
    ).toBe("replacement");
  });

  it("refuses results after a station configuration change and releases only the original station", async () => {
    portal.range.mockImplementationOnce(async (start: string) => {
      process.env.GA_STATION_ID = "DIFFERENT_STATION";
      return [empty(start)];
    });
    const result = await dashboard.loadDashboard(owners[0], query);
    expect(result.error).toContain("Station configuration changed");
    expect(await db.auditLog.count({ where: { action: "STATION_PERFORMANCE_DAY_CACHED" } })).toBe(
      0,
    );
    expect(
      (await db.stationTestExportState.findUniqueOrThrow({ where: { stationHash: hash } }))
        .activeToken,
    ).toBeNull();
  });
});
