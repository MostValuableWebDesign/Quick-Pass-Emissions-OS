"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { BusinessError, requireRule } from "@/modules/phase4";
import {
  beginDealerVirUpload,
  recordDealerVirChunk,
  finishDealerVirUpload,
  failDealerVirUpload,
  commitDealerVirUpload,
} from "@/modules/finance/dealer-vir-service";
import type {
  DealerVirCommitInput,
  DealerVirProgress,
  DealerVirPreview,
  DealerVirResult,
  DealerVirResponse,
  DealerVirStart,
} from "@/modules/finance/dealer-vir-types";

const message = (error: unknown) =>
  error instanceof BusinessError
    ? error.message
    : error instanceof z.ZodError
      ? "Check the dates and report fields before saving."
      : "Unable to process these reports. Try fewer pages or clearer scans. No invoice was created.";

export async function startDealerVirs(form: FormData): Promise<DealerVirResponse<DealerVirStart>> {
  const actor = await currentUser();
  try {
    const dealershipId = z.string().min(1).max(64).parse(form.get("dealershipId"));
    const fileCount = z.coerce.number().int().min(1).max(100).parse(form.get("fileCount"));
    const expectedPages = z.coerce.number().int().min(1).max(1000).parse(form.get("expectedPages"));
    const uploadId = await beginDealerVirUpload(actor.id, dealershipId, fileCount, expectedPages);
    return { ok: true, data: { uploadId, fileCount, expectedPages } };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}

export async function processDealerVirChunk(
  form: FormData,
): Promise<DealerVirResponse<DealerVirProgress>> {
  const actor = await currentUser();
  let uploadId: string | undefined;
  let stage = "VALIDATE_CHUNK";
  try {
    uploadId = z.string().min(1).max(64).parse(form.get("uploadId"));
    const chunkKey = z.string().uuid().parse(form.get("chunkKey"));
    const sourceLabels = z
      .string()
      .max(8000)
      .transform((value) => JSON.parse(value) as unknown)
      .pipe(
        z
          .array(
            z
              .string()
              .regex(/^PDF \d+ · Page \d+$/)
              .max(40),
          )
          .min(1)
          .max(40),
      )
      .parse(form.get("sourceLabels"));
    const files = form.getAll("reports");
    requireRule(files.length === 1, "Send one processed PDF batch at a time.");
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
      "Choose a processed PDF batch no larger than 15 MB.",
    );
    const pdfs = files as File[];
    stage = "EXTRACTOR_LOAD";
    const { extractDealerVirs } = await import("@/modules/finance/dealer-vir-extract");
    stage = "EXTRACT";
    const rows = await extractDealerVirs(pdfs, sourceLabels);
    stage = "SAVE_CHUNK";
    const data = await recordDealerVirChunk(actor.id, uploadId, chunkKey, rows);
    return { ok: true, data };
  } catch (error) {
    if (!(error instanceof BusinessError) && !(error instanceof z.ZodError)) {
      // Fixed diagnostic metadata only: never log reports, OCR text, filenames or exception messages.
      console.error("DEALER_VIR_CHUNK_FAILED", {
        stage,
        errorType:
          error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : "Unknown",
      });
    }
    if (uploadId) {
      try {
        await failDealerVirUpload(actor.id, uploadId);
      } catch {
        /* Keep only safe, fixed failure metadata. */
      }
    }
    return { ok: false, message: message(error) };
  }
}

export async function finishDealerVirs(
  uploadId: string,
): Promise<DealerVirResponse<DealerVirPreview>> {
  const actor = await currentUser();
  try {
    return {
      ok: true,
      data: await finishDealerVirUpload(actor.id, z.string().min(1).max(64).parse(uploadId)),
    };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}

export async function failDealerVirs(uploadId: string) {
  const actor = await currentUser();
  try {
    await failDealerVirUpload(actor.id, z.string().min(1).max(64).parse(uploadId));
    return { ok: true as const };
  } catch {
    return { ok: false as const };
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
