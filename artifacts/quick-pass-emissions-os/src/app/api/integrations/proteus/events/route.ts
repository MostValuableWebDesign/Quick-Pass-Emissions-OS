import { ingestNormalized, IngestionError } from "@/modules/chemical-monitoring/service";
import { boundedJson, response } from "@/modules/chemical-monitoring/http";
export const runtime = "nodejs";
export const maxDuration = 30;
// Quick Pass normalized contract. No native Proteus payload/transport adapter is asserted.
export async function POST(request: Request) {
  try {
    if (new URL(request.url).search)
      return response({ error: "Do not put credentials or event data in URLs." }, 400);
    const match = /^Bearer (qpcs_[A-Za-z0-9_-]{43})$/.exec(
      request.headers.get("authorization") || "",
    );
    if (!match) return response({ error: "Valid device Bearer credential required." }, 401);
    const body = await boundedJson(request);
    const result = await ingestNormalized(match[1], body);
    return response(result, result.disposition === "APPLIED" || result.duplicate ? 200 : 202);
  } catch (e) {
    return e instanceof IngestionError
      ? response({ error: e.message }, e.status, e.retryAfter)
      : response(
          { error: "Receiver temporarily unavailable. Retry the same event identity." },
          503,
          60,
        );
  }
}
