import { randomUUID } from "node:crypto";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { db } from "@/lib/db";
import { lookupAddresses } from "@/lib/address-lookup";

export const runtime = "nodejs";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const origins = [new URL(request.url).origin];
  if (process.env.BETTER_AUTH_URL) origins.push(new URL(process.env.BETTER_AUTH_URL).origin);
  if (process.env.NODE_ENV === "development" && process.env.REPLIT_DEV_DOMAIN)
    origins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  if (!origins.includes(request.headers.get("origin") ?? ""))
    return reply({ error: "Forbidden" }, 403);
  // currentUser re-reads active management access; Next redirects unauthenticated users.
  const actor = await currentUser();
  if (!process.env.GEOAPIFY_API_KEY)
    return reply({ error: "Lookup unavailable. Enter the address manually." }, 503);
  try {
    if (Number(request.headers.get("content-length") || 0) > 2048)
      return reply({ error: "Invalid search" }, 400);
    const text = await request.text();
    if (text.length > 2048) return reply({ error: "Invalid search" }, 400);
    const { query } = z
      .object({ query: z.string().trim().min(3).max(200) })
      .parse(JSON.parse(text));
    // One persistent counter per management account, shared across app processes.
    const key = `contact-address:${actor.id}`;
    const now = BigInt(Date.now());
    const rows = await db.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest") VALUES (${randomUUID()}, ${key}, 1, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."lastRequest" < ${now - 60000n} THEN 1 ELSE LEAST("RateLimit"."count" + 1, 31) END,
        "lastRequest" = CASE WHEN "RateLimit"."lastRequest" < ${now - 60000n} THEN ${now} ELSE "RateLimit"."lastRequest" END
      RETURNING "count"`;
    if (rows[0].count > 30)
      return reply(
        { error: "Lookup limit reached. Enter manually or try again in a minute." },
        429,
      );
    return reply({ suggestions: await lookupAddresses(query, request.signal) });
  } catch (error) {
    return reply(
      {
        error:
          error instanceof z.ZodError || error instanceof SyntaxError
            ? "Invalid search"
            : "Lookup unavailable. Enter the address manually.",
      },
      error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503,
    );
  }
}
