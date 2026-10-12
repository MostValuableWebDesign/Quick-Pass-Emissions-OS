"use server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { manager } from "@/lib/access";
import { BusinessError } from "@/modules/phase2";
import {
  beginConnection,
  disconnectGoogle,
  discoverLocations,
  mapGoogleLocation,
  registerAnalyticsStation,
  grantAnalyticsStation,
} from "@/modules/analytics/connection";
import { requestGoogleSync } from "@/modules/analytics/sync";
import {
  recordAnalyticsAction,
  reviewAnalyticsAction,
  recordAttribution,
} from "@/modules/analytics/report";
import type { ActionState } from "./actions";
async function perform(work: (id: string) => Promise<unknown>): Promise<ActionState> {
  const actor = await manager();
  try {
    await work(actor.id);
    revalidatePath("/analytics");
    return { ok: true, message: "Saved successfully." };
  } catch (e) {
    revalidatePath("/analytics");
    return {
      ok: false,
      message:
        e instanceof BusinessError
          ? e.message
          : e instanceof z.ZodError
            ? "Check the required fields and date range."
            : "Unable to save. Refresh and check for a duplicate reference or changed setup.",
    };
  }
}
export async function connectGoogleAction(): Promise<void> {
  const actor = await manager();
  let url: string;
  try {
    const browser = randomBytes(32).toString("base64url");
    url = await beginConnection(actor.id, browser);
    (await cookies()).set("quickpass-google-state", browser, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/google-business",
      maxAge: 600,
    });
  } catch {
    redirect("/analytics?google=setup");
  }
  redirect(url);
}
export async function disconnectGoogleAction() {
  return perform(disconnectGoogle);
}
export async function discoverGoogleAction() {
  return perform(async (actor) => {
    const result = await discoverLocations(actor);
    if (!result.ok)
      throw new BusinessError(
        "Could not load Google locations. See connection status for the next step.",
      );
  });
}
export async function registerAnalyticsStationAction(_: ActionState, form: FormData) {
  return perform((actor) =>
    registerAnalyticsStation(actor, {
      name: form.get("name"),
      timezoneConfirmed: form.get("timezoneConfirmed") === "on",
    }),
  );
}
export async function grantAnalyticsStationAction(_: ActionState, form: FormData) {
  return perform((actor) =>
    grantAnalyticsStation(actor, {
      stationId: form.get("stationId"),
      userId: form.get("userId"),
      allow: form.get("allow") === "yes",
    }),
  );
}
export async function mapGoogleLocationAction(_: ActionState, form: FormData) {
  return perform((actor) => {
    const selection = z.string().parse(form.get("location")).split("|");
    return mapGoogleLocation(actor, {
      stationId: form.get("stationId"),
      accountName: selection[0],
      locationName: selection[1],
    });
  });
}
export async function syncGoogleAction(_: ActionState, form: FormData) {
  return perform((actor) =>
    requestGoogleSync(actor, z.string().parse(form.get("locationId")), {
      start: form.get("start"),
      end: form.get("end"),
    }),
  );
}
export async function recordAnalyticsActionAction(_: ActionState, form: FormData) {
  return perform((actor) => recordAnalyticsAction(actor, Object.fromEntries(form)));
}
export async function reviewAnalyticsActionAction(_: ActionState, form: FormData) {
  return perform((actor) => reviewAnalyticsAction(actor, Object.fromEntries(form)));
}
export async function recordAttributionAction(_: ActionState, form: FormData) {
  return perform((actor) =>
    recordAttribution(actor, {
      ...Object.fromEntries(form),
      costCents: form.get("costCents") === "" ? null : form.get("costCents"),
    }),
  );
}
