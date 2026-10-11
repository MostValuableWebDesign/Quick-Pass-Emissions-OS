"use server";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { BusinessError } from "../phase2";
import { loadDashboard, saveDashboardPayPlan } from "./dashboard-service";
import type { DashboardQuery, DashboardState, PayPlan } from "./dashboard-types";

async function perform(
  work: (actorId: string) => Promise<DashboardState["data"]>,
): Promise<DashboardState> {
  const actor = await currentUser();
  try {
    const data = await work(actor.id);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof BusinessError) return { ok: false, message: error.message };
    if (error instanceof z.ZodError)
      return { ok: false, message: "Check dates, schedules and pay amounts." };
    return { ok: false, message: "Unable to load Performance. Saved data has not been changed." };
  }
}
export async function getPerformanceDashboardAction(query: DashboardQuery, refresh = false) {
  return perform((actorId) => loadDashboard(actorId, query, refresh === true));
}
export async function savePerformancePayPlanAction(plan: PayPlan, query: DashboardQuery) {
  return perform((actorId) => saveDashboardPayPlan(actorId, plan, query));
}
