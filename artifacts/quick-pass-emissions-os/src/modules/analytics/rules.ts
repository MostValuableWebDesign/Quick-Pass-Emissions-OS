import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { dateString } from "@/lib/validation";
import { addDays, businessDate } from "@/lib/time";
import { requireRule } from "../phase2";
export const METRICS = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "Maps impressions · desktop",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "Maps impressions · mobile",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "Search impressions · desktop",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "Search impressions · mobile",
  CALL_CLICKS: "Call clicks",
  BUSINESS_DIRECTION_REQUESTS: "Direction requests",
  WEBSITE_CLICKS: "Website clicks",
} as const;
export type Metric = keyof typeof METRICS;
export const periodSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .refine((v) => {
    try {
      Temporal.PlainYearMonth.from(v);
      return true;
    } catch {
      return false;
    }
  });
export function bounds(period: string) {
  const month = Temporal.PlainYearMonth.from(periodSchema.parse(period));
  return {
    start: month.toPlainDate({ day: 1 }).toString(),
    end: month.toPlainDate({ day: month.daysInMonth }).toString(),
  };
}
export function dates(start: string, end: string) {
  const result: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) result.push(d);
  return result;
}
export function queryRange(input: unknown, today = businessDate()) {
  const q = z.object({ start: dateString, end: dateString }).parse(input);
  const length = Temporal.PlainDate.from(q.start).until(q.end).days + 1;
  requireRule(
    q.start >= "2000-01-01" && length >= 1 && length <= 367 && q.end <= today,
    "Choose 1–367 calendar days, ending no later than today.",
  );
  return {
    ...q,
    previous: { start: addDays(q.start, -length), end: addDays(q.start, -1) },
    days: length,
  };
}
export function months(start: string, end: string) {
  const result: string[] = [];
  for (
    let m = Temporal.PlainYearMonth.from(start.slice(0, 7));
    m.toString() <= end.slice(0, 7);
    m = m.add({ months: 1 })
  )
    result.push(m.toString());
  return result;
}
const integer = z
  .string()
  .regex(/^\d+$/)
  .refine((v) => BigInt(v) <= BigInt(Number.MAX_SAFE_INTEGER));
