"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { fields } from "@/lib/validation";
import { BusinessError, requireRule } from "@/modules/phase2";
import * as station from "@/modules/station/service";
import type { ActionState } from "./actions";
import { retrievePortalCount, type SavedPortalTotal } from "@/modules/station/portal-service";

type PortalCountState = ActionState & { result?: SavedPortalTotal };

export async function getPortalDailyCountAction(
  _: PortalCountState,
  form: FormData,
): Promise<PortalCountState> {
  const actor = await currentUser();
  try {
    const result = await retrievePortalCount(actor.id, form.get("date"));
    revalidatePath("/performance");
    return { ok: true, message: `Retrieved ${result.total} test rows for ${result.date}.`, result };
  } catch (error) {
    if (error instanceof BusinessError) return { ok: false, message: error.message };
    if (error instanceof z.ZodError) return { ok: false, message: "Choose a valid business date." };
    return { ok: false, message: "Unable to retrieve the portal report. No count was changed." };
  }
}

async function perform(work: (actorId: string) => Promise<unknown>): Promise<ActionState> {
  const actor = await currentUser();
  try {
    const result = await work(actor.id);
    revalidatePath("/performance", "layout");
    revalidatePath("/payroll");
    revalidatePath("/", "layout");
    if (result && typeof result === "object" && "inserted" in result && "duplicates" in result)
      return {
        ok: true,
        message: `Imported ${result.inserted} new review rows; skipped ${result.duplicates} exact repeats. Coverage remains partial until reviewed.`,
      };
    return {
      ok: true,
      message:
        "Saved. Payroll counts still require independent approval; no payroll snapshot was changed.",
    };
  } catch (e) {
    if (e instanceof BusinessError) return { ok: false, message: e.message };
    if (e instanceof z.ZodError)
      return {
        ok: false,
        message: "Check required fields, valid dates and integer cents. No changes were committed.",
      };
    return {
      ok: false,
      message:
        "Unable to save. Check conflicting effective dates or current versions, then refresh and retry.",
    };
  }
}
export async function importStationAction(_: ActionState, form: FormData) {
  return perform(async (a) => {
    // Recheck authorization before decoding private source bytes.
    await station.stationTransaction(a, async () => undefined);
    const file = form.get("report");
    requireRule(
      file !== null &&
        typeof file !== "string" &&
        typeof file.text === "function" &&
        Number.isSafeInteger(file.size) &&
        file.size > 0 &&
        file.size <= 2_000_000,
      "Choose an original portal .xls report of at most 2 MB.",
    );
    return station.importReport(a, {
      body: await file.text(),
      reason: String(form.get("reason") ?? ""),
    });
  });
}
export async function attestStationAction(_: ActionState, form: FormData) {
  return perform((a) => station.attestCoverage(a, fields(form)));
}
export async function mappingStationAction(_: ActionState, form: FormData) {
  return perform((a) => station.saveMapping(a, fields(form)));
}
export async function ruleStationAction(_: ActionState, form: FormData) {
  return perform((a) =>
    station.saveRule(a, { ...fields(form), eligible: form.get("eligible") === "true" }),
  );
}
export async function settingsStationAction(_: ActionState, form: FormData) {
  return perform((a) => {
    const hours = [];
    for (let weekday = 1; weekday <= 7; weekday++) {
      if (form.get(`openDay${weekday}`) === "true")
        hours.push({
          weekday,
          open: String(form.get(`open${weekday}`) ?? ""),
          close: String(form.get(`close${weekday}`) ?? ""),
        });
    }
    return station.saveSettings(a, {
      ...fields(form),
      hours,
      sourceTimezoneConfirmed: form.get("sourceTimezoneConfirmed") === "true",
    });
  });
}
export async function reviewStationAction(_: ActionState, form: FormData) {
  return perform((a) =>
    station.reviewRecord(a, { ...fields(form), reattribute: form.get("reattribute") === "true" }),
  );
}
export async function correctionStationAction(_: ActionState, form: FormData) {
  return perform((a) => station.mergeCorrection(a, fields(form)));
}
export async function reconcileStationAction(_: ActionState, form: FormData) {
  return perform((a) => station.reconcileCount(a, fields(form)));
}
