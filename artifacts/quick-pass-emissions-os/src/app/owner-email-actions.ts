"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { BusinessError } from "@/modules/phase2";
import { saveOwnerEmail, retryOwnerEmail } from "@/modules/automation/owner-email";
import type { ActionState } from "./actions";
async function perform(work: (id: string) => Promise<unknown>): Promise<ActionState> {
  const actor = await currentUser();
  try {
    await work(actor.id);
    revalidatePath("/automation/daily-email");
    return { ok: true, message: "Saved successfully." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof BusinessError
          ? error.message
          : error instanceof z.ZodError
            ? "Check your selected recipients and settings."
            : "Unable to save. Refresh and try again.",
    };
  }
}
export async function saveOwnerEmailAction(_: ActionState, form: FormData) {
  return perform((id) =>
    saveOwnerEmail(id, {
      revision: form.get("revision"),
      active: form.get("active") === "true",
      recipients: form.getAll("recipients").map(String),
    }),
  );
}
export async function retryOwnerEmailAction(_: ActionState, form: FormData) {
  const id = z.string().min(1).max(200).parse(form.get("id"));
  return perform((actor) => retryOwnerEmail(actor, id));
}
