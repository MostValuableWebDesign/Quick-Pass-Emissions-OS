import { afterEach, describe, it, expect, vi } from "vitest";
import { encrypt, decrypt } from "../src/lib/google-business/crypto";
import {
  revoke,
  authorizationUrl,
  googleConfig,
  googleGet,
  refresh,
  exchange,
  SCOPE,
  GoogleError,
  retryDelay,
  googleCallbackUrl,
  googleSetupStatus,
} from "../src/lib/google-business/client";
import {
  bounds,
  queryRange,
  metricSummaries,
  delta,
  performanceRecommendations,
  reviewThemes,
  replyDraft,
  months,
} from "../src/modules/analytics/rules";
const source = (values: { day: number; value?: string }[], metric = "CALL_CLICKS") => ({
  multiDailyMetricTimeSeries: [
    {
      dailyMetricTimeSeries: [
        {
          dailyMetric: metric,
          timeSeries: {
            datedValues: values.map((v) => ({
              date: { year: 2026, month: 5, day: v.day },
              ...(v.value === undefined ? {} : { value: v.value }),
            })),
          },
        },
      ],
    },
  ],
});
function config() {
  vi.stubEnv("GOOGLE_BUSINESS_CLIENT_ID", "fixture-client");
  vi.stubEnv("GOOGLE_BUSINESS_CLIENT_SECRET", "fixture-secret");
  vi.stubEnv("GOOGLE_BUSINESS_ENCRYPTION_KEY", "a".repeat(64));
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Google Analytics definitions, coverage and deterministic rules", () => {
  it("keeps explicit zero distinct from omitted and unavailable days", () => {
    const metric = metricSummaries(
      [source([{ day: 1, value: "0" }, { day: 2 }])],
      "2026-05-01",
      "2026-05-03",
      "2026-10-12",
    ).find((m) => m.metric === "CALL_CLICKS")!;
    expect(metric).toMatchObject({ value: 0, reportedDays: 1, missingDays: 2, complete: false });
    expect(metricSummaries([], "2026-05-01", "2026-05-03")[0].value).toBeNull();
  });
  it("deduplicates daily values without summing duplicate syncs", () => {
    const metric = metricSummaries(
      [source([{ day: 1, value: "9" }]), source([{ day: 1, value: "9" }])],
      "2026-05-01",
      "2026-05-01",
      "2026-10-12",
    ).find((m) => m.metric === "CALL_CLICKS")!;
    expect(metric).toMatchObject({ value: 9, reportedDays: 1, complete: true });
  });
  it("ignores segmented metric series and unknown metrics", () => {
    const p = source([{ day: 1, value: "5" }]);
    Object.assign(p.multiDailyMetricTimeSeries[0].dailyMetricTimeSeries[0], {
      dailySubEntityType: { dayOfWeek: "MONDAY" },
    });
    expect(
      metricSummaries(
        [p, source([{ day: 1, value: "6" }], "OLD_METRIC")],
        "2026-05-01",
        "2026-05-01",
      )[0].value,
    ).toBeNull();
  });
  it("marks even reported recent dates provisional and suppresses comparisons", () => {
    const m = metricSummaries(
      [source([{ day: 1, value: "9" }])],
      "2026-05-01",
      "2026-05-01",
      "2026-05-02",
    ).find((m) => m.metric === "CALL_CLICKS")!;
    expect(m.complete).toBe(false);
    expect(m.delayedDays).toBe(1);
    expect(delta(m, { ...m, complete: true })).toBeNull();
  });
  it("uses calendar boundaries across DST, leap days and year changes", () => {
    expect(queryRange({ start: "2026-03-08", end: "2026-03-08" }, "2026-10-12").previous).toEqual({
      start: "2026-03-07",
      end: "2026-03-07",
    });
    expect(bounds("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(months("2025-12-31", "2026-02-01")).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
  it.each([
    { start: "2026-10-13", end: "2026-10-13" },
    { start: "2026-05-02", end: "2026-05-01" },
    { start: "2025-01-01", end: "2026-10-12" },
    { start: "2026-02-30", end: "2026-03-01" },
  ])("rejects invalid reporting range %o", (input) =>
    expect(() => queryRange(input, "2026-10-12")).toThrow(),
  );
  it("does not invent percentages from zero or recommendations from partial data", () => {
    const m = metricSummaries(
      [source([{ day: 1, value: "4" }])],
      "2026-05-01",
      "2026-05-01",
      "2026-10-12",
    ).find((m) => m.metric === "CALL_CLICKS")!;
    expect(delta(m, { ...m, value: 0 })?.percent).toBeNull();
    expect(performanceRecommendations([m], [{ ...m, value: 20 }])).toMatchObject([
      { current: 4, previous: 20, change: -80 },
    ]);
    expect(performanceRecommendations([{ ...m, complete: false }], [{ ...m, value: 20 }])).toEqual(
      [],
    );
    expect(performanceRecommendations([m], [{ ...m, value: 5 }])).toEqual([]);
  });
  it("separates review periods and generates drafts without a posting API", () => {
    const review = {
      reviewId: "r",
      starRating: "ONE" as const,
      comment: "Long wait and rude staff",
      createTime: "2026-06-01T02:00:00Z",
      updateTime: "2026-10-01T12:00:00Z",
    };
    const themes = reviewThemes([review], "2026-05-01", "2026-05-31", "2026-04-01");
    expect(themes.find((t) => t.theme === "Wait times")).toMatchObject({
      current: 1,
      previous: 0,
      negative: 1,
    });
    expect(themes[0].excerpts[0].date).toBe("2026-05-31");
    expect(replyDraft(review)).toContain("management");
  });
});
describe("Google credential and fixed-origin transport security", () => {
  it("accepts Google's empty successful revocation response", async () => {
    config();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    expect(await revoke({ access_token: "access", refresh_token: "refresh", expires_at: 0 })).toBe(
      true,
    );
  });

  it("reports setup readiness without exposing OAuth or encryption values", () => {
    config();
    expect(googleSetupStatus()).toEqual({
      oauthClientReady: true,
      encryptionKeyReady: true,
      canonicalAppUrlReady: true,
      canonicalAppUrlSecure: false,
    });
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.test");
    expect(googleSetupStatus().canonicalAppUrlSecure).toBe(true);
    vi.stubEnv("GOOGLE_BUSINESS_ENCRYPTION_KEY", "invalid");
    expect(googleSetupStatus().encryptionKeyReady).toBe(false);
    const serialized = JSON.stringify(googleSetupStatus());
    expect(serialized).not.toContain("fixture-client");
    expect(serialized).not.toContain("fixture-secret");
  });

  it("encrypts with random nonces and authenticated record context", () => {
    config();
    const secret = { refresh_token: "private-refresh" },
      first = encrypt(secret, "tokens:business");
    expect(first).not.toContain("private-refresh");
    expect(first).not.toBe(encrypt(secret, "tokens:business"));
    expect(decrypt(first, "tokens:business")).toEqual(secret);
    expect(() => decrypt(first, "another-record")).toThrow();
    expect(() => decrypt(first + "changed", "tokens:business")).toThrow();
    vi.stubEnv("GOOGLE_BUSINESS_ENCRYPTION_KEY", "b".repeat(64));
    expect(() => decrypt(first, "tokens:business")).toThrow();
  });
  it("uses one required scope, state, offline access and S256 PKCE", () => {
    config();
    const url = new URL(authorizationUrl("state-value", "challenge-value"));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")).toBe(SCOPE);
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/google-business/callback",
    );
  });
  it("rejects insecure public redirect URLs and credential-bearing origins", () => {
    config();
    for (const url of [
      "http://example.com",
      "https://user:pass@example.com",
      "https://example.com/path",
      "https://example.com/?redirect=other",
    ]) {
      vi.stubEnv("BETTER_AUTH_URL", url);
      expect(() => googleConfig()).toThrow();
    }
  });
  it("displays the exact canonical callback before OAuth credentials are configured", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://quickpass.example.test");
    vi.stubEnv("GOOGLE_BUSINESS_CLIENT_ID", "");
    expect(googleCallbackUrl()).toBe("https://quickpass.example.test/api/google-business/callback");
  });
  it("handles numeric and HTTP-date Retry-After safely", () => {
    expect(retryDelay("120", 0)).toBe(120000);
    expect(retryDelay("Thu, 01 Jan 1970 00:02:00 GMT", 0)).toBe(120000);
    expect(retryDelay("invalid", 0)).toBe(0);
    expect(retryDelay("999999999", 0)).toBe(86400000);
  });
  it("uses only read requests and rejects arbitrary destinations", async () => {
    config();
    const fn = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fn);
    await googleGet(
      "mybusiness.googleapis.com",
      "/v4/accounts/a/locations/l/reviews",
      new URLSearchParams(),
      "access",
      Date.now() + 10000,
    );
    expect(fn.mock.calls[0][1]).toMatchObject({
      method: "GET",
      redirect: "error",
      cache: "no-store",
    });
    await expect(
      googleGet("evil.example", "/anything", new URLSearchParams(), "access", Date.now() + 10000),
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("refreshes tokens server-side and preserves an omitted replacement refresh token", async () => {
    config();
    const fn = vi
      .fn()
      .mockResolvedValue(Response.json({ access_token: "new-access", expires_in: 3600 }));
    vi.stubGlobal("fetch", fn);
    const t = await refresh(
      { access_token: "old", refresh_token: "kept-refresh", expires_at: 0 },
      Date.now() + 10000,
    );
    expect(t.refresh_token).toBe("kept-refresh");
    expect(fn.mock.calls[0][1].body.get("client_secret")).toBe("fixture-secret");
  });
  it("handles revoked refresh tokens without surfacing provider secrets", async () => {
    config();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "invalid_grant", secret: "private" }, { status: 400 }),
        ),
    );
    await expect(
      refresh({ access_token: "old", refresh_token: "private", expires_at: 0 }, Date.now() + 10000),
    ).rejects.toMatchObject({ code: "RECONNECT" });
  });
  it("rejects authorization missing the required scope or offline token", async () => {
    config();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ access_token: "private", expires_in: 3600, scope: SCOPE }),
        ),
    );
    await expect(exchange("code", "verifier")).rejects.toBeInstanceOf(GoogleError);
  });
  it("classifies retryable quota failures with fixed safe errors", async () => {
    config();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ message: "private" }, { status: 429 })),
    );
    await expect(
      googleGet(
        "mybusiness.googleapis.com",
        "/v4/accounts/a/locations/l/reviews",
        new URLSearchParams(),
        "access",
        Date.now() + 10000,
      ),
    ).rejects.toMatchObject({ code: "QUOTA", retryable: true });
  });
});
