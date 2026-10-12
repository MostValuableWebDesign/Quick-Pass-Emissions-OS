"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { manager } from "@/lib/access";
import { BusinessError } from "@/modules/phase2";
import {
  registerDoor,
  prepareCode,
  submitCode,
  revokeCode,
  refreshDoor,
} from "@/modules/security/service";
import type { ActionState } from "./actions";
async function perform(work: (id: string) => Promise<unknown>): Promise<ActionState> {
  const actor = await manager();
  try {
    await work(actor.id);
    revalidatePath("/security/doors");
    return {
      ok: true,
      message: "Request saved. Review the status below for provider confirmation.",
    };
  } catch (error) {
    revalidatePath("/security/doors");
    return {
      ok: false,
      message:
        error instanceof BusinessError
          ? error.message
          : error instanceof z.ZodError
            ? "Check the required fields, numeric code and dates."
            : "Unable to complete the request. Refresh status before trying again.",
    };
  }
}
export async function registerDoorAction(_: ActionState, form: FormData) {
  return perform((id) =>
    registerDoor(id, { name: form.get("name"), deviceId: form.get("deviceId") }),
  );
}
export async function issueDoorCodeAction(_: ActionState, form: FormData) {
  return perform(async (id) => {
    const pin = z
      .string()
      .regex(/^\d{4,12}$/)
      .parse(form.get("pin"));
    const request = await prepareCode(id, {
      doorId: form.get("doorId"),
      label: form.get("label"),
      employeeId: String(form.get("employeeId") || ""),
      pin,
      startsAt: String(form.get("startsAt") || ""),
      endsAt: String(form.get("endsAt") || ""),
      replacesId: String(form.get("replacesId") || ""),
      version: form.get("version") || 0,
    });
    await submitCode(id, request.id, request.token, pin);
  });
}
export async function revokeDoorCodeAction(_: ActionState, form: FormData) {
  return perform(async (actor) => {
    const v = z
      .object({
        id: z.string().min(1).max(200),
        version: z.coerce.number().int().positive(),
        confirm: z.literal("revoke"),
      })
      .parse(Object.fromEntries(form));
    const door = await revokeCode(actor, v.id, v.version);
    await refreshDoor(actor, door);
  });
}
export async function refreshDoorAction(_: ActionState, form: FormData) {
  return perform((actor) => refreshDoor(actor, z.string().min(1).max(200).parse(form.get("id"))));
}
