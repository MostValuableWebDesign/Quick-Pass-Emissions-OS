import { auth } from "@/lib/auth";
import { z } from "zod";

const credentials = z
  .object({
    currentPassword: z.string().min(12).max(128),
    newPassword: z.string().min(12).max(128),
    confirmPassword: z.string().min(12).max(128),
  })
  .strict()
  .refine((value) => value.newPassword === value.confirmPassword);

function redirectTo(path: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: path, "Cache-Control": "no-store" },
  });
}

// Native POST is safe before hydration. Identity comes only from the session.
// Use the HTTP handler, not a server API call that could bypass CSRF/rate limits.
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 16_384)
      return redirectTo("/settings/account?error=validation");
    const form = await request.formData();
    const input = credentials.safeParse(Object.fromEntries(form));
    if (!input.success) return redirectTo("/settings/account?error=validation");

    const headers = new Headers(request.headers);
    headers.set("content-type", "application/json");
    headers.delete("content-length");
    const result = await auth.handler(
      new Request(new URL("/api/auth/change-password", request.url), {
        method: "POST",
        headers,
        body: JSON.stringify({
          currentPassword: input.data.currentPassword,
          newPassword: input.data.newPassword,
          revokeOtherSessions: true,
        }),
      }),
    );
    let path = "/settings/account?changed=1";
    if (!result.ok) {
      if (result.status === 401) path = "/login";
      else {
        const body = await result.json().catch(() => null);
        const error =
          result.status === 429
            ? "rate_limit"
            : result.status === 403
              ? "security"
              : body?.code === "INVALID_PASSWORD"
                ? "current"
                : result.status >= 500
                  ? "unavailable"
                  : "validation";
        path = `/settings/account?error=${error}`;
      }
    }
    const response = redirectTo(path);
    for (const cookie of result.headers.getSetCookie()) {
      response.headers.append("set-cookie", cookie);
    }
    return response;
  } catch {
    // Do not log authentication exceptions or echo form values.
    return redirectTo("/settings/account?error=unavailable");
  }
}
