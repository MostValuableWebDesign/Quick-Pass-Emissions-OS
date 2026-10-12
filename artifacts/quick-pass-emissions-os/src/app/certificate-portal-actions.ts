"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { approvalRoles, BusinessError } from "@/modules/phase2";
import {
  readCertificateInsights,
  refreshCertificateInsights,
} from "@/modules/certificates/order-history";
import {
  refreshCertificateBalance,
  readCertificatePortalStatus,
  saveCertificateAlertThreshold,
} from "@/modules/certificates/portal";
import type { ActionState } from "./actions";

export async function refreshCertificateInsightsAction(force = false) {
  const actor = await currentUser();
  if (!approvalRoles.includes(actor.role))
    return { ok: false, message: "Not authorized to refresh certificate reports." };
  try {
    const data = await refreshCertificateInsights(actor.id, z.boolean().parse(force));
    revalidatePath("/certificates");
    revalidatePath("/", "layout");
    return { ok: !data.error && !data.portal.error, data };
  } catch {
    return {
      ok: false,
      message: "Unable to load the official certificate report. Saved history is unchanged.",
      data: await readCertificateInsights(),
    };
  }
}
export async function refreshCertificateBalanceAction(force = false) {
  const actor = await currentUser();
  try {
    const data = await refreshCertificateBalance(actor.id, z.boolean().parse(force));
    return {
      ok: !data.error,
      sourceStatus: data.sourceStatus,
      ...(data.error ? { message: data.error } : {}),
      data,
    };
  } catch {
    const data = await readCertificatePortalStatus();
    return {
      ok: false,
      sourceStatus: "failed",
      message: "Unable to check certificate balance. Saved data is unchanged.",
      data,
    };
  }
}
export async function saveCertificateAlertThresholdAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const actor = await currentUser();
  try {
    await saveCertificateAlertThreshold(actor.id, form.get("threshold"));
    revalidatePath("/", "layout");
    return { ok: true, message: "Certificate alert threshold saved." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof BusinessError
          ? error.message
          : error instanceof z.ZodError
            ? "Enter a whole-number threshold from 0 to 1,000,000."
            : "Could not save the certificate alert threshold.",
    };
  }
}
