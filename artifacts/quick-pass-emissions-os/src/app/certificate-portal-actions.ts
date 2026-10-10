"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { BusinessError } from "@/modules/phase2";
import { refreshCertificateBalance, readCertificatePortalStatus, saveCertificateAlertThreshold } from "@/modules/certificates/portal";
import type { ActionState } from "./actions";

export async function refreshCertificateBalanceAction(force = false) {
  const actor = await currentUser();
  try {
    const data = await refreshCertificateBalance(actor.id, z.boolean().parse(force));
    return { ok: !data.error, ...(data.error ? { message: data.error } : {}), data };
  } catch {
    const data = await readCertificatePortalStatus();
    return { ok: false, message: "Unable to check certificate balance. Saved data is unchanged.", data };
  }
}
export async function saveCertificateAlertThresholdAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await currentUser();
  try {
    await saveCertificateAlertThreshold(actor.id, form.get("threshold"));
    revalidatePath("/", "layout");
    return { ok: true, message: "Certificate alert threshold saved." };
  } catch (error) {
    return { ok: false, message: error instanceof BusinessError ? error.message :
      error instanceof z.ZodError ? "Enter a whole-number threshold from 0 to 1,000,000." : "Could not save the certificate alert threshold." };
  }
}
