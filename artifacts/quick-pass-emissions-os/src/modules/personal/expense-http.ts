import { NextResponse } from "next/server";
import { z } from "zod";
import { previewTrustedOrigins } from "@/lib/auth-origins";

export function trustedExpenseRequest(request: Request) {
  const origins = new Set([
    new URL(request.url).origin,
    ...previewTrustedOrigins(process.env),
    ...(process.env.REPLIT_DEV_DOMAIN && process.env.NODE_ENV !== "production"
      ? [`https://${process.env.REPLIT_DEV_DOMAIN}`]
      : []),
    ...(process.env.BETTER_AUTH_URL ? [new URL(process.env.BETTER_AUTH_URL).origin] : []),
  ]);
  if (!origins.has(request.headers.get("origin") ?? ""))
    throw new Error("Untrusted request origin.");
}
export function expenseResponse(data: unknown) {
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
export function expenseError(error: unknown) {
  const message =
    error instanceof z.ZodError
      ? error.issues.map((i) => i.message).join(" ")
      : error instanceof Error && !error.name.startsWith("Prisma")
        ? error.message
        : "Unable to save. Your changes have not been saved.";
  return NextResponse.json(
    { error: message },
    {
      status: message.includes("changed in another session")
        ? 409
        : message === "Untrusted request origin."
          ? 403
          : 400,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
