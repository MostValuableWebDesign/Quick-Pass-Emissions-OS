import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { BusinessError } from "@/modules/phase2";
function key() {
  const value = process.env.GOOGLE_BUSINESS_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value))
    throw new BusinessError(
      "Configure GOOGLE_BUSINESS_ENCRYPTION_KEY as a stable 64-character hex secret.",
    );
  return Buffer.from(value, "hex");
}
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function encrypt(value: unknown, context: string) {
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
export function decrypt(value: string, context: string): unknown {
  try {
    const [version, iv, tag, body] = value.split(".");
    if (version !== "v1" || !body) throw new Error();
    const cipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    cipher.setAAD(Buffer.from(context));
    cipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(
      Buffer.concat([cipher.update(Buffer.from(body, "base64url")), cipher.final()]).toString(
        "utf8",
      ),
    );
  } catch {
    throw new BusinessError(
      "Stored Google data cannot be decrypted. Restore the configured encryption key or reconnect.",
    );
  }
}
