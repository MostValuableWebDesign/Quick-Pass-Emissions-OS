"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { fields } from "@/lib/validation";
import { BusinessError } from "@/modules/phase3";
import * as support from "@/modules/support/service";
import type { ActionState } from "./actions";
function input(form: FormData) {
  return Object.fromEntries(
    Object.entries(fields(form)).filter(([key]) => !key.startsWith("$ACTION_")),
  );
}
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
    return { ok: false, message: "Unable to save. Refresh and check your entries." };
  }
}
export async function saveDirectory(_: ActionState, form: FormData) {
  return perform((actor) =>
    support.saveDirectory(actor, {
      ...input(form),
      categories: form.getAll("categories"),
      lastConfirmedDate: form.get("lastConfirmedDate") || null,
    }),
  );
}
export async function setPreference(_: ActionState, form: FormData) {
  return perform((actor) => support.setPreference(actor, input(form)));
}
export async function associateSupport(_: ActionState, form: FormData) {
  return perform((actor) =>
    support.associateSupport(actor, {
      ...input(form),
      remove: form.get("remove") === "true",
    }),
  );
}
export async function selectTicketProvider(_: ActionState, form: FormData) {
  return perform((actor) => support.selectTicketProvider(actor, input(form)));
}
export async function logContact(_: ActionState, form: FormData) {
  return perform((actor) =>
    support.logContact(actor, {
      ...input(form),
      followUpDate: form.get("followUpDate") || null,
    }),
  );
}
export async function setProviderStatus(_: ActionState, form: FormData) {
  return perform((actor) =>
    support.setProviderStatus(actor, {
      ...input(form),
      active: form.get("active") === "true",
    }),
  );
}
