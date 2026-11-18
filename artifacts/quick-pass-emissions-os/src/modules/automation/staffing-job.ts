import type { PrismaClient } from "@prisma/client";
import { checkStorage } from "@/lib/storage";
import { lowVolumeSettings, runLowVolumeAlerts } from "./low-volume";

type StaffingEnvironment = {
  [key: string]: string | undefined;
  EXPECTED_DATABASE_ID?: string;
  GA_DASHBOARD_USERNAME?: string;
  GA_DASHBOARD_PASSWORD?: string;
  GA_STATION_ID?: string;
};

export const staffingSchedule = {
  cron: "0-14 14 * * *",
  timezone: "America/New_York",
  build: "pnpm --filter @workspace/quick-pass-emissions-os run staffing:build",
  run: "pnpm --filter @workspace/quick-pass-emissions-os run staffing:check",
  setupCheck: "pnpm --filter @workspace/quick-pass-emissions-os run staffing:setup-check",
} as const;

/** Read-only readiness check. Never fetches station reports or sends messages. */
export async function checkStaffingSetup(client: PrismaClient, env: StaffingEnvironment) {
  await checkStorage(client, env.EXPECTED_DATABASE_ID);
  const [business, owners] = await Promise.all([
    client.businessSetting.findUnique({ where: { id: "business" } }),
    client.user.findMany({
      where: { active: true, role: "OWNER" },
      select: { id: true },
    }),
  ]);
  const policies = await Promise.all(owners.map((owner) => lowVolumeSettings(owner.id)));
  const issues: string[] = [];
  if (!business?.configured || !business.operatingDays.length)
    issues.push("Configure business operating days.");
  if (!policies.some((policy) => policy.settings?.active))
    issues.push("Save a recipient and enable an owner's staffing-alert policy.");
  if (
    !env.GA_DASHBOARD_USERNAME?.trim() ||
    !env.GA_DASHBOARD_PASSWORD?.trim() ||
    !env.GA_STATION_ID?.trim()
  )
    issues.push("Station source credentials are missing.");
  return { ready: issues.length === 0, issues };
}

export async function executeStaffingJob(
  client: PrismaClient,
  env: StaffingEnvironment,
  args: string[],
) {
  if (args.length > 1 || (args.length === 1 && args[0] !== "--check"))
    throw new Error("Use staffing:check or staffing:setup-check.");
  const setup = await checkStaffingSetup(client, env);
  if (!setup.ready) return { ok: false, mode: "setup" as const, ...setup };
  if (args[0] === "--check") return { ok: true, mode: "setup" as const, ...setup };
  return { ok: true, mode: "scheduled" as const, ...(await runLowVolumeAlerts()) };
}