const googleDate = z.object({
  year: z.number().int(),
  month: z.number().int(),
  day: z.number().int(),
});
export const performanceSchema = z.object({
  multiDailyMetricTimeSeries: z
    .array(
      z.object({
        dailyMetricTimeSeries: z
          .array(
            z.object({
              dailyMetric: z.string(),
              dailySubEntityType: z.unknown().optional(),
              timeSeries: z
                .object({
                  datedValues: z
                    .array(z.object({ date: googleDate, value: integer.optional() }))
                    .optional(),
                })
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});
export const keywordsSchema = z.object({
  searchKeywordsCounts: z
    .array(
      z.object({
        searchKeyword: z.string().max(5000),
        insightsValue: z
          .object({ value: integer.optional(), threshold: integer.optional() })
          .refine(
            (v) => !(v.value !== undefined && v.threshold !== undefined),
            "Keyword value and threshold are mutually exclusive.",
          ),
      }),
    )
    .optional(),
  nextPageToken: z.string().max(20000).optional(),
});
export const reviewSchema = z.object({
  reviewId: z.string().min(1).max(1000),
  starRating: z.enum(["ONE", "TWO", "THREE", "FOUR", "FIVE", "STAR_RATING_UNSPECIFIED"]),
  comment: z.string().max(100000).optional(),
  createTime: z.string().datetime(),
  updateTime: z.string().datetime(),
  reviewer: z
    .object({ displayName: z.string().max(1000).optional(), isAnonymous: z.boolean().optional() })
    .optional(),
  reviewReply: z
    .object({
      comment: z.string().max(100000).optional(),
      updateTime: z.string().datetime().optional(),
    })
    .optional(),
});
export const reviewsSchema = z.object({
  reviews: z.array(reviewSchema).optional(),
  nextPageToken: z.string().max(20000).optional(),
  totalReviewCount: z.number().int().nonnegative().optional(),
  averageRating: z.number().min(0).max(5).optional(),
});
export type Review = z.infer<typeof reviewSchema>;
export type MetricSummary = {
  metric: Metric;
  value: number | null;
  reportedDays: number;
  expectedDays: number;
  missingDays: number;
  delayedDays: number;
  complete: boolean;
};
export function metricSummaries(
  payloads: unknown[],
  start: string,
  end: string,
  today = businessDate(),
): MetricSummary[] {
  const points = new Map<string, number>();
  for (const raw of payloads) {
    const p = performanceSchema.safeParse(raw);
    if (!p.success) continue;
    for (const group of p.data.multiDailyMetricTimeSeries ?? [])
      for (const row of group.dailyMetricTimeSeries ?? []) {
        if (
          !(row.dailyMetric in METRICS) ||
          (row.dailySubEntityType && Object.keys(row.dailySubEntityType as object).length)
        )
          continue;
        for (const point of row.timeSeries?.datedValues ?? []) {
          let date: string;
          try {
            date = Temporal.PlainDate.from(point.date, { overflow: "reject" }).toString();
          } catch {
            continue;
          }
          // Missing protobuf scalar is not silently promoted to an observed zero.
          if (date >= start && date <= end && point.value !== undefined)
            points.set(`${row.dailyMetric}:${date}`, Number(point.value));
        }
      }
  }
  const requested = dates(start, end);
  return (Object.keys(METRICS) as Metric[]).map((metric) => {
    const rows = requested.filter((d) => points.has(`${metric}:${d}`));
    const value = rows.length
      ? rows.reduce((n, d) => n + BigInt(points.get(`${metric}:${d}`)!), 0n)
      : null;
    requireRule(
      value === null || value <= BigInt(Number.MAX_SAFE_INTEGER),
      "Google total exceeds supported bounds.",
    );
    return {
      metric,
      value: value === null ? null : Number(value),
      reportedDays: rows.length,
      expectedDays: requested.length,
      missingDays: requested.length - rows.length,
      delayedDays: requested.filter((d) => d >= addDays(today, -5)).length,
      complete: rows.length === requested.length && end < addDays(today, -5),
    };
  });
}
export function delta(current: MetricSummary, previous: MetricSummary) {
  if (!current.complete || !previous.complete || current.value === null || previous.value === null)
    return null;
  return {
    absolute: current.value - previous.value,
    percent:
      previous.value === 0 ? null : ((current.value - previous.value) / previous.value) * 100,
  };
}
export function performanceRecommendations(current: MetricSummary[], previous: MetricSummary[]) {
  return current.flatMap((c) => {
    const p = previous.find((v) => v.metric === c.metric),
      change = p ? delta(c, p) : null;
    if (!change || change.percent === null || change.percent > -20 || p!.value! < 10) return [];
    const actions: Partial<Record<Metric, string>> = {
      CALL_CLICKS:
        "Check the published phone number and review call handling for the next 30 days.",
      WEBSITE_CLICKS:
        "Check the website link and service information; record the change and compare the next 30 days.",
      BUSINESS_DIRECTION_REQUESTS:
        "Check address, entrance instructions and operating hours; compare direction requests over the next 30 days.",
    };
    if (!actions[c.metric]) return [];
    return [
      {
        metric: c.metric,
        current: c.value,
        previous: p!.value,
        change: Math.round(change.percent),
        action: actions[c.metric]!,
        limitation:
          "Hypothesis only: seasonality, competition and demand may explain this change. Interactions do not establish customers or revenue.",
      },
    ];
  });
}
export function reviewThemes(reviews: Review[], start: string, end: string, previousStart: string) {
  const themes = {
    "Wait times": /\b(wait|waiting|slow|quick|fast|minutes?)\b/i,
    "Staff service": /\b(staff|service|friendly|rude|professional|polite|employee)\b/i,
    Pricing: /\b(price|pricing|cost|expensive|cheap|charge[ds]?)\b/i,
    Hours: /\b(hours?|closed|closing|open)\b/i,
    "Tag renewal": /\b(tag|renewal|kiosk|sticker|convenien\w*)\b/i,
  };
  return Object.entries(themes).flatMap(([theme, pattern]) => {
    const matched = reviews.filter((r) => r.comment && pattern.test(r.comment));
    const current = matched.filter(
      (r) =>
        businessDate(new Date(r.createTime)) >= start &&
        businessDate(new Date(r.createTime)) <= end,
    );
    const previous = matched.filter(
      (r) =>
        businessDate(new Date(r.createTime)) >= previousStart &&
        businessDate(new Date(r.createTime)) < start,
    );
    if (!current.length && !previous.length) return [];
    return [
      {
        theme,
        current: current.length,
        previous: previous.length,
        older: matched.filter((r) => businessDate(new Date(r.createTime)) < previousStart).length,
        negative: current.filter((r) => ["ONE", "TWO"].includes(r.starRating)).length,
        excerpts: current.slice(0, 2).map((r) => ({
          id: r.reviewId,
          text: r.comment!.slice(0, 180),
          date: businessDate(new Date(r.createTime)),
          rating: r.starRating,
        })),
      },
    ];
  });
}
export function replyDraft(review: Review) {
  return ["ONE", "TWO"].includes(review.starRating)
    ? "Thank you for sharing your feedback. We’re sorry your experience did not meet your expectations. Please contact Quick Pass Emissions directly so our management team can understand what happened and help."
    : "Thank you for visiting Quick Pass Emissions and sharing your experience. We appreciate your feedback and the opportunity to serve you.";
}
