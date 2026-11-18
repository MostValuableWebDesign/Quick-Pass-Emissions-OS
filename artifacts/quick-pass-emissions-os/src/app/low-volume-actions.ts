"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/require-role";
import type { ActionState } from "./actions";
import { saveLowVolumeSettings } from "@/modules/automation/low-volume";

export async function saveLowVolumeAlert(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireRole(["OWNER"]);
  try {
    await saveLowVolumeSettings(actor.id, {
      active: form.get("active") === "on",
      email: String(form.get("email") ?? "").trim(),
    });
    revalidatePath("/automation/reminders");
    return { ok: true, message: "Staffing alert settings saved." };
  } catch {
    return { ok: false, message: "Could not save. Enter a valid email address and try again." };
  }
}
