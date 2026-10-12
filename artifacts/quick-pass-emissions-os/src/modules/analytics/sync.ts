import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { businessDate } from "@/lib/time";
import { decrypt, encrypt } from "@/lib/google-business/crypto";
import { googleConfigured, googleGet, GoogleError } from "@/lib/google-business/client";
import { audit, requireRule, BusinessError, type Tx } from "../phase2";
import { analytics, analyticsLocks, stationAccess } from "./transaction";
import { cacheExpiry, connectionTokens, expireAuthorizers, purgeGoogleCache } from "./connection";
import {
  bounds,
  METRICS,
  months,
  queryRange,
  performanceSchema,
  keywordsSchema,
  reviewsSchema,
} from "./rules";
const cacheContext = (
  locationId: string,
  kind: string,
  period: string,
  cycle: string,
  page: number,
) => `google:${locationId}:${kind}:${period}:${cycle}:${page}`;
export { cacheContext };
async function queue(tx: Tx, locationId: string, kind: string, period: string, requestId: string) {
  const where = { locationId_kind_period: { locationId, kind, period } };
  const old = await tx.googleBusinessSync.findUnique({ where });
  const data = {
    requestId,
    status: "QUEUED",
    cycle: randomUUID(),
    page: 0,
    cursor: null,
    attempts: 0,
    nextAttemptAt: new Date(),
    leaseUntil: null,
    leaseToken: null,
    error: null,
  };
  if (old) {
    // Discard abandoned staging pages while retaining the displayed published generation.
    if (old.publishedCycle)
      await tx.googleBusinessCache.deleteMany({
        where: { locationId, kind, period, cycle: { not: old.publishedCycle } },
      });
    await tx.googleBusinessSync.update({ where, data });
  } else await tx.googleBusinessSync.create({ data: { locationId, kind, period, ...data } });
}
export async function queueRange(
  tx: Tx,
  locationId: string,
  start: string,
  end: string,
  requestId: string,
) {
  for (const period of months(start, end)) {
    await queue(tx, locationId, "PERFORMANCE", period, requestId);
    await queue(tx, locationId, "KEYWORDS", period, requestId);
  }
  await queue(tx, locationId, "REVIEWS", "all", requestId);
}
export async function requestGoogleSync(actorId: string, locationId: string, input: unknown) {
  const range = queryRange(input);
  requireRule(
    googleConfigured(),
    "Google server configuration is missing. Restore the OAuth credentials and stable encryption key before syncing.",
  );
  return analytics(actorId, async (tx, actor) => {
    const l = await tx.googleBusinessLocation.findUnique({ where: { id: locationId } });
    requireRule(l?.enabled, "Select an enabled Google location.");
    await stationAccess(tx, actor, l.stationId);
    const c = await tx.googleBusinessConnection.findUniqueOrThrow({
      where: { id: l.connectionId },
    });
    requireRule(c.status === "CONNECTED", "Reconnect Google before syncing.");
    requireRule(
      !c.cooldownUntil || c.cooldownUntil <= new Date(),
      "Google refresh is cooling down. Try again in a minute.",
    );
    await tx.googleBusinessConnection.update({
      where: { id: c.id },
      data: { cooldownUntil: new Date(Date.now() + 60000) },
    });
    requireRule(
      !(await tx.googleBusinessSync.count({
        where: {
          locationId,
          requestId: { not: null },
          status: { in: ["QUEUED", "RUNNING", "RETRY"] },
        },
      })),
      "A sync is already active for this location. Wait for it to finish or resume it.",
    );
    const request = await tx.googleBusinessRequest.create({
      data: { locationId, createdBy: actor.id, start: range.start, end: range.end },
    });
    // The comparison period is explicit in the UI; full-month source responses are never prorated.
    await queueRange(tx, l.id, range.previous.start, range.end, request.id);
    await audit(tx, actorId, "GOOGLE_SYNC_REQUESTED", l.id, { ...range, requestId: request.id });
    return request.id;
  });
}
export async function claimGoogleSync(now = new Date(), requestId?: string) {
  if (!googleConfigured()) return null;
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183509)`;
    await tx.googleBusinessSync.updateMany({
      where: { status: "RUNNING", leaseUntil: { lte: now }, attempts: { gte: 4 } },
      data: {
        status: "FAILED",
        error: "Interrupted Google requests exhausted retries. Request a new sync.",
        leaseToken: null,
        leaseUntil: null,
      },
    });
    const row = await tx.googleBusinessSync.findFirst({
      where: {
        requestId: requestId ? requestId : { not: null },
        location: {
          enabled: true,
          connection: {
            status: "CONNECTED",
            OR: [{ rateLimitedUntil: null }, { rateLimitedUntil: { lte: now } }],
          },
        },
        attempts: { lt: 4 },
        OR: [
          { status: { in: ["QUEUED", "RETRY"] }, nextAttemptAt: { lte: now } },
          { status: "RUNNING", leaseUntil: { lte: now } },
        ],
      },
      orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    });
    if (!row) return null;
    if (row.requestId)
      await tx.googleBusinessRequest.update({
        where: { id: row.requestId },
        data: { status: "RUNNING" },
      });
    return tx.googleBusinessSync.update({
      where: { id: row.id },
      data: {
        status: "RUNNING",
        attempts: { increment: 1 },
        leaseToken: randomUUID(),
        leaseUntil: new Date(now.getTime() + 120000),
      },
    });
  });
}
function dateParams(p: URLSearchParams, prefix: string, date: string, monthly = false) {
  const [year, month, day] = date.split("-");
  p.set(`${prefix}.year`, year);
  p.set(`${prefix}.month`, String(Number(month)));
  if (!monthly) p.set(`${prefix}.day`, String(Number(day)));
}
export async function processGoogleSync(
  claim: NonNullable<Awaited<ReturnType<typeof claimGoogleSync>>>,
  processingActorId?: string,
) {
  return db.$transaction(
    async (tx) => {
      await analyticsLocks(tx);
      await expireAuthorizers(tx);
      const job = await tx.googleBusinessSync.findUnique({
        where: { id: claim.id },
        include: { request: true, location: { include: { connection: true, station: true } } },
      });
      if (
        !job ||
        job.status !== "RUNNING" ||
        job.leaseToken !== claim.leaseToken ||
        !job.leaseUntil ||
        job.leaseUntil <= new Date()
      )
        return false;
      try {
        const l = job.location,
          c = l.connection,
          authorizer = await tx.user.findUnique({ where: { id: l.createdBy } });
        requireRule(
          l.enabled &&
            c.status === "CONNECTED" &&
            authorizer?.active &&
            authorizer.role === "OWNER",
          "Location authorization changed. An owner must remap the location.",
        );
        requireRule(job.request, "Only explicitly requested manual syncs may run.");
        const requester = await tx.user.findUnique({ where: { id: job.request.createdBy } });
        requireRule(
          requester?.active && ["OWNER", "ADMIN"].includes(requester.role),
          "The requesting account lost access. An authorized manager must request a new sync.",
        );
        await stationAccess(tx, requester, l.stationId);
        if (processingActorId) {
          const current = await tx.user.findUnique({ where: { id: processingActorId } });
          requireRule(
            current?.active && ["OWNER", "ADMIN"].includes(current.role),
            "Management access required.",
          );
          await stationAccess(tx, current, l.stationId);
        }
        await tx.googleBusinessRequest.update({
          where: { id: job.request.id },
          data: { status: "RUNNING" },
        });
        if (c.rateLimitedUntil && c.rateLimitedUntil > new Date()) {
          await tx.googleBusinessSync.update({
            where: { id: job.id },
            data: {
              status: "RETRY",
              attempts: Math.max(0, job.attempts - 1),
              nextAttemptAt: c.rateLimitedUntil,
              leaseToken: null,
              leaseUntil: null,
              error: "Google quota backoff is active. This manual request will retry.",
            },
          });
          await updateRequest(tx, job.requestId);
          return false;
        }
        const deadline = Date.now() + 25000,
          tokens = await connectionTokens(tx, deadline);
        const p = new URLSearchParams();
        let raw: unknown, next: string | undefined;
        if (job.cursor) p.set("pageToken", String(decrypt(job.cursor, `cursor:${job.id}`)));
        if (job.kind === "PERFORMANCE") {
          const b = bounds(job.period);
          dateParams(p, "dailyRange.startDate", b.start);
          dateParams(p, "dailyRange.endDate", b.end < businessDate() ? b.end : businessDate());
          for (const metric of Object.keys(METRICS)) p.append("dailyMetrics", metric);
          raw = await googleGet(
            "businessprofileperformance.googleapis.com",
            `/v1/${l.locationName}:fetchMultiDailyMetricsTimeSeries`,
            p,
            tokens.access_token,
            deadline,
          );
          performanceSchema.parse(raw);
        } else if (job.kind === "KEYWORDS") {
          dateParams(p, "monthlyRange.startMonth", job.period, true);
          dateParams(p, "monthlyRange.endMonth", job.period, true);
          p.set("pageSize", "100");
          raw = await googleGet(
            "businessprofileperformance.googleapis.com",
            `/v1/${l.locationName}/searchkeywords/impressions/monthly`,
            p,
            tokens.access_token,
            deadline,
          );
          next = keywordsSchema.parse(raw).nextPageToken;
        } else {
          requireRule(job.kind === "REVIEWS", "Unsupported Google sync type.");
          p.set("pageSize", "50");
          p.set("orderBy", "updateTime desc");
          raw = await googleGet(
            "mybusiness.googleapis.com",
            `/v4/${l.accountName}/${l.locationName}/reviews`,
            p,
            tokens.access_token,
            deadline,
          );
          next = reviewsSchema.parse(raw).nextPageToken;
        }
        requireRule(
          !next || job.page < 199,
          "Google pagination exceeded 200 pages. Contact the operator; this result remains incomplete.",
        );
        const identity = {
          locationId: l.id,
          kind: job.kind,
          period: job.period,
          cycle: job.cycle,
          page: job.page,
        };
        const payload = encrypt(raw, cacheContext(l.id, job.kind, job.period, job.cycle, job.page));
        await tx.googleBusinessCache.upsert({
          where: { locationId_kind_period_cycle_page: identity },
          create: { ...identity, payload, expiresAt: cacheExpiry() },
          update: { payload, fetchedAt: new Date(), expiresAt: cacheExpiry() },
        });
        if (!next)
          await tx.googleBusinessCache.deleteMany({
            where: {
              locationId: l.id,
              kind: job.kind,
              period: job.period,
              cycle: { not: job.cycle },
            },
          });
        await tx.googleBusinessSync.update({
          where: { id: job.id },
          data: {
            status: next ? "QUEUED" : "SUCCESS",
            page: job.page + (next ? 1 : 0),
            cursor: next ? encrypt(next, `cursor:${job.id}`) : null,
            attempts: 0,
            nextAttemptAt: new Date(),
            leaseToken: null,
            leaseUntil: null,
            error: null,
            ...(!job.publishedCycle ? { publishedCycle: job.cycle } : {}),
            ...(!next
              ? { lastSuccessAt: new Date(), publishedCycle: job.cycle, publishedPage: job.page }
              : {}),
          },
        });
        await tx.googleBusinessConnection.update({ where: { id: c.id }, data: { error: null } });
        await updateRequest(tx, job.requestId);
        return true;
      } catch (e) {
        let error =
          e instanceof BusinessError
            ? e.message
            : "Google sync could not complete. Check authorization, date range and response format; request a new sync after correcting setup.";
        const retry = e instanceof GoogleError && e.retryable && job.attempts < 4;
        if (e instanceof GoogleError && e.retryable && !retry)
          error =
            "Google retries were exhausted. Check provider availability or quota, then click Sync now after cooldown.";
        const retryAt = new Date(
          Date.now() +
            Math.max(
              Math.pow(2, job.attempts - 1) * 60000,
              e instanceof GoogleError ? e.retryAfterMs : 0,
            ),
        );
        if (e instanceof GoogleError && e.code === "QUOTA")
          await tx.googleBusinessConnection.update({
            where: { id: job.location.connectionId },
            data: { rateLimitedUntil: retryAt },
          });
        await tx.googleBusinessSync.update({
          where: { id: job.id },
          data: {
            status: retry ? "RETRY" : "FAILED",
            error,
            nextAttemptAt: retryAt,
            leaseToken: null,
            leaseUntil: null,
          },
        });
        if (e instanceof GoogleError && e.code === "RECONNECT")
          await tx.googleBusinessConnection.update({
            where: { id: job.location.connectionId },
            data: { status: "RECONNECT", credentials: null, error },
          });
        await updateRequest(tx, job.requestId);
        return false;
      }
    },
    { timeout: 40000, maxWait: 10000 },
  );
}
export async function runGoogleAnalytics(now = new Date()) {
  await purgeGoogleCache(now);
  await db.$transaction(
    async (tx) => {
      await analyticsLocks(tx);
      await maintainQueue(tx);
    },
    { timeout: 30000, maxWait: 10000 },
  );
  let completed = 0,
    failed = 0;
  // At most three requests per independent trigger; persistent pagination/backlog
  // continues on later triggers. Rendering never makes a provider request.
  for (let i = 0; i < 3; i++) {
    const claim = await claimGoogleSync(now);
    if (!claim) break;
    if (await processGoogleSync(claim)) completed++;
    else failed++;
  }
  await db.$transaction(
    async (tx) => {
      await analyticsLocks(tx);
      await maintainQueue(tx);
    },
    { timeout: 30000, maxWait: 10000 },
  );
  return { completed, failed };
}

// Request status counts every resource and every pagination cursor, not successful page calls.
async function updateRequest(tx: Tx, requestId: string | null) {
  if (!requestId) return;
  const tasks = await tx.googleBusinessSync.findMany({ where: { requestId } });
  const pending = tasks.some((t) => ["QUEUED", "RUNNING", "RETRY"].includes(t.status));
  const successful = tasks.filter((t) => t.status === "SUCCESS").length;
  const status = pending
    ? tasks.every((t) => t.status === "QUEUED" && !t.attempts && !t.page)
      ? "QUEUED"
      : "RUNNING"
    : successful === tasks.length && tasks.length
      ? "SUCCESS"
      : successful
        ? "PARTIAL"
        : "FAILED";
  const old = await tx.googleBusinessRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (old.status !== status || (!pending && !old.completedAt))
    await tx.googleBusinessRequest.update({
      where: { id: requestId },
      data: { status, completedAt: pending ? null : (old.completedAt ?? new Date()) },
    });
}
export async function manualSyncStatus(actorId: string, requestId: string) {
  return analytics(actorId, async (tx, actor) => {
    await maintainQueue(tx);
    const request = await tx.googleBusinessRequest.findUnique({
      where: { id: requestId },
      include: { location: { include: { connection: true } }, tasks: true },
    });
    requireRule(request, "Sync request no longer exists. Check the Google connection.");
    await stationAccess(tx, actor, request.location.stationId);
    if (!request.tasks.length)
      return {
        id: request.id,
        status: request.status,
        total: 0,
        successful: 0,
        pending: 0,
        errors: [] as string[],
        nextAttemptAt: null,
      };
    await updateRequest(tx, request.id);
    const tasks = request.tasks;
    const pending = tasks.filter((t) => ["QUEUED", "RUNNING", "RETRY"].includes(t.status));
    const successful = tasks.filter((t) => t.status === "SUCCESS").length;
    const status = pending.length
      ? tasks.every((t) => t.status === "QUEUED" && !t.attempts && !t.page)
        ? "QUEUED"
        : "RUNNING"
      : successful === tasks.length && tasks.length
        ? "SUCCESS"
        : successful
          ? "PARTIAL"
          : "FAILED";
    return {
      id: request.id,
      status,
      total: tasks.length,
      successful,
      pending: pending.length,
      errors: [...new Set(tasks.map((t) => t.error).filter((e): e is string => !!e))],
      nextAttemptAt: pending.length
        ? Math.max(
            request.location.connection.rateLimitedUntil?.getTime() ?? 0,
            Math.min(
              ...pending.map((t) =>
                t.status === "RUNNING"
                  ? (t.leaseUntil?.getTime() ?? Date.now())
                  : t.nextAttemptAt.getTime(),
              ),
            ),
          )
        : null,
    };
  });
}
// Bounded execution of an existing manual request. No provider call is made by rendering.
// The submit interaction continues these steps; the independent worker can recover them.
export async function advanceManualSync(actorId: string, requestId: string) {
  const before = await manualSyncStatus(actorId, requestId);
  if (before.pending) {
    requireRule(
      googleConfigured(),
      "Google server configuration is missing. Restore the OAuth credentials and stable encryption key, then resume this sync.",
    );
    const claim = await claimGoogleSync(new Date(), requestId);
    if (claim) await processGoogleSync(claim, actorId);
  }
  return manualSyncStatus(actorId, requestId);
}

async function maintainQueue(tx: Tx) {
  await expireAuthorizers(tx);
  const blocked = await tx.googleBusinessSync.findMany({
    where: {
      requestId: { not: null },
      status: { in: ["QUEUED", "RUNNING", "RETRY"] },
      OR: [
        { location: { enabled: false } },
        { location: { connection: { status: { not: "CONNECTED" } } } },
      ],
    },
    select: { id: true, requestId: true },
  });
  if (blocked.length) {
    await tx.googleBusinessSync.updateMany({
      where: { id: { in: blocked.map((t) => t.id) } },
      data: {
        status: "FAILED",
        error:
          "Google access is unavailable. Reconnect and confirm the location mapping, then click Sync now.",
        leaseToken: null,
        leaseUntil: null,
      },
    });
    for (const id of new Set(blocked.map((t) => t.requestId))) await updateRequest(tx, id);
  }
  const active = await tx.googleBusinessRequest.findMany({
    where: { status: { in: ["QUEUED", "RUNNING"] } },
    select: { id: true },
  });
  for (const r of active) await updateRequest(tx, r.id);
}
