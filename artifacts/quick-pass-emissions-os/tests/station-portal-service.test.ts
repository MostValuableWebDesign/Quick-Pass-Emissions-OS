import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  fetchTotal: vi.fn(),
  latest: vi.fn(),
  audit: vi.fn(),
  ownerAllowed: true,
}));
vi.mock("../src/modules/station/service", () => ({
  stationConfig: () => ({ station: "SYNTHETIC", hash: "fixture-station-hash" }),
  stationTransaction: mocks.transaction,
}));
vi.mock("../src/modules/station/portal-client", () => ({ portalDailyTotal: mocks.fetchTotal }));
vi.mock("../src/modules/phase2", () => ({
  audit: mocks.audit,
  requireRule: (valid: unknown, message: string) => {
    if (!valid) throw new Error(message);
  },
}));
import { retrievePortalCount, portalTotalSchema } from "../src/modules/station/portal-service";

const result = {
  date: "2026-01-15",
  total: 3,
  passed: 1,
  failed: 1,
  aborted: 1,
  other: 0,
  retrievedAt: "2026-01-15T17:00:00Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GA_DASHBOARD_USERNAME", "fixture-user");
  vi.stubEnv("GA_DASHBOARD_PASSWORD", "fixture-only-password");
  mocks.ownerAllowed = true;
  mocks.latest.mockResolvedValue(null);
  mocks.fetchTotal.mockResolvedValue(result);
  mocks.transaction.mockImplementation(
    async (_actor: string, work: (tx: unknown, hash: string) => unknown) => {
      if (!mocks.ownerAllowed) throw new Error("Not authorized");
      return work({ auditLog: { findFirst: mocks.latest } }, "fixture-station-hash");
    },
  );
});
afterEach(() => vi.unstubAllEnvs());
describe("owner-triggered station portal lookup", () => {
  it("rejects unauthorized actors before making a portal request", async () => {
    mocks.ownerAllowed = false;
    await expect(retrievePortalCount("employee", result.date)).rejects.toThrow("Not authorized");
    expect(mocks.fetchTotal).not.toHaveBeenCalled();
  });
  it("throttles repeated station requests before any portal access", async () => {
    mocks.latest.mockResolvedValue({ createdAt: new Date() });
    await expect(retrievePortalCount("owner", result.date)).rejects.toThrow("15 seconds");
    expect(mocks.fetchTotal).not.toHaveBeenCalled();
  });
  it("stores only a validated aggregate snapshot, not individual records or payroll inputs", async () => {
    await expect(retrievePortalCount("owner", result.date)).resolves.toEqual(result);
    expect(mocks.audit).toHaveBeenLastCalledWith(
      expect.anything(),
      "owner",
      "STATION_PORTAL_COUNT_RETRIEVED",
      "fixture-station-hash",
      result,
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });
  it("does not save a success snapshot when the portal fails or totals are inconsistent", async () => {
    for (const invalid of [null, { ...result, total: 4 }]) {
      mocks.fetchTotal.mockResolvedValue(invalid);
      await expect(retrievePortalCount("owner", result.date)).rejects.toThrow();
    }
    expect(mocks.audit.mock.calls.every((c) => c[2] === "STATION_PORTAL_LOOKUP_STARTED")).toBe(
      true,
    );
    expect(portalTotalSchema.safeParse({ ...result, date: "not-a-date" }).success).toBe(false);
  });
});
