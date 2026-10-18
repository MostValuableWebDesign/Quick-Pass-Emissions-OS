import { z } from "zod";
import { currentUser } from "@/lib/access";
import { BusinessError } from "@/modules/phase2";
import {
  listHistory,
  createHistory,
  controlHistory,
  drainRefreshHistory,
  nextHistoryBatch,
  retryHistoryWindow,
  splitHistoryWindow,
} from "@/modules/station/history/service";
import { readDashboard } from "@/modules/station/dashboard-service";
import { id, requiredInteger } from "@/lib/validation";
export const runtime = "nodejs";
export const maxDuration = 60;
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  const origins = [new URL(request.url).origin];
  if (process.env.BETTER_AUTH_URL) origins.push(new URL(process.env.BETTER_AUTH_URL).origin);
  if (process.env.NODE_ENV === "development" && process.env.REPLIT_DEV_DOMAIN)
    origins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  if (!origins.includes(request.headers.get("origin") || ""))
    return reply({ error: "Forbidden" }, 403);
  const actor = await currentUser();
  if (actor.role !== "OWNER")
    return reply({ error: "Owner access is required for VIR retrieval." }, 403);
  try {
    // Stream-limit actual bytes as well as checking the optional Content-Length.
    const limit = 16_000;
    if (Number(request.headers.get("content-length") || 0) > limit)
      return reply({ error: "Retrieval command exceeds the safe request limit." }, 413);
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Missing request" }, 400);
    let size = 0;
    const parts: Uint8Array[] = [];
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel();
          return reply({ error: "Retrieval command exceeds the safe request limit." }, 413);
        }
        parts.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = JSON.parse(Buffer.concat(parts).toString("utf8"));
    const command = z
      .enum(["LIST", "CREATE", "START", "PAUSE", "NEXT", "DRAIN_REFRESH", "RETRY", "SPLIT"])
      .parse(body.command);
    let jobId: string | undefined = body.jobId === undefined ? undefined : id.parse(body.jobId);
    let batch;
    if (command === "DRAIN_REFRESH") {
      const batch = await drainRefreshHistory(actor.id);
      return reply({
        batch,
        ...(batch.state === "STOPPED" && body.query
          ? { dashboard: await readDashboard(actor.id, body.query) }
          : {}),
      });
    }
    if (command === "CREATE")
      jobId = await createHistory(actor.id, {
        ...body.input,
        mode: "PORTAL",
        source: "GA_DASHBOARD",
      });
    else if (command !== "LIST") {
      jobId = id.parse(jobId);
      if (command === "START" || command === "PAUSE")
        await controlHistory(actor.id, jobId, command);
      if (command === "NEXT") batch = await nextHistoryBatch(actor.id, jobId);
      if (command === "RETRY") await retryHistoryWindow(actor.id, jobId, id.parse(body.windowId));
      if (command === "SPLIT") await splitHistoryWindow(actor.id, jobId, id.parse(body.windowId));
    }
    return reply({
      data: await listHistory(
        actor.id,
        jobId,
        body.jobPage === undefined ? 1 : requiredInteger(1, 100000).parse(body.jobPage),
      ),
      batch,
    });
  } catch (error) {
    return reply(
      {
        error:
          error instanceof BusinessError
            ? error.message
            : error instanceof z.ZodError || error instanceof SyntaxError
              ? "Check the selected dates, station and record limit."
              : "Retrieval request could not finish. Resume from its saved checkpoint; existing records are retained.",
      },
      error instanceof BusinessError ? 403 : 400,
    );
  }
}
