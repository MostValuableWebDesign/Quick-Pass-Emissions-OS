export function previewTrustedOrigins(env: Readonly<Record<string, string | undefined>>): string[] {
  if (env.NODE_ENV !== "development" || !env.REPLIT_DEV_DOMAIN) return [];
  if (!env.PORT || !/^\d+$/.test(env.PORT)) return [];
  const port = Number(env.PORT);
  if (port < 1 || port > 65535) return [];

  // The development preview forwards browser requests with this upstream origin.
  // Keep this exception exact and development-only; never disable CSRF checks.
  return [`https://0.0.0.0:${port}`];
}

export function previewServerActionHosts(
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  return previewTrustedOrigins(env).map((origin) => new URL(origin).host);
}
