"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { BusinessError, requireRule } from "@/modules/phase4";
import {
  beginDealerVirUpload,
  finishDealerVirUpload,
  failDealerVirUpload,
  commitDealerVirUpload,
} from "@/modules/finance/dealer-vir-service";
import type {
  DealerVirCommitInput,
  DealerVirPreview,
  DealerVirResult,
  DealerVirResponse,
} from "@/modules/finance/dealer-vir-types";

const message = (error: unknown) =>
  error instanceof BusinessError
    ? error.message
    : error instanceof z.ZodError
      ? "Check the dates and report fields before saving."
      : "Unable to process these reports. Try fewer pages or clearer scans. No invoice was created.";

export async function previewDealerVirs(
  form: FormData,
): Promise<DealerVirResponse<DealerVirPreview>> {
  const actor = await currentUser();
  let uploadId: string | undefined;
  let stage = "VALIDATE";
  try {
    const dealershipId = z.string().min(1).max(64).parse(form.get("dealershipId"));
    const files = form.getAll("reports");
    requireRule(files.length > 0 && files.length <= 10, "Choose between 1 and 10 PDF files.");
    requireRule(
      files.every(
        (file): file is File =>
          typeof file !== "string" &&
          file.size > 0 &&
          file.size <= 15_000_000 &&
          /\.pdf$/i.test(file.name) &&
          (!file.type ||
            file.type === "application/pdf" ||
            file.type === "application/octet-stream"),
      ),
      "Choose PDF files no larger than 15 MB.",
    );
    const pdfs = files as File[];
    requireRule(
      pdfs.reduce((sum, file) => sum + file.size, 0) <= 15_000_000,
      "Combined PDF size must be at most 15 MB.",
    );
    uploadId = await beginDealerVirUpload(actor.id, dealershipId);
    stage = "EXTRACTOR_LOAD";
    const { extractDealerVirs } = await import("@/modules/finance/dealer-vir-extract");
    stage = "EXTRACT";
    const rows = await extractDealerVirs(pdfs);
    stage = "PREVIEW_SAVE";
    const data = await finishDealerVirUpload(actor.id, uploadId, rows);
    return { ok: true, data };
  } catch (error) {
    if (!(error instanceof BusinessError) && !(error instanceof z.ZodError)) {
      // Fixed diagnostic metadata only: never log reports, OCR text, filenames or exception messages.
      console.error("DEALER_VIR_PREVIEW_FAILED", {
        stage,
        errorType:
          error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : "Unknown",
      });
    }
    if (uploadId) {
      try {
        await failDealerVirUpload(actor.id, uploadId);
      } catch {
        /* Preserve the processing error, never source bytes. */
      }
    }
    return { ok: false, message: message(error) };
  }
}

export async function commitDealerVirs(
  input: DealerVirCommitInput,
): Promise<DealerVirResponse<DealerVirResult>> {
  const actor = await currentUser();
  try {
    const data = await commitDealerVirUpload(actor.id, input);
    revalidatePath("/dealerships", "layout");
    revalidatePath("/invoices", "layout");
    return { ok: true, data };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}
