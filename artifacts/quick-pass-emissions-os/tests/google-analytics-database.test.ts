import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect, vi } from "vitest";
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Isolated database required");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
(enabled ? describe : describe.skip)("Persistent Google Analytics authorization and sync", () => {
  let db: PrismaClient,
    c: typeof import("../src/modules/analytics/connection"),
    s: typeof import("../src/modules/analytics/sync"),
    r: typeof import("../src/modules/analytics/report"),
    crypto: typeof import("../src/lib/google-business/crypto");
  let owner: string,
    manager: string,
    employee: string,
    station: string,
    location: string,
    fetcher: ReturnType<typeof vi.fn>;
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    c = await import("../src/modules/analytics/connection");
    s = await import("../src/modules/analytics/sync");
    r = await import("../src/modules/analytics/report");
    crypto = await import("../src/lib/google-business/crypto");
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "GoogleBusinessConnection","GoogleBusinessOAuth","AnalyticsStation","User" CASCADE',
    );
    owner = (
      await db.user.create({
        data: { name: "Owner", email: `${randomUUID()}@example.test`, role: "OWNER" },
      })
    ).id;
    manager = (
      await db.user.create({
        data: { name: "Manager", email: `${randomUUID()}@example.test`, role: "ADMIN" },
      })
    ).id;
    employee = (
      await db.user.create({
        data: { name: "Staff", email: `${randomUUID()}@example.test`, role: "EMPLOYEE" },
      })
    ).id;
    vi.stubEnv("GOOGLE_BUSINESS_CLIENT_ID", "fixture-client");
    vi.stubEnv("GOOGLE_BUSINESS_CLIENT_SECRET", "fixture-secret");
    vi.stubEnv("GOOGLE_BUSINESS_ENCRYPTION_KEY", "a".repeat(64));
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("GA_STATION_ID", "analytics-test-station");
    fetcher = vi.fn().mockImplementation(async (input) => {
      const u = new URL(String(input));
      if (u.hostname === "oauth2.googleapis.com")
        return Response.json(
          u.pathname === "/revoke"
            ? {}
            : {
                access_token: "private-access",
                refresh_token: "private-refresh",
                expires_in: 3600,
                scope: "https://www.googleapis.com/auth/business.manage",
              },
        );
      if (u.hostname === "mybusinessaccountmanagement.googleapis.com")
        return Response.json({
          accounts: [{ name: "accounts/account1", accountName: "Authorized account" }],
        });
      if (u.hostname === "mybusinessbusinessinformation.googleapis.com")
        return Response.json({
          locations: [{ name: "locations/location1", title: "Quick Pass Emissions & Tag Renewal" }],
        });
      if (u.pathname.endsWith(":fetchMultiDailyMetricsTimeSeries"))
        return Response.json({
          multiDailyMetricTimeSeries: [
            {
              dailyMetricTimeSeries: [
                {
                  dailyMetric: "CALL_CLICKS",
                  timeSeries: {
                    datedValues: [{ date: { year: 2026, month: 5, day: 1 }, value: "0" }],
                  },
                },
              ],
            },
          ],
        });
      if (u.pathname.endsWith("/searchkeywords/impressions/monthly"))
        return Response.json({
          searchKeywordsCounts: [
            { searchKeyword: "emissions", insightsValue: { threshold: "15" } },
          ],
        });
      if (u.pathname.endsWith("/reviews"))
        return Response.json({
          reviews: [
            {
              reviewId: "review1",
              starRating: "FIVE",
              comment: "Quick service",
              createTime: "2026-05-02T12:00:00Z",
              updateTime: "2026-05-02T12:00:00Z",
            },
          ],
          totalReviewCount: 1,
        });
      throw new Error("Unexpected endpoint");
    });
    vi.stubGlobal("fetch", fetcher);
    await connect(owner);
    await c.discoverLocations(owner);
    station = await c.registerAnalyticsStation(owner, {
      name: "Main station",
      timezoneConfirmed: true,
    });
    location = await c.mapGoogleLocation(owner, {
      stationId: station,
      accountName: "accounts/account1",
      locationName: "locations/location1",
    });
    await db.googleBusinessConnection.update({
      where: { id: "business" },
      data: { cooldownUntil: null },
    });
    fetcher.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "GoogleBusinessConnection","GoogleBusinessOAuth","AnalyticsStation" CASCADE',
    );
  });
  async function connect(actor: string) {
    const url = new URL(await c.beginConnection(actor, "browser-fixture"));
    await c.finishConnection(
      actor,
      url.searchParams.get("state")!,
      "browser-fixture",
      "authorization-code",
    );
  }
  async function queue() {
    await s.requestGoogleSync(owner, location, { start: "2026-05-01", end: "2026-05-31" });
  }
  async function processAll() {
    for (let i = 0; i < 10; i++) {
      const job = await s.claimGoogleSync(new Date(Date.now() + 1000));
      if (!job) break;
      await s.processGoogleSync(job);
    }
  }
  const overview = (actor = owner) =>
    r.analyticsOverview(actor, { stationId: station, start: "2026-05-01", end: "2026-05-31" });
  it("stores tokens encrypted and never in audits or reporting output", async () => {
    const conn = await db.googleBusinessConnection.findUniqueOrThrow({ where: { id: "business" } });
    expect(conn.credentials).not.toContain("private-");
    expect(crypto.decrypt(conn.credentials!, "tokens:business")).toMatchObject({
      refresh_token: "private-refresh",
    });
    const data = await overview(),
      audits = await db.auditLog.findMany({ where: { actorId: owner } });
    expect(JSON.stringify(data)).not.toMatch(
      /private-access|private-refresh|fixture-secret|credentials|browser-fixture/,
    );
    expect(JSON.stringify(audits)).not.toMatch(/private-access|private-refresh|authorization-code/);
  });
  it("validates user, browser, expiry and single-use OAuth state", async () => {
    let state = new URL(await c.beginConnection(owner, "browser-one")).searchParams.get("state")!;
    await expect(c.finishConnection(manager, state, "browser-one", "code")).rejects.toThrow();
    await expect(c.finishConnection(owner, state, "browser-two", "code")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    await c.finishConnection(owner, state, "browser-one", "code");
    await expect(c.finishConnection(owner, state, "browser-one", "code")).rejects.toThrow();
    state = new URL(await c.beginConnection(owner, "browser-one")).searchParams.get("state")!;
    await db.googleBusinessOAuth.updateMany({ data: { expiresAt: new Date(0) } });
    await expect(c.finishConnection(owner, state, "browser-one", "code")).rejects.toThrow();
  });
  it("rejects a callback after disconnect or account deactivation", async () => {
    const state = new URL(await c.beginConnection(owner, "browser")).searchParams.get("state")!;
    await c.disconnectGoogle(owner);
    await expect(c.finishConnection(owner, state, "browser", "code")).rejects.toThrow();
    await db.user.update({ where: { id: owner }, data: { active: false } });
    await expect(c.beginConnection(owner, "browser")).rejects.toThrow();
  });
  it("allows a manager to connect but not grant or map station access", async () => {
    await connect(manager);
    await expect(
      c.mapGoogleLocation(manager, {
        stationId: station,
        accountName: "accounts/account1",
        locationName: "locations/location1",
      }),
    ).rejects.toThrow();
    await expect(
      c.grantAnalyticsStation(manager, { stationId: station, userId: manager, allow: true }),
    ).rejects.toThrow();
  });
  it("enforces station grants on reports and manual sync", async () => {
    await expect(overview(manager)).rejects.toThrow();
    await expect(
      s.requestGoogleSync(manager, location, { start: "2026-05-01", end: "2026-05-31" }),
    ).rejects.toThrow();
    await c.grantAnalyticsStation(owner, { stationId: station, userId: manager, allow: true });
    expect((await overview(manager)).station?.id).toBe(station);
    await c.grantAnalyticsStation(owner, { stationId: station, userId: manager, allow: false });
    await expect(overview(manager)).rejects.toThrow();
  });
  it.each(["EMPLOYEE", "BOOKKEEPER"])("denies legacy %s reads and mutations", async (role) => {
    await db.user.update({
      where: { id: employee },
      data: { role: role as "EMPLOYEE" | "BOOKKEEPER" },
    });
    await expect(overview(employee)).rejects.toThrow();
    await expect(c.beginConnection(employee, "browser")).rejects.toThrow();
    await expect(
      r.recordAttribution(employee, {
        stationId: station,
        date: "2026-05-01",
        channel: "Google",
        customers: 1,
        costCents: null,
        reference: "legacy",
        evidence: "No access",
      }),
    ).rejects.toThrow();
  });
  it("rechecks a queued manager after the personnel lock is acquired", async () => {
    await c.grantAnalyticsStation(owner, { stationId: station, userId: manager, allow: true });
    let queued: Promise<unknown>;
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
      queued = overview(manager);
      queued.catch(() => {});
      await tx.user.update({ where: { id: manager }, data: { active: false } });
    });
    await expect(queued!).rejects.toThrow();
  });
  it("only maps locations returned by current authorized discovery", async () => {
    await expect(
      c.mapGoogleLocation(owner, {
        stationId: station,
        accountName: "accounts/other",
        locationName: "locations/other",
      }),
    ).rejects.toThrow();
    await db.googleBusinessConnection.update({
      where: { id: "business" },
      data: { discoveryExpiresAt: new Date(0) },
    });
    await expect(
      c.mapGoogleLocation(owner, {
        stationId: station,
        accountName: "accounts/account1",
        locationName: "locations/location1",
      }),
    ).rejects.toThrow();
  });
  it("persists an idempotent queue and shares manual refresh cooldown", async () => {
    await queue();
    expect(await db.googleBusinessSync.count()).toBe(7);
    await expect(queue()).rejects.toThrow(/cooling down/);
    await db.googleBusinessConnection.update({
      where: { id: "business" },
      data: { cooldownUntil: null },
    });
    await expect(queue()).rejects.toThrow(/already active/);
    expect(await db.googleBusinessSync.count()).toBe(7);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("commits imported source pages and preserves explicit zero and keyword thresholds", async () => {
    await queue();
    await processAll();
    const data = await overview();
    expect(data.report?.current.find((m) => m.metric === "CALL_CLICKS")).toMatchObject({
      value: 0,
      reportedDays: 1,
      missingDays: 30,
    });
    expect(data.report?.keywordRows[0]).toMatchObject({ value: null, threshold: "15" });
    expect(data.report?.reviews[0].comment).toBe("Quick service");
    expect(data.report?.reviewComplete).toBe(true);
    expect(data.report?.currentBusiness.paidInspections).toBeNull();
    expect(data.report?.recommendations).toEqual([]);
    expect(await db.googleBusinessCache.count()).toBe(7);
    await db.googleBusinessConnection.update({
      where: { id: "business" },
      data: { cooldownUntil: null },
    });
    await queue();
    await processAll();
    expect(await db.googleBusinessCache.count()).toBe(7);
    expect((await overview()).report?.reviews).toHaveLength(1);
  });
  it("keeps paginated review results partial until the final page", async () => {
    await queue();
    await db.googleBusinessSync.deleteMany({ where: { kind: { not: "REVIEWS" } } });
    fetcher.mockImplementation(async (input) => {
      const u = new URL(String(input));
      return Response.json(
        u.searchParams.has("pageToken")
          ? { reviews: [] }
          : {
              reviews: [
                {
                  reviewId: "page-one",
                  starRating: "ONE",
                  comment: "Slow wait",
                  createTime: "2026-05-01T12:00:00Z",
                  updateTime: "2026-05-01T12:00:00Z",
                },
              ],
              nextPageToken: "private-page-token",
            },
      );
    });
    const first = (await s.claimGoogleSync())!;
    await s.processGoogleSync(first);
    expect((await overview()).report?.reviewComplete).toBe(false);
    const persisted = await db.googleBusinessSync.findUniqueOrThrow({ where: { id: first.id } });
    expect(persisted.cursor).not.toContain("private-page-token");
    await s.processGoogleSync((await s.claimGoogleSync())!);
    expect((await overview()).report?.reviewComplete).toBe(true);
  });
  it("serializes claims and rejects stale workers", async () => {
    await queue();
    const claims = await Promise.all(Array.from({ length: 8 }, () => s.claimGoogleSync()));
    expect(claims.filter(Boolean)).toHaveLength(7);
    expect(new Set(claims.filter(Boolean).map((c) => c!.id)).size).toBe(7);
    const claim = claims.find(Boolean)!;
    await db.googleBusinessSync.update({
      where: { id: claim.id },
      data: { leaseToken: "new-worker" },
    });
    expect(await s.processGoogleSync(claim)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rechecks the connection and mapping authorizer before provider dispatch", async () => {
    await queue();
    const claim = (await s.claimGoogleSync())!;
    await db.user.update({ where: { id: owner }, data: { active: false } });
    expect(await s.processGoogleSync(claim)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      (await db.googleBusinessConnection.findUniqueOrThrow({ where: { id: "business" } }))
        .credentials,
    ).toBeNull();
  });
  it("records safe retry errors, bounded attempts, and revoked authorization", async () => {
    await queue();
    fetcher.mockResolvedValue(Response.json({ private: "not logged" }, { status: 429 }));
    let job = (await s.claimGoogleSync())!;
    await s.processGoogleSync(job);
    expect(await db.googleBusinessSync.findUnique({ where: { id: job.id } })).toMatchObject({
      status: "RETRY",
      attempts: 1,
    });
    await db.googleBusinessSync.update({
      where: { id: job.id },
      data: { attempts: 3, nextAttemptAt: new Date(0) },
    });
    await db.googleBusinessConnection.updateMany({ data: { rateLimitedUntil: null } });
    job = (await s.claimGoogleSync())!;
    await s.processGoogleSync(job);
    expect(
      (await db.googleBusinessSync.findUniqueOrThrow({ where: { id: job.id } })).error,
    ).not.toContain("not logged");
    fetcher.mockResolvedValue(Response.json({}, { status: 401 }));
    await db.googleBusinessConnection.updateMany({ data: { rateLimitedUntil: null } });
    job = (await s.claimGoogleSync())!;
    await s.processGoogleSync(job);
    expect(
      await db.googleBusinessConnection.findUnique({ where: { id: "business" } }),
    ).toMatchObject({ status: "RECONNECT", credentials: null });
  });
  it("purges expired content and hides expired source data without requiring OAuth", async () => {
    await queue();
    await processAll();
    await db.googleBusinessCache.updateMany({
      data: {
        fetchedAt: new Date(Date.now() - 31 * 86400000),
        expiresAt: new Date(Date.now() - 2 * 86400000),
      },
    });
    expect((await overview()).report?.reviews).toEqual([]);
    vi.stubEnv("GOOGLE_BUSINESS_CLIENT_ID", "");
    await s.runGoogleAnalytics();
    expect(await db.googleBusinessCache.count()).toBe(0);
  });
  it("disconnect removes provider cache and tokens while preserving owner records", async () => {
    await queue();
    await processAll();
    await r.recordAnalyticsAction(owner, {
      stationId: station,
      category: "REVIEWS",
      action: "Review response process",
      date: "2026-05-01",
      reviewDate: "2026-06-01",
      target: "No unanswered reviews after 30 days",
    });
    await c.disconnectGoogle(owner);
    expect(await db.googleBusinessCache.count()).toBe(0);
    expect(await db.googleBusinessSync.count()).toBe(0);
    expect(await db.analyticsAction.count()).toBe(1);
    expect(
      (await db.googleBusinessConnection.findUniqueOrThrow({ where: { id: "business" } }))
        .credentials,
    ).toBeNull();
  });
  it("records actions, subsequent review and unique documented attribution", async () => {
    const action = {
      stationId: station,
      category: "PERFORMANCE",
      action: "Check published hours",
      date: "2026-05-01",
      reviewDate: "2026-06-01",
      target: "Compare direction requests over the following 30 days",
    };
    await expect(r.recordAnalyticsAction(manager, action)).rejects.toThrow();
    await r.recordAnalyticsAction(owner, action);
    const saved = await db.analyticsAction.findFirstOrThrow();
    await r.reviewAnalyticsAction(owner, {
      id: saved.id,
      outcome: "Reviewed available data; causation remains unproven",
    });
    expect((await overview()).report?.actions[0].outcome).toContain("unproven");
    const attribution = {
      stationId: station,
      date: "2026-05-01",
      channel: "Customer-reported Google",
      customers: 0,
      costCents: null,
      reference: "survey-may-01",
      evidence: "Recorded at checkout",
    };
    await r.recordAttribution(owner, attribution);
    await expect(r.recordAttribution(owner, attribution)).rejects.toThrow();
    expect((await overview()).report?.attributedCustomers).toBe(0);
    expect((await overview()).report?.recordedCostCents).toBeNull();
    for (const value of ["", null, false])
      await expect(
        r.recordAttribution(owner, { ...attribution, customers: value, reference: randomUUID() }),
      ).rejects.toThrow();
  });
  it("keeps incomplete station results partial and distinguishes paid tests from free retests", async () => {
    const { addDays } = await import("../src/lib/time");
    const hash = (await db.analyticsStation.findUniqueOrThrow({ where: { id: station } }))
      .stationHash;
    for (let day = "2026-04-01"; day <= "2026-05-02"; day = addDays(day, 1)) {
      const count = day >= "2026-05-01" ? 1 : 0,
        failed = day === "2026-05-02" ? 1 : 0;
      const counts = { total: count, passed: count - failed, failed, aborted: 0, other: 0 };
      await db.auditLog.create({
        data: {
          actorId: owner,
          entityId: hash,
          action: "STATION_PERFORMANCE_DAY_CACHED",
          details: {
            date: day,
            ...counts,
            retrievedAt: "2026-06-01T12:00:00Z",
            verifiedEmpty: count === 0,
            inspectors: count ? [{ inspector: "Fixture", ...counts }] : [],
            testTimes: count
              ? [
                  {
                    inspector: "Fixture",
                    minute: 600,
                    vinHash: "a".repeat(64),
                    recordKey: crypto.hash(day),
                    outcome: failed ? "failed" : "passed",
                  },
                ]
              : [],
          },
        },
      });
    }
    const result = (await overview()).report!.currentBusiness;
    expect(result).toMatchObject({
      paidInspections: 1,
      freeRetests: 1,
      reportedDays: 2,
      complete: false,
    });
    expect(result.missingDates).toHaveLength(29);
  });
  it("persists refreshed expiry even when Google returns the same access token", async () => {
    const conn = await db.googleBusinessConnection.findUniqueOrThrow({ where: { id: "business" } });
    const tokens = crypto.decrypt(conn.credentials!, "tokens:business") as { expires_at: number };
    tokens.expires_at = 0;
    await db.googleBusinessConnection.update({
      where: { id: "business" },
      data: { credentials: crypto.encrypt(tokens, "tokens:business") },
    });
    await queue();
    await s.processGoogleSync((await s.claimGoogleSync())!);
    const saved = await db.googleBusinessConnection.findUniqueOrThrow({
      where: { id: "business" },
    });
    expect(
      (crypto.decrypt(saved.credentials!, "tokens:business") as { expires_at: number }).expires_at,
    ).toBeGreaterThan(Date.now());
  });
  it("paginates owner action history without hiding older items", async () => {
    for (let i = 0; i < 16; i++)
      await db.analyticsAction.create({
        data: {
          stationId: station,
          category: "OPERATIONS",
          action: `Action ${i}`,
          date: "2026-05-01",
          reviewDate: "2026-06-01",
          target: "Review 30 days",
          createdBy: owner,
        },
      });
    expect((await overview()).report?.actions).toHaveLength(15);
    const next = await r.analyticsOverview(owner, {
      stationId: station,
      start: "2026-05-01",
      end: "2026-05-31",
      page: 2,
    });
    expect(next.report?.actions).toHaveLength(1);
    expect(next.report?.actionCount).toBe(16);
  });
  it("migrates legacy queued work safely without deleting credentials or cached data", async () => {
    const schema = `google_upgrade_${randomUUID().replaceAll("-", "")}`;
    const migration = readFileSync(
      new URL(
        "../prisma/migrations/202610120008_manual_google_sync/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      for (const sql of [
        `CREATE TABLE "GoogleBusinessConnection" ("id" TEXT PRIMARY KEY, "lastScheduledDate" TEXT, "credentials" TEXT)`,
        `CREATE TABLE "GoogleBusinessLocation" ("id" TEXT PRIMARY KEY)`,
        `CREATE TABLE "GoogleBusinessSync" ("id" TEXT PRIMARY KEY,"locationId" TEXT,"kind" TEXT,"period" TEXT,"cycle" TEXT,"status" TEXT,"page" INTEGER,"cursor" TEXT,"leaseToken" TEXT,"leaseUntil" TIMESTAMP,"error" TEXT)`,
        `CREATE TABLE "GoogleBusinessCache" ("locationId" TEXT,"kind" TEXT,"period" TEXT,"cycle" TEXT,"payload" TEXT)`,
        `INSERT INTO "GoogleBusinessConnection" VALUES ('business','2026-10-12','encrypted-existing-credentials')`,
        `INSERT INTO "GoogleBusinessLocation" VALUES ('location')`,
        ...["QUEUED", "RUNNING", "RETRY", "SUCCESS"].flatMap((status, i) => [
          `INSERT INTO "GoogleBusinessSync" VALUES ('${i}','location','PERFORMANCE','2026-0${i + 1}','cycle${i}','${status}',0,'cursor','lease',CURRENT_TIMESTAMP,NULL)`,
          `INSERT INTO "GoogleBusinessCache" VALUES ('location','PERFORMANCE','2026-0${i + 1}','cycle${i}','encrypted-source')`,
        ]),
        ...migration
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean),
      ])
        await tx.$executeRawUnsafe(sql);
      const tasks = await tx.$queryRawUnsafe<
        {
          status: string;
          publishedCycle: string;
          publishedPage: number | null;
          requestId: string | null;
          leaseToken: string | null;
        }[]
      >('SELECT * FROM "GoogleBusinessSync" ORDER BY "id"');
      expect(tasks.map((t) => t.status)).toEqual(["CANCELED", "CANCELED", "CANCELED", "SUCCESS"]);
      expect(tasks.every((t) => t.publishedCycle && t.requestId === null)).toBe(true);
      expect(
        tasks.slice(0, 3).every((t) => t.leaseToken === null && t.publishedPage === null),
      ).toBe(true);
      expect(tasks[3].publishedPage).toBe(0);
      expect(
        await tx.$queryRawUnsafe('SELECT "credentials" FROM "GoogleBusinessConnection"'),
      ).toEqual([{ credentials: "encrypted-existing-credentials" }]);
      expect(
        await tx.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "GoogleBusinessCache"'),
      ).toEqual([{ n: 4 }]);
      await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  });
  it("preserves completed request time through repeated status reads", async () => {
    const id = await s.requestGoogleSync(owner, location, {
      start: "2026-05-01",
      end: "2026-05-31",
    });
    await processAll();
    const before = await db.googleBusinessRequest.findUniqueOrThrow({ where: { id } });
    await s.manualSyncStatus(owner, id);
    await s.manualSyncStatus(owner, id);
    expect(
      (await db.googleBusinessRequest.findUniqueOrThrow({ where: { id } })).completedAt,
    ).toEqual(before.completedAt);
  });
  it("rejects new or resumed work when server Google configuration disappears", async () => {
    const id = await s.requestGoogleSync(owner, location, {
      start: "2026-05-01",
      end: "2026-05-31",
    });
    vi.stubEnv("GOOGLE_BUSINESS_CLIENT_SECRET", "");
    await expect(s.advanceManualSync(owner, id)).rejects.toThrow(/configuration is missing/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never enqueues Google work on independent worker runs or report reads", async () => {
    await s.runGoogleAnalytics();
    await s.runGoogleAnalytics();
    await overview();
    expect(await db.googleBusinessSync.count()).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not claim legacy tasks without explicit manual provenance", async () => {
    await db.googleBusinessSync.create({
      data: { locationId: location, kind: "REVIEWS", period: "all", cycle: randomUUID() },
    });
    expect(await s.claimGoogleSync()).toBeNull();
    await s.runGoogleAnalytics();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("advances a manual request to completion without calling the jobs endpoint", async () => {
    const id = await s.requestGoogleSync(owner, location, {
      start: "2026-05-01",
      end: "2026-05-31",
    });
    expect((await s.manualSyncStatus(owner, id)).status).toBe("QUEUED");
    let result = await s.advanceManualSync(owner, id);
    expect(result.pending).toBeGreaterThan(0);
    expect(result.status).toBe("RUNNING");
    for (let i = 0; i < 12 && result.pending; i++) result = await s.advanceManualSync(owner, id);
    expect(result).toMatchObject({ status: "SUCCESS", pending: 0, successful: 7, total: 7 });
    expect((await overview()).report?.lastSuccessfulSync).not.toBeNull();
  });
  it("keeps previous data and its original freshness through failed refreshes", async () => {
    await queue();
    await processAll();
    const before = (await overview()).report!;
    await db.googleBusinessConnection.updateMany({ data: { cooldownUntil: null } });
    const id = await s.requestGoogleSync(owner, location, {
      start: "2026-05-01",
      end: "2026-05-31",
    });
    expect((await overview()).report?.fetchedAt).toEqual(before.fetchedAt);
    fetcher.mockResolvedValue(Response.json({}, { status: 403 }));
    await processAll();
    const after = (await overview()).report!;
    expect(after.current).toEqual(before.current);
    expect(after.reviews).toEqual(before.reviews);
    expect(after.reviewComplete).toBe(true);
    expect(after.fetchedAt).toEqual(before.fetchedAt);
    expect((await s.manualSyncStatus(owner, id)).status).toBe("FAILED");
  });
  it("retains a first partial review import when its next refresh fails", async () => {
    await queue();
    await db.googleBusinessSync.deleteMany({ where: { kind: { not: "REVIEWS" } } });
    fetcher.mockResolvedValueOnce(
      Response.json({
        reviews: [
          {
            reviewId: "partial",
            starRating: "ONE",
            comment: "Waited a long time",
            createTime: "2026-05-02T12:00:00Z",
            updateTime: "2026-05-02T12:00:00Z",
          },
        ],
        nextPageToken: "next",
      }),
    );
    await s.processGoogleSync((await s.claimGoogleSync())!);
    fetcher.mockResolvedValueOnce(Response.json({}, { status: 403 }));
    await s.processGoogleSync((await s.claimGoogleSync())!);
    const before = (await overview()).report!;
    expect(before.reviewComplete).toBe(false);
    expect(before.reviews).toHaveLength(1);
    await db.googleBusinessConnection.updateMany({ data: { cooldownUntil: null } });
    await queue();
    expect((await overview()).report?.reviews).toEqual(before.reviews);
    expect((await overview()).report?.fetchedAt).toEqual(before.fetchedAt);
  });
  it("publishes replacement reviews only after every new page completes", async () => {
    await queue();
    await processAll();
    await db.googleBusinessConnection.updateMany({ data: { cooldownUntil: null } });
    await queue();
    await db.googleBusinessSync.updateMany({
      where: { kind: { not: "REVIEWS" } },
      data: { status: "SUCCESS" },
    });
    fetcher.mockResolvedValueOnce(Response.json({ reviews: [], nextPageToken: "next" }));
    await s.processGoogleSync((await s.claimGoogleSync())!);
    expect((await overview()).report?.reviews[0].comment).toBe("Quick service");
    expect((await overview()).report?.reviewComplete).toBe(true);
    fetcher.mockResolvedValueOnce(Response.json({ reviews: [] }));
    await s.processGoogleSync((await s.claimGoogleSync())!);
    expect((await overview()).report?.reviews).toEqual([]);
  });
  it("reports partial completion when reviews succeed but performance fails", async () => {
    const original = fetcher.getMockImplementation() as (input: unknown) => Promise<Response>;
    fetcher.mockImplementation(async (input: unknown) =>
      String(input).includes(":fetchMultiDailyMetrics")
        ? Response.json({}, { status: 400 })
        : original(input),
    );
    const id = await s.requestGoogleSync(owner, location, {
      start: "2026-05-01",
      end: "2026-05-31",
    });
    await processAll();
    expect((await s.manualSyncStatus(owner, id)).status).toBe("PARTIAL");
    expect((await overview()).report?.lastSuccessfulSync).toBeNull();
  });
  it("stops all pending work on revoked credentials while retaining prior cached data", async () => {
    await queue();
    await processAll();
    await db.googleBusinessConnection.updateMany({ data: { cooldownUntil: null } });
    const id = await s.requestGoogleSync(owner, location, {
      start: "2026-05-01",
      end: "2026-05-31",
    });
    fetcher.mockResolvedValue(Response.json({}, { status: 401 }));
    await s.advanceManualSync(owner, id);
    expect(await s.manualSyncStatus(owner, id)).toMatchObject({ status: "FAILED", pending: 0 });
    expect((await overview()).report?.reviews).toHaveLength(1);
    expect((await overview()).connection?.status).toBe("RECONNECT");
  });
  it("rechecks a manual requester's station grant before provider dispatch", async () => {
    await c.grantAnalyticsStation(owner, { stationId: station, userId: manager, allow: true });
    const id = await s.requestGoogleSync(manager, location, {
      start: "2026-05-01",
      end: "2026-05-31",
    });
    await c.grantAnalyticsStation(owner, { stationId: station, userId: manager, allow: false });
    await expect(s.advanceManualSync(manager, id)).rejects.toThrow();
    await processAll();
    expect(fetcher).not.toHaveBeenCalled();
    expect((await s.manualSyncStatus(owner, id)).status).toBe("FAILED");
  });
  it("shares Google quota backoff across tasks and honors Retry-After", async () => {
    await queue();
    fetcher.mockResolvedValue(
      Response.json({}, { status: 429, headers: { "Retry-After": "120" } }),
    );
    await s.processGoogleSync((await s.claimGoogleSync())!);
    expect(await s.claimGoogleSync()).toBeNull();
    const conn = await db.googleBusinessConnection.findUniqueOrThrow({ where: { id: "business" } });
    expect(conn.rateLimitedUntil!.getTime()).toBeGreaterThan(Date.now() + 110000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
