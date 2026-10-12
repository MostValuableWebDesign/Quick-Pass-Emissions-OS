"use server";

import { currentUser } from "@/lib/access";
import { db } from "@/lib/db";
import { normalizeDashboardLayout } from "@/components/performance-dashboard-layout";

export async function savePerformancePanelLayoutAction(input: unknown) {
  const actor = await currentUser();
  const layout = normalizeDashboardLayout(input);
  if (!layout) return { ok: false };

  try {
    await db.performancePanelLayout.upsert({
      where: { userId: actor.id },
      create: { userId: actor.id, layout },
      update: { layout },
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
