"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { fields } from "@/lib/validation";
import { BusinessError } from "@/modules/phase3";
import * as maintenance from "@/modules/maintenance/service";
import * as chemicals from "@/modules/chemicals/service";
import * as rentals from "@/modules/rentals/service";
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
export async function configureBays(_: ActionState, form: FormData) {
  return perform((actor) =>
    maintenance.configureBays(actor, {
      identifiers: [1, 2, 3, 4, 5, 6].map((n) => form.get(`bay${n}`)),
      reason: form.get("reason"),
    }),
  );
}
export async function updateBay(_: ActionState, form: FormData) {
  return perform((actor) => maintenance.updateBay(actor, fields(form)));
}
export async function saveVendor(_: ActionState, form: FormData) {
  return perform((actor) =>
    maintenance.saveVendor(actor, { ...fields(form), active: form.get("active") === "true" }),
  );
}
export async function addUnverifiedVendor(_: ActionState, form: FormData) {
  return perform((actor) => maintenance.addUnverifiedVendor(actor, fields(form)));
}
export async function saveEquipment(_: ActionState, form: FormData) {
  return perform((actor) =>
    maintenance.saveEquipment(actor, { ...fields(form), active: form.get("active") === "true" }),
  );
}
export async function equipmentDowntime(_: ActionState, form: FormData) {
  return perform((actor) => maintenance.equipmentDowntime(actor, fields(form)));
}
export async function createTicket(_: ActionState, form: FormData) {
  return perform((actor) => maintenance.createTicket(actor, fields(form)));
}
export async function updateTicket(_: ActionState, form: FormData) {
  return perform((actor) => maintenance.updateTicket(actor, fields(form)));
}
export async function assignTicket(_: ActionState, form: FormData) {
  return perform((actor) => maintenance.assignTicket(actor, fields(form)));
}
export async function savePlan(_: ActionState, form: FormData) {
  return perform((actor) =>
    maintenance.savePlan(actor, { ...fields(form), active: form.get("active") === "true" }),
  );
}
export async function saveChemical(_: ActionState, form: FormData) {
  return perform((actor) =>
    chemicals.saveChemical(actor, { ...fields(form), active: form.get("active") === "true" }),
  );
}
export async function moveChemical(_: ActionState, form: FormData) {
  return perform((actor) => chemicals.moveChemical(actor, fields(form)));
}
export async function createAgreement(_: ActionState, form: FormData) {
  return perform((actor) => rentals.createAgreement(actor, fields(form)));
}
export async function endAgreement(_: ActionState, form: FormData) {
  return perform((actor) => rentals.endAgreement(actor, fields(form)));
}
export async function createCharge(_: ActionState, form: FormData) {
  return perform((actor) => rentals.createCharge(actor, fields(form)));
}
export async function recordPayment(_: ActionState, form: FormData) {
  return perform((actor) => rentals.recordPayment(actor, fields(form)));
}
export async function reversePayment(_: ActionState, form: FormData) {
  return perform((actor) => rentals.reversePayment(actor, fields(form)));
}
export async function voidCharge(_: ActionState, form: FormData) {
  return perform((actor) => rentals.voidCharge(actor, fields(form)));
}
