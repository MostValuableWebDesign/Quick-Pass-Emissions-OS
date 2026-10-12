"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { fields } from "@/lib/validation";
import { BusinessError } from "@/modules/phase4";
import * as service from "@/modules/marketing/service";
import { decimalHundredths } from "@/modules/marketing/rules";
import {
  MAX_MATERIAL_BYTES,
  uploadMaterial,
  removeUnlinkedMaterial,
} from "@/modules/marketing/material-storage";
import type { ActionState } from "./actions";

async function perform(work: (actorId: string) => Promise<unknown>): Promise<ActionState> {
  const actor = await currentUser();
  try {
    await work(actor.id);
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved successfully." };
  } catch (error) {
    if (error instanceof BusinessError) return { ok: false, message: error.message };
    if (error instanceof z.ZodError)
      return { ok: false, message: error.issues[0]?.message ?? "Check your entries." };
    return { ok: false, message: "Unable to save. Refresh and check your entries or connection." };
  }
}
export async function saveCampaign(_: ActionState, form: FormData) {
  return perform((actor) =>
    service.saveCampaign(actor, {
      ...fields(form),
      stationHashes: form.getAll("stationHashes"),
      budgetCents: decimalHundredths(form.get("budget")),
    }),
  );
}
export async function archiveCampaign(_: ActionState, form: FormData) {
  return perform((actor) => service.archiveCampaign(actor, fields(form)));
}
export async function recordExpense(_: ActionState, form: FormData) {
  return perform((actor) =>
    service.recordExpense(actor, {
      ...fields(form),
      amountCents: decimalHundredths(form.get("amount")),
    }),
  );
}
export async function voidExpense(_: ActionState, form: FormData) {
  return perform((actor) => service.voidExpense(actor, fields(form)));
}
export async function savePromo(_: ActionState, form: FormData) {
  return perform((actor) =>
    service.savePromo(actor, {
      ...fields(form),
      stationHashes: form.getAll("stationHashes"),
      value: decimalHundredths(form.get("offerValue")),
      active: form.get("active") === "true",
    }),
  );
}
export async function recordSource(_: ActionState, form: FormData) {
  return perform((actor) => service.recordSource(actor, fields(form)));
}
export async function recordServiceSource(_: ActionState, form: FormData) {
  return perform((actor) => service.recordServiceSource(actor, fields(form)));
}
export async function saveAction(_: ActionState, form: FormData) {
  return perform((actor) => service.saveAction(actor, fields(form)));
}
export async function reviewMaterial(_: ActionState, form: FormData) {
  return perform((actor) => service.reviewMaterial(actor, fields(form)));
}
export async function saveMaterial(_: ActionState, form: FormData) {
  return perform(async (actor) => {
    await service.marketingTransaction(actor, true, async () => undefined);
    let upload: service.UploadedMaterial | undefined;
    const file = form.get("file");
    if (file && typeof file !== "string" && file.size) {
      if (file.size > MAX_MATERIAL_BYTES) throw new BusinessError("Choose a file of at most 2 MB.");
      upload = await uploadMaterial(Buffer.from(await file.arrayBuffer()), file.type, file.name);
    }
    try {
      return await service.saveMaterial(actor, fields(form), upload);
    } catch (error) {
      if (upload) await removeUnlinkedMaterial(upload.objectPath).catch(() => undefined);
      throw error;
    }
  });
}
