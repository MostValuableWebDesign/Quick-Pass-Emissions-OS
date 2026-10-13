"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { fields } from "@/lib/validation";
import { BusinessError } from "@/modules/phase2";
import { dollarsInput } from "@/modules/payroll/form-input";
import * as payroll from "@/modules/payroll/service";
import * as certificates from "@/modules/certificates/service";
import type { ActionState } from "./actions";
async function perform(work: (actorId: string) => Promise<unknown>): Promise<ActionState> {
  // Keep redirects outside the domain-error handler.
  const actor = await currentUser();
  try {
    await work(actor.id);
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved successfully." };
  } catch (error) {
    if (error instanceof BusinessError) return { ok: false, message: error.message };
    if (error instanceof z.ZodError)
      return { ok: false, message: error.issues[0]?.message ?? "Check your entries." };
    return {
      ok: false,
      message: "Unable to save. Check your entries and connection, then refresh and try again.",
    };
  }
}
export async function savePayArrangement(_: ActionState, form: FormData) {
  return perform((actor) => payroll.saveArrangement(actor, fields(form)));
}
export async function saveCommissionPolicy(_: ActionState, form: FormData) {
  return perform((actor) =>
    payroll.savePolicy(actor, { ...fields(form), eligible: form.get("eligible") === "true" }),
  );
}
export async function adjustCompensation(_: ActionState, form: FormData) {
  return perform((actor) => payroll.adjustCompensation(actor, fields(form)));
}
export async function savePayrollBaseDollars(_: ActionState, form: FormData) {
  return perform((actor) =>
    payroll.saveArrangement(actor, {
      ...fields(form),
      amountCents: dollarsInput.parse(form.get("amountDollars")),
    }),
  );
}
export async function savePayrollCommissionDollars(_: ActionState, form: FormData) {
  return perform((actor) =>
    payroll.savePolicy(actor, {
      ...fields(form),
      eligible: z.enum(["true", "false"]).parse(form.get("eligible")) === "true",
      rateCents: dollarsInput.parse(form.get("rateDollars")),
      volumeIncreaseCents:
        form.get("volumeIncreaseDollars") === ""
          ? null
          : dollarsInput.parse(form.get("volumeIncreaseDollars")),
    }),
  );
}
export async function saveEmission(_: ActionState, form: FormData) {
  return perform((actor) => payroll.importEmissions(actor, [fields(form)]));
}
export async function importEmissionRows(_: ActionState, form: FormData) {
  return perform(async (actor) => {
    const text = z.string().max(500000).parse(form.get("rows"));
    let rows: unknown;
    try {
      rows = JSON.parse(text);
    } catch {
      throw new BusinessError("Please paste a valid JSON array of employee test counts.");
    }
    const result = await payroll.importEmissions(actor, rows);
    // Counts are auditable in the ledger; duplicate retries make no new records.
    return result;
  });
}
export async function correctEmission(_: ActionState, form: FormData) {
  return perform((actor) => payroll.correctEmissions(actor, fields(form)));
}
export async function approveEmission(_: ActionState, form: FormData) {
  return perform((actor) => payroll.approveEmissions(actor, fields(form)));
}
export async function createPayrollPeriod(_: ActionState, form: FormData) {
  return perform((actor) => payroll.createPeriod(actor, fields(form)));
}
export async function cancelPayrollPeriod(_: ActionState, form: FormData) {
  return perform((actor) => payroll.cancelPeriod(actor, fields(form)));
}
export async function savePayInput(_: ActionState, form: FormData) {
  return perform((actor) =>
    payroll.savePayrollInput(actor, {
      ...fields(form),
      emissionsComplete: form.get("emissionsComplete") === "true",
    }),
  );
}
export async function approvePayInput(_: ActionState, form: FormData) {
  return perform((actor) => payroll.approvePayrollInput(actor, fields(form)));
}
export async function generatePayrollDraft(_: ActionState, form: FormData) {
  return perform((actor) => payroll.generateDraft(actor, String(form.get("periodId") ?? "")));
}
export async function reviewPayrollDraft(_: ActionState, form: FormData) {
  return perform((actor) => payroll.reviewDraft(actor, fields(form)));
}
export async function saveInventorySettings(_: ActionState, form: FormData) {
  return perform((actor) => certificates.saveCertificateSettings(actor, fields(form)));
}
export async function reconcileInventory(_: ActionState, form: FormData) {
  return perform((actor) => certificates.reconcileStock(actor, fields(form)));
}
export async function consumeCertificates(_: ActionState, form: FormData) {
  return perform((actor) => certificates.recordUsage(actor, fields(form)));
}
export async function createPurchaseRequest(_: ActionState, form: FormData) {
  return perform((actor) => certificates.requestPurchase(actor, fields(form)));
}
export async function draftRecommendedPurchase() {
  return perform((actor) => certificates.recommendPurchase(actor));
}
export async function reviewPurchaseRequest(_: ActionState, form: FormData) {
  return perform((actor) => certificates.reviewPurchase(actor, fields(form)));
}
export async function recordCertificateOrder(_: ActionState, form: FormData) {
  return perform((actor) => certificates.recordOrder(actor, fields(form)));
}
export async function receiveCertificatePurchase(_: ActionState, form: FormData) {
  return perform((actor) => certificates.receivePurchase(actor, fields(form)));
}
