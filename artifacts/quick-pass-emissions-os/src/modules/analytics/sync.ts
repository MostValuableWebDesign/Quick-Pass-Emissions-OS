import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/db";
import { businessDate } from "@/lib/time";
import { decrypt, encrypt } from "@/lib/google-business/crypto";
import { googleConfigured, googleGet, GoogleError } from "@/lib/google-business/client";
import { audit, requireRule, type Tx } from "../phase2";
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
async function queue(tx: Tx, locationId: string, kind: string, period: string, reset: boolean) {
  const where = { locationId_kind_period: { locationId, kind, period } };
  const old = await tx.googleBusinessSync.findUnique({ where });
  if (old && (!reset || ["QUEUED", "RUNNING", "RETRY"].includes(old.status))) return;
  const data = {
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
  if (old) await tx.googleBusinessSync.update({ where, data });
  else await tx.googleBusinessSync.create({ data: { locationId, kind, period, ...data } });
}
export async function queueRange(
  tx: Tx,
  locationId: string,
  start: string,
  end: string,
  reset: boolean,
) {
  for (const period of months(start, end)) {
    await queue(tx, locationId, "PERFORMANCE", period, reset);
    await queue(tx, locationId, "KEYWORDS", period, reset);
  }
  await queue(tx, locationId, "REVIEWS", "all", reset);
}
export async function requestGoogleSync(actorId: string, locationId: string, input: unknown) {
  const range = queryRange(input);
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
    await queueRange(tx, l.id, range.start, range.end, true);
    await audit(tx, actorId, "GOOGLE_SYNC_REQUESTED", l.id, range);
  });
}
export async function enqueueDailyGoogle(now = new Date()) {
  await purgeGoogleCache(now);
  if (!googleConfigured()) return;
  await db.$transaction(
    async (tx) => {
      await analyticsLocks(tx);
      await expireAuthorizers(tx);
      const c = await tx.googleBusinessConnection.findUnique({ where: { id: "business" } });
      const today = businessDate(now);
      if (!c || c.status !== "CONNECTED" || c.lastScheduledDate === today) return;
      const locations = await tx.googleBusinessLocation.findMany({ where: { enabled: true } });
      // Re-fetch recent dates for Google's reporting delay and revisions. Historical
      // owner-selected ranges remain separate durable work; manual clicks share the queue.
      const start = Temporal.PlainDate.from(today)
        .subtract({ months: 1 })
        .with({ day: 1 })
        .toString();
      for (const l of locations) {
        const owner = await tx.user.findUnique({ where: { id: l.createdBy } });
        if (owner?.active && owner.role === "OWNER") await queueRange(tx, l.id, start, today, true);
      }
      await tx.googleBusinessConnection.update({
        where: { id: c.id },
        data: { lastScheduledDate: today },
      });
    },
    { timeout: 30000, maxWait: 10000 },
  );
}
export async function claimGoogleSync(now = new Date()) {
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
        location: { enabled: true, connection: { status: "CONNECTED" } },
        attempts: { lt: 4 },
        OR: [
          { status: { in: ["QUEUED", "RETRY"] }, nextAttemptAt: { lte: now } },
          { status: "RUNNING", leaseUntil: { lte: now } },
        ],
      },
      orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    });
    if (!row) return null;
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
) {
  return db.$transaction(
    async (tx) => {
      await analyticsLocks(tx);
      await expireAuthorizers(tx);
      const job = await tx.googleBusinessSync.findUnique({
        where: { id: claim.id },
        include: { location: { include: { connection: true, station: true } } },
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
            ...(!next ? { lastSuccessAt: new Date() } : {}),
          },
        });
        await tx.googleBusinessConnection.update({ where: { id: c.id }, data: { error: null } });
        return true;
      } catch (e) {
        const error =
          e instanceof GoogleError
            ? e.message
            : "Google sync could not complete. Check authorization, date range and response format; request a new sync after correcting setup.";
        const retry = e instanceof GoogleError && e.retryable && job.attempts < 4;
        await tx.googleBusinessSync.update({
          where: { id: job.id },
          data: {
            status: retry ? "RETRY" : "FAILED",
            error,
            nextAttemptAt: new Date(Date.now() + Math.pow(2, job.attempts - 1) * 60000),
            leaseToken: null,
            leaseUntil: null,
          },
        });
        if (e instanceof GoogleError && e.code === "RECONNECT")
          await tx.googleBusinessConnection.update({
            where: { id: job.location.connectionId },
            data: { status: "RECONNECT", credentials: null, error },
          });
        return false;
      }
    },
    { timeout: 40000, maxWait: 10000 },
  );
}
export async function runGoogleAnalytics(now = new Date()) {
  await enqueueDailyGoogle(now);
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
  return { completed, failed };
}
