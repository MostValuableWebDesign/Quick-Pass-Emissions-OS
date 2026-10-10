import { auth } from "@/lib/auth";
import { z } from "zod";

const credentials = z.object({
  email: z.email(),
  password: z.string().min(12).max(128),
});

function redirectTo(path: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: path, "Cache-Control": "no-store" },
  });
}

// A native POST works before hydration and never places credentials in the URL.
// Delegate to Better Auth's HTTP handler to retain origin checks and rate limits.
export async function POST(request: Request) {
  try {
    const size = Number(request.headers.get("content-length") || 0);
    if (size > 16_384) return redirectTo("/login?error=authentication");

    const form = await request.formData();
    const input = credentials.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!input.success) return redirectTo("/login?error=authentication");

    const headers = new Headers(request.headers);
    headers.set("content-type", "application/json");
    headers.delete("content-length");
    const result = await auth.handler(
      new Request(new URL("/api/auth/sign-in/email", request.url), {
        method: "POST",
        headers,
        body: JSON.stringify(input.data),
      }),
    );

    if (!result.ok) {
      const error = result.status === 429 ? "rate_limit" : "authentication";
      return redirectTo(`/login?error=${error}`);
    }

    const response = redirectTo("/dashboard");
    for (const cookie of result.headers.getSetCookie()) {
      response.headers.append("set-cookie", cookie);
    }
    return response;
  } catch {
    // Never log request bodies, credentials, tokens, or authentication exceptions.
    return redirectTo("/login?error=unavailable");
  }
}
