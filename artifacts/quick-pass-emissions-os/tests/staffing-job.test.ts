import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  checkStorage: vi.fn(),
  settings: vi.fn(),
  run: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({ checkStorage: mocks.checkStorage }));
vi.mock("@/modules/automation/low-volume", () => ({
  lowVolumeSettings: mocks.settings,
  runLowVolumeAlerts: mocks.run,
}));
import type { PrismaClient } from "@prisma/client";
import { executeStaffingJob, staffingSchedule } from "@/modules/automation/staffing-job";

const business = vi.fn();
const owners = vi.fn();
const client = {
  businessSetting: { findUnique: business },
  user: { findMany: owners },
} as unknown as PrismaClient;
const env = {
  GA_DASHBOARD_USERNAME: "synthetic",
  GA_DASHBOARD_PASSWORD: "synthetic",
  GA_STATION_ID: "synthetic",
};

describe("dedicated staffing job", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.checkStorage.mockResolvedValue({});
    business.mockResolvedValue({ configured: true, operatingDays: [1, 2, 3, 4, 5, 6] });
    owners.mockResolvedValue([{ id: "owner" }]);
    mocks.settings.mockResolvedValue({ settings: { active: true, email: "owner@example.com" } });
    mocks.run.mockResolvedValue({ checked: 1 });
  });
  it("provides a narrow local-Eastern schedule", () => {
    expect(staffingSchedule.cron).toBe("0-14 14 * * *");
    expect(staffingSchedule.timezone).toBe("America/New_York");
    expect(staffingSchedule.run).toContain("staffing:check");
  });
  it("validates readiness without source retrieval, delivery or policy mutation", async () => {
    expect(await executeStaffingJob(client, env, ["--check"])).toEqual({
      ok: true,
      mode: "setup",
      ready: true,
      issues: [],
    });
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.checkStorage).toHaveBeenCalledWith(client, undefined);
  });
  it("executes only the staffing worker", async () => {
    expect(await executeStaffingJob(client, env, [])).toEqual({
      ok: true,
      mode: "scheduled",
      checked: 1,
    });
    expect(mocks.run).toHaveBeenCalledOnce();
  });
  it("refuses to run with no enabled policy or missing station configuration", async () => {
    mocks.settings.mockResolvedValue({ settings: null });
    const result = await executeStaffingJob(client, {}, []);
    expect(result.ok).toBe(false);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("owner@example.com");
  });
  it("requires configured open days", async () => {
    business.mockResolvedValue({ configured: true, operatingDays: [] });
    expect((await executeStaffingJob(client, env, [])).ok).toBe(false);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("stops on a storage identity mismatch", async () => {
    mocks.checkStorage.mockRejectedValue(new Error("mismatch"));
    await expect(executeStaffingJob(client, env, [])).rejects.toThrow("mismatch");
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("rejects unknown arguments before database or provider operations", async () => {
    await expect(executeStaffingJob(client, env, ["--force"])).rejects.toThrow();
    expect(mocks.checkStorage).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
