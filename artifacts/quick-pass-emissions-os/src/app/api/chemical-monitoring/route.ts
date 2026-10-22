import { z } from "zod";
import { currentUser } from "@/lib/access";
import { BusinessError } from "@/modules/phase2";
import { registerAnalyticsStation } from "@/modules/analytics/connection";
import { boundedJson, response } from "@/modules/chemical-monitoring/http";
import {
  monitoringOverview,
  saveSensor,
  rotateCredential,
  recordRefill,
  syntheticEvent,
  IngestionError,
} from "@/modules/chemical-monitoring/service";
import { id } from "@/lib/validation";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const origins = [new URL(request.url).origin];
  if (process.env.BETTER_AUTH_URL) origins.push(new URL(process.env.BETTER_AUTH_URL).origin);
  if (process.env.NODE_ENV === "development" && process.env.REPLIT_DEV_DOMAIN)
    origins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  if (!origins.includes(request.headers.get("origin") || ""))
    return response({ error: "Forbidden" }, 403);
  const actor = await currentUser();
  try {
    const body = z
      .object({
        command: z.enum(["LIST", "SAVE", "ROTATE", "REVOKE", "REFILLED", "TEST", "STATION"]),
        input: z.unknown().optional(),
        sensorId: id.optional(),
        query: z.unknown().optional(),
      })
      .strict()
      .parse(await boundedJson(request));
    let token: string | null | undefined;
    if (body.command === "SAVE") await saveSensor(actor.id, body.input);
    if (body.command === "ROTATE" || body.command === "REVOKE")
      token = await rotateCredential(actor.id, id.parse(body.sensorId), body.command === "REVOKE");
    if (body.command === "REFILLED") await recordRefill(actor.id, id.parse(body.sensorId));
    if (body.command === "TEST") await syntheticEvent(actor.id, body.input);
    if (body.command === "STATION") await registerAnalyticsStation(actor.id, body.input);
    return response({
      data: await monitoringOverview(actor.id, body.query),
      ...(token ? { token } : {}),
    });
  } catch (e) {
    if (e instanceof IngestionError) return response({ error: e.message }, e.status);
    return response(
      {
        error:
          e instanceof BusinessError
            ? e.message
            : e instanceof z.ZodError
              ? "Check sensor fields and the documented event format."
              : "Request could not finish. Refresh the panel and retry.",
      },
      e instanceof BusinessError ? 403 : 400,
    );
  }
}
