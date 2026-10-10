"use server";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/access";
import { BusinessError } from "@/modules/phase2";
import { StorageError } from "@/lib/storage";
import {
  applyImport,
  previewImport,
  sealPreview,
  openPreview,
  type Preview,
} from "@/modules/business-import/service";
import { importBackup } from "@/modules/business-import/backup";
export type ImportState = { preview?: Preview; token?: string; message?: string; ok?: boolean };
export async function reviewBusinessImport(_: ImportState, form: FormData): Promise<ImportState> {
  const actor = await currentUser();
  try {
    const raw = String(form.get("manifest") ?? "");
    if (raw.length > 150000) return { message: "Manifest exceeds the review limit." };
    const preview = await previewImport(actor.id, JSON.parse(raw));
    return {
      preview,
      token: sealPreview(preview),
      ok: true,
      message: "Dry run only. No business data was written.",
    };
  } catch (error) {
    return {
      message:
        error instanceof BusinessError
          ? error.message
          : "Unable to preview. Check the structured manifest and owner permissions.",
    };
  }
}
export async function applyBusinessImport(_: ImportState, form: FormData): Promise<ImportState> {
  const actor = await currentUser();
  try {
    if (form.get("confirm") !== "yes")
      return { message: "Review the proposed changes and confirm before applying." };
    const preview = openPreview(String(form.get("token") ?? ""));
    const result = await applyImport(actor.id, preview, () => importBackup());
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `Import committed: ${result.counts.created} created, ${result.counts.updated} updated, ${result.counts.unchanged} unchanged, ${result.counts.conflicted} conflicted, ${result.counts.skipped} staged for review. Reload to inspect the saved manifest.`,
    };
  } catch (error) {
    return {
      message:
        error instanceof BusinessError || error instanceof StorageError
          ? error.message
          : "Import failed; its business transaction was rolled back. Run a fresh preview and retry. Backup files may have been retained privately.",
    };
  }
}
