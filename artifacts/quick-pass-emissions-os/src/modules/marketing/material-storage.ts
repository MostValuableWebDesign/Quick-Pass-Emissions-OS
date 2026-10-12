import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { BusinessError } from "../phase4";
import type { UploadedMaterial } from "./service";

export const MAX_MATERIAL_BYTES = 2 * 1024 * 1024;
export function validateMaterialFile(bytes: Buffer, type: string, name: string) {
  if (!bytes.length || bytes.length > MAX_MATERIAL_BYTES)
    throw new BusinessError("Choose a PNG, JPEG or PDF of at most 2 MB.");
  const valid =
    type === "image/png"
      ? bytes.length >= 45 &&
        bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
        bytes.subarray(12, 16).toString("ascii") === "IHDR" &&
        bytes.subarray(-8, -4).toString("ascii") === "IEND" &&
        bytes.readUInt32BE(16) > 0 &&
        bytes.readUInt32BE(20) > 0 &&
        bytes.readUInt32BE(16) <= 10000 &&
        bytes.readUInt32BE(20) <= 10000
      : type === "image/jpeg"
        ? bytes.length >= 12 &&
          bytes[0] === 255 &&
          bytes[1] === 216 &&
          bytes[2] === 255 &&
          bytes[bytes.length - 2] === 255 &&
          bytes[bytes.length - 1] === 217
        : type === "application/pdf"
          ? bytes.length >= 20 &&
            bytes.subarray(0, 5).toString("ascii") === "%PDF-" &&
            bytes.subarray(-1024).toString("ascii").includes("%%EOF")
          : false;
  const extension =
    type === "image/png" ? /\.png$/i : type === "image/jpeg" ? /\.jpe?g$/i : /\.pdf$/i;
  if (!valid || !extension.test(name))
    throw new BusinessError("File content, type and extension must match PNG, JPEG or PDF.");
}
function storage() {
  return new Storage({
    projectId: "",
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: "http://127.0.0.1:1106/token",
      type: "external_account",
      credential_source: {
        url: "http://127.0.0.1:1106/credential",
        format: { type: "json", subject_token_field_name: "access_token" },
      },
      universe_domain: "googleapis.com",
    },
  });
}
function privateFile(path: string) {
  const root = process.env.PRIVATE_OBJECT_DIR?.replace(/\/+$/, "");
  if (!root || !path.startsWith(`${root}/marketing/`))
    throw new BusinessError("Private material storage is unavailable.");
  const parts = path.replace(/^\/+/, "").split("/");
  return storage().bucket(parts.shift()!).file(parts.join("/"));
}
export async function uploadMaterial(
  bytes: Buffer,
  mimeType: string,
  filename: string,
): Promise<UploadedMaterial> {
  validateMaterialFile(bytes, mimeType, filename);
  const root = process.env.PRIVATE_OBJECT_DIR?.replace(/\/+$/, "");
  if (!root) throw new BusinessError("Private material storage must be configured first.");
  const objectPath = `${root}/marketing/${randomUUID()}`;
  await privateFile(objectPath).save(bytes, {
    resumable: false,
    metadata: { contentType: mimeType, cacheControl: "private, no-store" },
  });
  return {
    objectPath,
    mimeType,
    filename: filename.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 140),
    byteSize: bytes.length,
  };
}
export async function downloadMaterial(path: string) {
  const [bytes] = await privateFile(path).download();
  if (bytes.length > MAX_MATERIAL_BYTES)
    throw new BusinessError("Material exceeds the allowed size.");
  return bytes;
}
export async function removeUnlinkedMaterial(path: string) {
  await privateFile(path).delete({ ignoreNotFound: true });
}
