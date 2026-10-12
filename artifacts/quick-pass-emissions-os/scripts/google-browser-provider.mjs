// Synthetic transport exclusively for the runner-owned browser workflow.
// Never imported by application code; all production hosts remain fixed.
import { assertOwnedDatabase } from "./e2e-safety.mjs";
assertOwnedDatabase(process.env);
if (
  process.env.E2E_GOOGLE_CONNECTED_ONLY !== "1" ||
  process.env.GOOGLE_BUSINESS_CLIENT_SECRET !== "synthetic-google-only"
)
  throw new Error("Owned Google verification required.");
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  if (url.hostname === "oauth2.googleapis.com")
    return Response.json(
      url.pathname === "/revoke"
        ? {}
        : {
            access_token: "synthetic-access",
            refresh_token: "synthetic-refresh",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/business.manage",
          },
    );
  if (url.hostname === "mybusinessaccountmanagement.googleapis.com")
    return Response.json({ accounts: [{ name: "accounts/synthetic-account" }] });
  if (url.hostname === "mybusinessbusinessinformation.googleapis.com")
    return Response.json({
      locations: [
        { name: "locations/synthetic-location", title: "Synthetic Google verification business" },
      ],
    });
  if (url.hostname === "businessprofileperformance.googleapis.com") {
    if (url.pathname.endsWith("/searchkeywords/impressions/monthly"))
      return Response.json({
        searchKeywordsCounts: [
          { searchKeyword: "synthetic emissions", insightsValue: { threshold: "15" } },
        ],
      });
    const year = Number(url.searchParams.get("dailyRange.startDate.year")),
      month = Number(url.searchParams.get("dailyRange.startDate.month"));
    return Response.json({
      multiDailyMetricTimeSeries: [
        {
          dailyMetricTimeSeries: [
            {
              dailyMetric: "CALL_CLICKS",
              timeSeries: { datedValues: [{ date: { year, month, day: 1 }, value: "0" }] },
            },
          ],
        },
      ],
    });
  }
  if (url.hostname === "mybusiness.googleapis.com")
    return Response.json({
      reviews: [
        {
          reviewId: "synthetic-review",
          starRating: "ONE",
          comment: "Synthetic fixture: a long wait for service",
          createTime: "2026-05-02T12:00:00Z",
          updateTime: "2026-05-02T12:00:00Z",
          reviewer: { displayName: "Synthetic reviewer" },
        },
      ],
      totalReviewCount: 1,
    });
  return original(input, init);
};
