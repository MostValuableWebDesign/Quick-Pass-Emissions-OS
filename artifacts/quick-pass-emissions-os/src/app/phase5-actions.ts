"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { fields } from "@/lib/validation";
import { BusinessError } from "@/modules/phase2";
import * as automation from "@/modules/automation/service";
import {
  acknowledgePersonalReminder,
  changePersonalReminderState,
  createPersonalReminder,
  updatePersonalReminder,
} from "@/modules/automation/personal-reminders";
import type { ActionState } from "./actions";
async function perform(
  work: (actorId: string) => Promise<unknown>,
  paths: string[],
): Promise<ActionState> {
  const actor = await currentUser();
  try {
    await work(actor.id);
    for (const p of paths) revalidatePath(p);
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
const flag = (form: FormData, name: string) => form.get(name) === "true";
export async function saveScheduleAction(_: ActionState, form: FormData) {
  return perform(
    (a) =>
      automation.saveSchedule(a, {
        ...fields(form),
        openDaysOnly: flag(form, "openDaysOnly"),
        active: flag(form, "active"),
      }),
    ["/automation", "/overview", "/summaries"],
  );
}
export async function savePolicyAction(_: ActionState, form: FormData) {
  return perform(
    (a) =>
      automation.saveReminderPolicy(a, {
        ...fields(form),
        active: flag(form, "active"),
        recipients: form.getAll("recipients").map(String),
        escalationRecipients: form.getAll("escalationRecipients").map(String),
      }),
    ["/automation", "/reminders", "/overview"],
  );
}
export async function saveForecastAction(_: ActionState, form: FormData) {
  return perform(
    (a) => automation.saveForecastPolicy(a, fields(form)),
    ["/automation", "/overview"],
  );
}
export async function retryJobAction(_: ActionState, form: FormData) {
  return perform(
    (a) => automation.retryAutomationJob(a, fields(form)),
    ["/automation", "/summaries"],
  );
}
export async function acknowledgeReminderAction(_: ActionState, form: FormData) {
  return perform(
    (a) => automation.acknowledgeReminder(a, fields(form)),
    ["/reminders", "/notifications", "/dashboard"],
  );
}
export async function createPersonalReminderAction(_: ActionState, form: FormData) {
  return perform((a) => createPersonalReminder(a, fields(form)), ["/reminders", "/notifications"]);
}
export async function updatePersonalReminderAction(_: ActionState, form: FormData) {
  return perform((a) => updatePersonalReminder(a, fields(form)), ["/reminders", "/notifications"]);
}
export async function completePersonalReminderAction(_: ActionState, form: FormData) {
  return perform((a) => changePersonalReminderState(a, fields(form), "complete"), ["/reminders", "/notifications"]);
}
export async function cancelPersonalReminderAction(_: ActionState, form: FormData) {
  return perform((a) => changePersonalReminderState(a, fields(form), "cancel"), ["/reminders", "/notifications"]);
}
export async function acknowledgePersonalReminderAction(_: ActionState, form: FormData) {
  return perform((a) => acknowledgePersonalReminder(a, fields(form)), ["/reminders", "/notifications"]);
}
