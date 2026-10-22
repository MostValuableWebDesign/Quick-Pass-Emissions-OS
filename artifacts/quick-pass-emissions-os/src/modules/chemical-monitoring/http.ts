import { IngestionError } from "./service";
export async function boundedJson(request: Request, limit = 8192): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || ""))
    throw new IngestionError(415, "Use application/json.");
  if (Number(request.headers.get("content-length") || 0) > limit)
    throw new IngestionError(413, "Request exceeds 8 KB.");
  const reader = request.body?.getReader();
  if (!reader) throw new IngestionError(400, "Missing JSON event.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new IngestionError(413, "Request exceeds 8 KB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new IngestionError(400, "Invalid JSON.");
  }
}
export const response = (body: unknown, status = 200, retryAfter?: number) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
    },
  });
