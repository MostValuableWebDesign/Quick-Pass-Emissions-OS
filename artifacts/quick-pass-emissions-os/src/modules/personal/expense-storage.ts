import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  expenseAuthorize,
  expenseHistory,
  expenseLock,
  expenseWorkspace,
  ownedExpense,
} from "./expense-service";
import { MAX_RECEIPT_BYTES } from "./expense-types";

const MAX_BYTES = MAX_RECEIPT_BYTES;
const types = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
const prep = z.object({
  expenseId: z.string().min(1).max(160),
  filename: z.string().trim().min(1).max(200),
  mimeType: z.enum(types),
  byteSize: z.number().int().positive().max(MAX_BYTES),
});
const storage = new Storage({
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
function privateFile(path: string) {
  const root = process.env.PRIVATE_OBJECT_DIR?.replace(/\/+$/, "");
  if (!root || !path.startsWith(`${root}/personal-expenses/`))
    throw new Error("Private receipt storage is unavailable.");
  const parts = path.replace(/^\/+/, "").split("/");
  return storage.bucket(parts.shift()!).file(parts.join("/"));
}
export function validReceiptSignature(bytes: Buffer, mimeType: string) {
  if (mimeType === "application/pdf") return bytes.subarray(0, 5).toString() === "%PDF-";
  if (mimeType === "image/png")
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/jpeg")
    return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return (
    mimeType === "image/webp" &&
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  );
}
export async function prepareReceipt(userId: string, input: unknown) {
  const c = prep.parse(input);
  const extensions: Record<string, RegExp> = {
    "application/pdf": /\.pdf$/i,
    "image/png": /\.png$/i,
    "image/jpeg": /\.jpe?g$/i,
    "image/webp": /\.webp$/i,
  };
  if (!extensions[c.mimeType].test(c.filename))
    throw new Error("The filename must match its PDF or image type.");
  await expenseAuthorize(db, userId);
  await ownedExpense(db, userId, c.expenseId);
  const root = process.env.PRIVATE_OBJECT_DIR?.replace(/\/+$/, "");
  if (!root)
    throw new Error(
      "Private receipt storage is unavailable. Your expense can still be saved without a receipt.",
    );
  const attachmentId = randomUUID(),
    path = `${root}/personal-expenses/${userId}/${attachmentId}`;
  const file = privateFile(path);
  const response = await fetch("http://127.0.0.1:1106/object-storage/signed-object-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: file.bucket.name,
      object_name: file.name,
      method: "PUT",
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      "Receipt storage could not prepare an upload. Your expense has not been changed.",
    );
  const { signed_url: uploadURL } = (await response.json()) as { signed_url?: string };
  if (!uploadURL) throw new Error("Receipt storage did not return an upload address.");
  await db.$transaction(async (tx) => {
    await expenseLock(tx, userId);
    await ownedExpense(tx, userId, c.expenseId);
    const count = await tx.personalExpenseAttachment.count({
      where: {
        expenseId: c.expenseId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (count >= 100) throw new Error("Receipt upload limit reached for this expense today.");
    await tx.personalExpenseAttachment.create({
      data: {
        id: attachmentId,
        expenseId: c.expenseId,
        filename: c.filename.replace(/[^a-zA-Z0-9._ -]/g, "_"),
        mimeType: c.mimeType,
        byteSize: c.byteSize,
        objectPath: path,
      },
    });
  });
  return { attachmentId, uploadURL };
}
export async function completeReceipt(userId: string, id: string) {
  await expenseAuthorize(db, userId);
  const a = await db.personalExpenseAttachment.findFirst({ where: { id, expense: { userId } } });
  if (!a) throw new Error("Receipt unavailable.");
  if (!a.uploadedAt) {
    // Freeze the completed object at a separate key: an unexpired PUT URL must not be
    // able to overwrite a receipt after validation and make its content untrusted.
    const pending = privateFile(a.objectPath);
    const finalPath = `${a.objectPath}-saved-${randomUUID()}`,
      finalFile = privateFile(finalPath);
    const [pendingMetadata] = await pending.getMetadata();
    if (Number(pendingMetadata.size) !== a.byteSize || pendingMetadata.contentType !== a.mimeType)
      throw new Error("Receipt size or type differs from the selected file.");
    await pending.copy(finalFile);
    let committed = false;
    try {
      const [metadata] = await finalFile.getMetadata();
      if (Number(metadata.size) !== a.byteSize || metadata.contentType !== a.mimeType)
        throw new Error("Receipt size or type differs from the selected file.");
      const [header] = await finalFile.download({ start: 0, end: 15 });
      if (!validReceiptSignature(header, a.mimeType))
        throw new Error("Receipt contents do not match the selected PDF or image type.");
      await db.$transaction(async (tx) => {
        await expenseLock(tx, userId);
        await ownedExpense(tx, userId, a.expenseId);
        const current = await tx.personalExpenseAttachment.findFirst({
          where: { id, expense: { userId } },
        });
        if (!current || current.uploadedAt) return;
        await tx.personalExpenseAttachment.update({
          where: { id },
          data: { objectPath: finalPath, uploadedAt: new Date() },
        });
        await expenseHistory(tx, a.expenseId, "Receipt attached", a.filename, {
          id,
          filename: a.filename,
          mimeType: a.mimeType,
          byteSize: a.byteSize,
        });
      });
      committed = true;
      const saved = await db.personalExpenseAttachment.findUnique({ where: { id } });
      committed = saved?.objectPath === finalPath;
      if (saved?.objectPath !== finalPath) await finalFile.delete({ ignoreNotFound: true });
      await pending.delete({ ignoreNotFound: true }).catch(() => undefined);
    } catch (error) {
      if (!committed) await finalFile.delete({ ignoreNotFound: true }).catch(() => undefined);
      throw error;
    }
  }
  return { data: await expenseWorkspace(userId) };
}
export async function downloadReceipt(userId: string, id: string) {
  await expenseAuthorize(db, userId);
  const a = await db.personalExpenseAttachment.findFirst({
    where: { id, uploadedAt: { not: null }, expense: { userId } },
  });
  if (!a) throw new Error("Receipt unavailable.");
  const file = privateFile(a.objectPath),
    [metadata] = await file.getMetadata();
  if (Number(metadata.size) > MAX_BYTES) throw new Error("Receipt exceeds the allowed size.");
  const [bytes] = await file.download();
  return { attachment: a, bytes };
}
/** Internal cleanup for abandoned/unlinked objects; callers must establish ownership first. */
export async function removePrivateReceiptObject(path: string) {
  await privateFile(path).delete({ ignoreNotFound: true });
}
