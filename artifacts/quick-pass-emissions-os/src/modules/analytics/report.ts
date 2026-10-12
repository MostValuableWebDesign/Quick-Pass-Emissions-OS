import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { businessDate, addDays } from "@/lib/time";
import { googleConfigured, googleCallbackUrl } from "@/lib/google-business/client";
import { decrypt } from "@/lib/google-business/crypto";
import { audit, requireRule, type Tx } from "../phase2";
import { dashboardDaySchema } from "../station/dashboard-service";
import { classifyDashboardRetests, hasVinEvidence } from "../station/dashboard-retests";
import { analytics, stationAccess } from "./transaction";
import { discovered } from "./connection";
import { cacheContext } from "./sync";
import {
  dates,
  months,
  queryRange,
  metricSummaries,
  keywordsSchema,
  reviewsSchema,
  reviewThemes,
  performanceRecommendations,
  delta,
  replyDraft,
  type Review,
} from "./rules";
async function stationBusiness(
  tx: Tx,
  station: { stationHash: string; timezoneConfirmed: boolean },
  start: string,
  end: string,
) {
  const sourceStart = addDays(start, -30);
  const logs = await tx.auditLog.findMany({
    where: {
      entityId: station.stationHash,
      action: "STATION_PERFORMANCE_DAY_CACHED",
      AND: [
        { details: { path: ["date"], gte: sourceStart } },
        { details: { path: ["date"], lte: end } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const raw = new Map<string, z.infer<typeof dashboardDaySchema>>();
  for (const log of logs) {
    const p = dashboardDaySchema.safeParse(log.details);
    if (p.success && !raw.has(p.data.date)) raw.set(p.data.date, p.data);
  }
  const all = classifyDashboardRetests([...raw.values()]),
    requested = dates(start, end);
  const usable = all.filter(
    (d) => d.date >= start && d.date <= end && d.retestComplete && hasVinEvidence(d),
  );
  const byDate = new Map(usable.map((d) => [d.date, d]));
  const missing = requested.filter((d) => !byDate.has(d));
  const stale = usable
    .filter((d) => businessDate(new Date(d.retrievedAt)) <= d.date)
    .map((d) => d.date);
  const known = usable.length > 0 && station.timezoneConfirmed;
  return {
    paidInspections: known ? usable.reduce((n, d) => n + d.passed + d.failed, 0) : null,
    freeRetests: known ? usable.reduce((n, d) => n + (d.freeRetests ?? 0), 0) : null,
    abortedOrOther: known ? usable.reduce((n, d) => n + d.aborted + d.other, 0) : null,
    reportedDays: known ? usable.length : 0,
    expectedDays: requested.length,
    missingDates: missing,
    staleDates: stale,
    complete: known && !missing.length && !stale.length && end < businessDate(),
    timezoneConfirmed: station.timezoneConfirmed,
  };
}
export async function analyticsOverview(
  actorId: string,
  input: { start: string; end: string; stationId?: string; page?: number },
) {
  const range = queryRange(input),
    page = Math.max(1, Math.min(100000, input.page ?? 1));
  return analytics(actorId, async (tx, actor) => {
    const stations = await tx.analyticsStation.findMany({
      where: actor.role === "OWNER" ? {} : { grants: { some: { userId: actor.id } } },
      orderBy: { name: "asc" },
      include: {
        locations: { select: { id: true, enabled: true, locationName: true, accountName: true } },
      },
    });
    const stationId = input.stationId || stations[0]?.id;
    if (input.stationId) await stationAccess(tx, actor, input.stationId);
    const station = stations.find((s) => s.id === stationId);
    const c = await tx.googleBusinessConnection.findUnique({ where: { id: "business" } });
    const connection = c
      ? {
          status: c.status,
          error: c.error,
          connectedAt: c.connectedAt,
          discoveryAt: c.discoveryAt,
          canDisconnect: actor.role === "OWNER" || c.createdBy === actor.id,
        }
      : null;
    let options: ReturnType<typeof discovered> = [];
    if (c && (actor.role === "OWNER" || c.createdBy === actor.id)) {
      try {
        options = discovered(c.discovery, c.discoveryExpiresAt);
      } catch {
        /* Safe setup state remains visible if a cache key changes. */
      }
    }
    const managers =
      actor.role === "OWNER"
        ? await tx.user.findMany({
            where: { role: "ADMIN", active: true },
            select: { id: true, name: true },
          })
        : [];
    const grants =
      station && actor.role === "OWNER"
        ? await tx.analyticsStationGrant.findMany({ where: { stationId: station.id } })
        : [];
    let redirectUri: string | null = null;
    try {
      redirectUri = googleCallbackUrl();
    } catch {
      /* Safe unset setup state. */
    }
    const empty = {
      redirectUri,
      actorRole: actor.role,
      configured: googleConfigured(),
      stations,
      station: station ?? null,
      connection,
      options,
      managers,
      grants,
      range,
      page,
    };
    if (!station) return { ...empty, report: null };
    const location = station.locations[0];
    const tasks = location
      ? await tx.googleBusinessSync.findMany({
          where: { locationId: location.id },
          orderBy: { updatedAt: "desc" },
        })
      : [];
    const caches =
      location && location.enabled && c && c.status !== "DISCONNECTED"
        ? await tx.googleBusinessCache.findMany({
            where: { locationId: location.id, expiresAt: { gt: new Date() } },
          })
        : [];
    const source: Record<string, unknown[]> = { PERFORMANCE: [], KEYWORDS: [], REVIEWS: [] };
    let unreadable = 0;
    const keywordRows: {
      period: string;
      keyword: string;
      value: string | null;
      threshold: string | null;
      complete: boolean;
    }[] = [];
    const reviewMap = new Map<string, Review>();
    const fetched: Date[] = [];
    const freshness: { kind: string; period: string; page: number; fetchedAt: Date }[] = [];
    for (const cache of caches) {
      const task = tasks.find((t) => t.kind === cache.kind && t.period === cache.period);
      if (!task || (task.publishedCycle ?? task.cycle) !== cache.cycle) continue;
      try {
        const raw = decrypt(
          cache.payload,
          cacheContext(cache.locationId, cache.kind, cache.period, cache.cycle, cache.page),
        );
        if (cache.kind === "PERFORMANCE") source.PERFORMANCE.push(raw);
        if (cache.kind === "KEYWORDS" && months(range.start, range.end).includes(cache.period))
          for (const row of keywordsSchema.parse(raw).searchKeywordsCounts ?? [])
            keywordRows.push({
              period: cache.period,
              keyword: row.searchKeyword,
              value: row.insightsValue.value ?? null,
              threshold: row.insightsValue.threshold ?? null,
              complete:
                task.publishedPage !== null &&
                caches.filter(
                  (c) =>
                    c.kind === task.kind &&
                    c.period === task.period &&
                    c.cycle === task.publishedCycle,
                ).length ===
                  task.publishedPage + 1 &&
                cache.period < businessDate().slice(0, 7),
            });
        if (cache.kind === "REVIEWS")
          for (const review of reviewsSchema.parse(raw).reviews ?? []) {
            const prior = reviewMap.get(review.reviewId);
            if (!prior || review.updateTime > prior.updateTime)
              reviewMap.set(review.reviewId, review);
          }
        if (
          cache.kind === "REVIEWS" ||
          months(range.previous.start, range.end).includes(cache.period)
        ) {
          fetched.push(cache.fetchedAt);
          freshness.push({
            kind: cache.kind,
            period: cache.period,
            page: cache.page,
            fetchedAt: cache.fetchedAt,
          });
        }
      } catch {
        unreadable++;
      }
    }
    const uniqueKeywords = [
      ...new Map(keywordRows.map((row) => [`${row.period}:${row.keyword}`, row])).values(),
    ].sort((a, b) => a.period.localeCompare(b.period) || a.keyword.localeCompare(b.keyword));
    const current = metricSummaries(source.PERFORMANCE, range.start, range.end),
      previous = metricSummaries(source.PERFORMANCE, range.previous.start, range.previous.end);
    const reviews = [...reviewMap.values()].sort((a, b) =>
      b.createTime.localeCompare(a.createTime),
    );
    const reviewTask = tasks.find((t) => t.kind === "REVIEWS");
    const reviewComplete =
      !!reviewTask &&
      reviewTask.publishedPage !== null &&
      caches.filter((k) => k.kind === "REVIEWS" && k.cycle === reviewTask.publishedCycle).length ===
        reviewTask.publishedPage + 1;
    const latestRequest = location
      ? await tx.googleBusinessRequest.findFirst({
          where: { locationId: location.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            start: true,
            end: true,
            status: true,
            createdAt: true,
            completedAt: true,
          },
        })
      : null;
    const lastSuccessfulRequest = location
      ? await tx.googleBusinessRequest.findFirst({
          where: { locationId: location.id, status: "SUCCESS" },
          orderBy: { completedAt: "desc" },
          select: { completedAt: true },
        })
      : null;
    const reviewLocalDate = (r: Review) => businessDate(new Date(r.createTime));
    const selectedReviews = reviews.filter(
      (r) => reviewLocalDate(r) >= range.start && reviewLocalDate(r) <= range.end,
    );
    const currentBusiness = await stationBusiness(tx, station, range.start, range.end),
      previousBusiness = await stationBusiness(
        tx,
        station,
        range.previous.start,
        range.previous.end,
      );
    const attribution = await tx.marketingAttribution.findMany({
      where: { stationId: station.id, date: { gte: range.start, lte: range.end } },
      orderBy: [{ date: "desc" }, { id: "asc" }],
    });
    const actions = await tx.analyticsAction.findMany({
      where: { stationId: station.id },
      orderBy: [{ date: "desc" }, { id: "asc" }],
      take: 15,
      skip: (page - 1) * 15,
    });
    const actionCount = await tx.analyticsAction.count({ where: { stationId: station.id } });
    const businessReceipts =
      actor.role === "OWNER"
        ? await tx.dealerPayment.findMany({
            where: { date: { gte: range.start, lte: range.end } },
            select: { amountCents: true },
          })
        : null;
    const receiptSum = businessReceipts?.reduce((n, r) => n + BigInt(r.amountCents), 0n);
    return {
      ...empty,
      report: {
        current,
        previous,
        latestRequest,
        lastSuccessfulSync: lastSuccessfulRequest?.completedAt ?? null,
        freshness,
        oldestFetchedAt: fetched.length
          ? new Date(Math.min(...fetched.map((d) => d.getTime())))
          : null,
        comparisons: current.map((m) => ({
          metric: m.metric,
          change: delta(
            m,
            previous.find((p) => p.metric === m.metric)!,
          ),
        })),
        monthly: months(range.start, range.end).map((month) => {
          const first = month + "-01",
            last = Temporal.PlainYearMonth.from(month)
              .toPlainDate({ day: Temporal.PlainYearMonth.from(month).daysInMonth })
              .toString();
          return {
            month,
            start: first < range.start ? range.start : first,
            end: last > range.end ? range.end : last,
            partial:
              first < range.start || last > range.end || month === businessDate().slice(0, 7),
            metrics: metricSummaries(
              source.PERFORMANCE,
              first < range.start ? range.start : first,
              last > range.end ? range.end : last,
            ),
          };
        }),
        currentBusiness,
        previousBusiness,
        keywordRows: uniqueKeywords,
        reviewComplete,
        reviewCount: selectedReviews.length,
        reviews: selectedReviews.slice((page - 1) * 15, page * 15).map((r) => ({
          ...r,
          localDate: reviewLocalDate(r),
          draft: r.reviewReply ? null : replyDraft(r),
        })),
        themes: reviewThemes(reviews, range.start, range.end, range.previous.start),
        recommendations: performanceRecommendations(current, previous),
        taskCount: tasks.length,
        tasks: tasks
          .slice((page - 1) * 15, page * 15)
          .map(({ kind, period, status, error, lastSuccessAt, updatedAt }) => ({
            kind,
            period,
            status,
            error,
            lastSuccessAt,
            updatedAt,
          })),
        fetchedAt: fetched.length ? new Date(Math.max(...fetched.map((d) => d.getTime()))) : null,
        unreadable,
        attribution: attribution.slice((page - 1) * 15, page * 15),
        attributionCount: attribution.length,
        attributedCustomers: attribution.length
          ? attribution.reduce((n, r) => n + r.customers, 0)
          : null,
        recordedCostCents: attribution.some((r) => r.costCents !== null)
          ? attribution.reduce((n, r) => n + BigInt(r.costCents ?? 0), 0n).toString()
          : null,
        actions,
        actionCount,
        unallocatedDealerReceiptsCents: receiptSum === undefined ? null : receiptSum.toString(),
        unallocatedReceiptCount: businessReceipts?.length ?? 0,
      },
    };
  });
}
export async function recordAnalyticsAction(actorId: string, input: unknown) {
  const d = z
    .object({
      stationId: z.string().min(1),
      category: z.enum(["PERFORMANCE", "REVIEWS", "OPERATIONS"]),
      action: z.string().trim().min(1).max(2000),
      date: z.string(),
      reviewDate: z.string(),
      target: z.string().trim().min(1).max(500),
    })
    .parse(input);
  queryRange({ start: d.date, end: d.date });
  requireRule(
    /^\d{4}-\d{2}-\d{2}$/.test(d.reviewDate) &&
      Temporal.PlainDate.from(d.reviewDate).toString() === d.reviewDate &&
      d.reviewDate > d.date,
    "Review date must follow the action date.",
  );
  return analytics(actorId, async (tx, actor) => {
    requireRule(actor.role === "OWNER", "Only owners record improvement actions.");
    await stationAccess(tx, actor, d.stationId);
    const row = await tx.analyticsAction.create({ data: { ...d, createdBy: actorId } });
    await audit(tx, actorId, "ANALYTICS_ACTION_RECORDED", row.id, {
      stationId: d.stationId,
      category: d.category,
    });
  });
}
export async function reviewAnalyticsAction(actorId: string, input: unknown) {
  const d = z
    .object({ id: z.string().min(1), outcome: z.string().trim().min(1).max(2000) })
    .parse(input);
  return analytics(actorId, async (tx, actor) => {
    requireRule(actor.role === "OWNER", "Only owners review improvement actions.");
    const row = await tx.analyticsAction.findUnique({ where: { id: d.id } });
    requireRule(row && !row.reviewedAt, "Action already reviewed or unavailable.");
    await stationAccess(tx, actor, row.stationId);
    requireRule(
      row.reviewDate <= businessDate(),
      "Wait until the planned review date to record follow-up results.",
    );
    await tx.analyticsAction.update({
      where: { id: row.id },
      data: { outcome: d.outcome, reviewedAt: new Date() },
    });
    await audit(tx, actorId, "ANALYTICS_ACTION_REVIEWED", row.id, {});
  });
}
export async function recordAttribution(actorId: string, input: unknown) {
  const numeric = z
    .union([z.number(), z.string().trim().min(1)])
    .transform((v) => Number(v))
    .pipe(z.number().int().min(0).max(2_000_000_000));
  const d = z
    .object({
      stationId: z.string().min(1),
      date: z.string(),
      channel: z.string().trim().min(1).max(100),
      customers: numeric,
      costCents: numeric.nullable(),
      reference: z.string().trim().min(1).max(160),
      evidence: z.string().trim().min(1).max(2000),
    })
    .parse(input);
  queryRange({ start: d.date, end: d.date });
  return analytics(actorId, async (tx, actor) => {
    await stationAccess(tx, actor, d.stationId);
    const row = await tx.marketingAttribution.create({ data: { ...d, createdBy: actorId } });
    await audit(tx, actorId, "MARKETING_ATTRIBUTION_RECORDED", row.id, {
      stationId: d.stationId,
      date: d.date,
    });
  });
}
