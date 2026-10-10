export const dynamic = "force-dynamic";

/** Public liveness only. Startup already validates the pinned datastore. */
export function GET() {
  return Response.json({ status: "ok" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
