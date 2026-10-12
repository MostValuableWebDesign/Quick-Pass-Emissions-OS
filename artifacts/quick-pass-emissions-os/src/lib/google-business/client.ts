import { z } from "zod";
import { BusinessError, requireRule } from "@/modules/phase2";
export const SCOPE = "https://www.googleapis.com/auth/business.manage";
export const tokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.number().finite(),
});
export type Tokens = z.infer<typeof tokensSchema>;
export class GoogleError extends BusinessError {
  constructor(
    public code: string,
    public retryable = false,
    public retryAfterMs = 0,
  ) {
    super(
      (
        {
          RECONNECT: "Google authorization expired or was revoked. Reconnect Google.",
          ACCESS:
            "Google denied access. Confirm project approval, enabled APIs and location permissions.",
          QUOTA: "Google quota reached. The queued request will retry.",
          NETWORK: "Google is temporarily unavailable. The queued request will retry.",
          RESPONSE: "Google returned an unsupported response. Review API configuration.",
          RANGE: "Google could not serve this reporting range. Try a more recent month.",
        } as Record<string, string>
      )[code] ?? "Google request failed.",
    );
  }
}
export function googleConfig() {
  const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim();
  requireRule(
    clientId &&
      clientSecret &&
      /^[a-f0-9]{64}$/i.test(process.env.GOOGLE_BUSINESS_ENCRYPTION_KEY ?? ""),
    "Google setup needed: configure the OAuth client, app URL and encryption key. See GOOGLE_ANALYTICS.md.",
  );
  const base = canonicalOrigin();
  return { clientId, clientSecret, redirectUri: googleCallbackUrl(), origin: base.origin };
}
function canonicalOrigin() {
  const raw = process.env.BETTER_AUTH_URL;
  requireRule(raw, "Configure the canonical BETTER_AUTH_URL.");
  const base = new URL(raw);
  requireRule(
    (base.protocol === "https:" ||
      (process.env.NODE_ENV !== "production" &&
        base.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(base.hostname))) &&
      !base.username &&
      !base.password &&
      base.pathname === "/" &&
      !base.search &&
      !base.hash,
    "Use a secure canonical BETTER_AUTH_URL (localhost HTTP is allowed for development).",
  );
  return base;
}
export function googleCallbackUrl() {
  return new URL("/api/google-business/callback", canonicalOrigin()).href;
}
export function googleConfigured() {
  try {
    googleConfig();
    return true;
  } catch {
    return false;
  }
}
/** Readiness metadata only. Never return OAuth credentials or encryption-key material. */
export function googleSetupStatus() {
  let origin: URL | null = null;
  try {
    origin = canonicalOrigin();
  } catch {
    /* Missing or invalid configuration remains an explicit setup item. */
  }
  return {
    oauthClientReady: Boolean(
      process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim() &&
      process.env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim(),
    ),
    encryptionKeyReady: /^[a-f0-9]{64}$/i.test(process.env.GOOGLE_BUSINESS_ENCRYPTION_KEY ?? ""),
    canonicalAppUrlReady: !!origin,
    canonicalAppUrlSecure: origin?.protocol === "https:",
  };
}
export function authorizationUrl(state: string, challenge: string) {
  const c = googleConfig(),
    u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: "code",
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  }).toString();
  return u.href;
}
export function retryDelay(value: string | null, now = Date.now()) {
  if (!value) return 0;
  const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(0, Math.min(delay, 86400000)) : 0;
}
// Fixed endpoints only. No caller-controlled host, redirects, raw response logging or API writes.
async function request(url: URL, init: RequestInit, deadline: number) {
  let response: Response;
  try {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error();
    response = await fetch(url, {
      ...init,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(Math.min(8000, remaining)),
    });
    if (!response.ok)
      throw new GoogleError(
        response.status === 401
          ? "RECONNECT"
          : response.status === 403
            ? "ACCESS"
            : response.status === 429
              ? "QUOTA"
              : response.status >= 500
                ? "NETWORK"
                : "RANGE",
        response.status === 429 || response.status >= 500,
        retryDelay(response.headers.get("Retry-After")),
      );
    const text = await response.text();
    if (text.length > 4_000_000) throw new GoogleError("RESPONSE");
    if (!text.trim() && url.hostname === "oauth2.googleapis.com" && url.pathname === "/revoke")
      return {};
    return JSON.parse(text) as unknown;
  } catch (e) {
    if (e instanceof GoogleError) throw e;
    throw new GoogleError("NETWORK", true);
  }
}
export async function exchange(code: string, verifier: string, deadline = Date.now() + 25000) {
  const c = googleConfig();
  const result = await request(
    new URL("https://oauth2.googleapis.com/token"),
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: c.clientId,
        client_secret: c.clientSecret,
        redirect_uri: c.redirectUri,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
      }),
    },
    deadline,
  );
  const p = z
    .object({
      access_token: z.string().min(1),
      refresh_token: z.string().min(1),
      expires_in: z.number().positive(),
      scope: z.string(),
    })
    .safeParse(result);
  if (!p.success || !p.data.scope.split(" ").includes(SCOPE)) throw new GoogleError("RECONNECT");
  return {
    access_token: p.data.access_token,
    refresh_token: p.data.refresh_token,
    expires_at: Date.now() + p.data.expires_in * 1000,
  };
}
export async function refresh(tokens: Tokens, deadline: number): Promise<Tokens> {
  if (tokens.expires_at > Date.now() + 60000) return tokens;
  const c = googleConfig();
  let result: unknown;
  try {
    result = await request(
      new URL("https://oauth2.googleapis.com/token"),
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: c.clientId,
          client_secret: c.clientSecret,
          refresh_token: tokens.refresh_token,
          grant_type: "refresh_token",
        }),
      },
      deadline,
    );
  } catch (e) {
    if (e instanceof GoogleError && !e.retryable) throw new GoogleError("RECONNECT");
    throw e;
  }
  const p = z
    .object({
      access_token: z.string().min(1),
      expires_in: z.number().positive(),
      refresh_token: z.string().min(1).optional(),
    })
    .safeParse(result);
  if (!p.success) throw new GoogleError("RECONNECT");
  return { ...tokens, ...p.data, expires_at: Date.now() + p.data.expires_in * 1000 };
}
const hosts = [
  "mybusinessaccountmanagement.googleapis.com",
  "mybusinessbusinessinformation.googleapis.com",
  "businessprofileperformance.googleapis.com",
  "mybusiness.googleapis.com",
];
export async function googleGet(
  host: (typeof hosts)[number],
  path: string,
  params: URLSearchParams,
  token: string,
  deadline: number,
) {
  requireRule(
    hosts.includes(host) && path.startsWith("/") && !path.includes(".."),
    "Invalid Google resource.",
  );
  const u = new URL(path, `https://${host}`);
  requireRule(u.hostname === host, "Invalid Google resource.");
  u.search = params.toString();
  return request(u, { method: "GET", headers: { Authorization: `Bearer ${token}` } }, deadline);
}
export async function revoke(tokens: Tokens) {
  try {
    await request(
      new URL("https://oauth2.googleapis.com/revoke"),
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: tokens.refresh_token }),
      },
      Date.now() + 8000,
    );
    return true;
  } catch {
    return false;
  }
}
