"use server";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/access";
import { BusinessError } from "@/modules/phase2";
import { readPaydayAlert, acknowledgePayday } from "@/modules/payroll/payday";
export async function readPaydayAlertAction() {
  const actor = await currentUser();
  return readPaydayAlert(actor.id);
}
export async function acknowledgePaydayAction(
  _: { ok: boolean; message: string; date?: string },
  form: FormData,
) {
  const actor = await currentUser();
  try {
    const result = await acknowledgePayday(actor.id, { date: form.get("date") });
    revalidatePath("/", "layout");
    return { ok: true, message: "Acknowledged for today.", date: result.date };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof BusinessError
          ? error.message
          : "Could not acknowledge this reminder. Refresh and try again.",
    };
  }
}
