import { cookies } from "next/headers";
import { manager } from "@/lib/access";
import { googleConfig } from "@/lib/google-business/client";
import { finishConnection } from "@/modules/analytics/connection";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const actor = await manager(),
    jar = await cookies();
  const browser = jar.get("quickpass-google-state")?.value;
  jar.delete({ name: "quickpass-google-state", path: "/api/google-business" });
  let status = "failed";
  const c = googleConfig();
  try {
    const params = new URL(request.url).searchParams,
      state = params.get("state"),
      code = params.get("code");
    if (params.has("error")) status = "denied";
    else if (browser && state && code && state.length <= 200 && code.length <= 4096) {
      await finishConnection(actor.id, state, browser, code);
      status = "connected";
    }
  } catch {
    /* Fixed messages only; never log OAuth callback inputs or token responses. */
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL(`/analytics?google=${status}`, c.origin).href,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
