import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { requireRule } from "../../phase2";
function key() {
  const secret = process.env.BETTER_AUTH_SECRET;
  requireRule(
    secret && secret.length >= 32,
    "A stable BETTER_AUTH_SECRET is required to protect inspection source data.",
  );
  return Buffer.from(hkdfSync("sha256", secret, "quick-pass-history-v1", "inspection-source", 32));
}
export function seal(value: unknown, context: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}
export function unseal<T>(value: string, context: string): T {
  const [version, iv, tag, body] = value.split(".");
  requireRule(
    version === "v1" && body,
    "Source evidence is unavailable; restore the original authentication secret.",
  );
  const cipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([cipher.update(Buffer.from(body, "base64url")), cipher.final()]).toString("utf8"),
  ) as T;
}
