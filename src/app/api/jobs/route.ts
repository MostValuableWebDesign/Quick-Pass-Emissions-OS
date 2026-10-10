import { timingSafeEqual } from "node:crypto";
import { runJobs } from "@/modules/tasks/jobs";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(supplied);
  if (
    !secret ||
    secret.length < 32 ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await runJobs());
  } catch {
    return Response.json({ error: "Operations check failed" }, { status: 500 });
  }
}
