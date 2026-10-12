"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { fields } from "@/lib/validation";
import { BusinessError } from "@/modules/phase4";
import * as finance from "@/modules/finance/service";
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
    return {
      ok: false,
      message: "Unable to save. Check your entries and connection, then refresh and try again.",
    };
  }
}
export async function saveDealer(_: ActionState, form: FormData) {
  return perform((actor) =>
    finance.saveDealer(actor, {
      ...fields(form),
      ...(form.has("active") ? { active: form.get("active") === "true" } : {}),
    }),
  );
}
export async function saveContact(_: ActionState, form: FormData) {
  return perform((actor) =>
    finance.saveContact(actor, {
      ...fields(form),
      ...(form.has("active") ? { active: form.get("active") === "true" } : {}),
    }),
  );
}
export async function authorizeTerms(_: ActionState, form: FormData) {
  return perform((actor) => finance.authorizeTerms(actor, fields(form)));
}
export async function recordService(_: ActionState, form: FormData) {
  return perform((actor) => finance.recordService(actor, fields(form)));
}
export async function voidService(_: ActionState, form: FormData) {
  return perform((actor) => finance.voidService(actor, fields(form)));
}
export async function reviewInvoice(_: ActionState, form: FormData) {
  return perform((actor) => finance.reviewInvoice(actor, fields(form)));
}
export async function recordDealerPayment(_: ActionState, form: FormData) {
  return perform((actor) => finance.recordDealerPayment(actor, fields(form)));
}
export async function reverseDealerPayment(_: ActionState, form: FormData) {
  return perform((actor) => finance.reverseDealerPayment(actor, fields(form)));
}
export async function recordEntry(_: ActionState, form: FormData) {
  return perform((actor) =>
    finance.recordEntry(actor, {
      ...fields(form),
      separateRecord: form.get("separateRecord") === "true",
    }),
  );
}
export async function reviewEntry(_: ActionState, form: FormData) {
  return perform((actor) => finance.reviewEntry(actor, fields(form)));
}
export async function createInvoice(_: ActionState, form: FormData) {
  return perform((actor) =>
    finance.createInvoice(actor, { ...fields(form), serviceIds: form.getAll("serviceIds") }),
  );
}
