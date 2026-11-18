import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  business: vi.fn(),
  closure: vi.fn(),
  owners: vi.fn(),
  activeOwner: vi.fn(),
  settings: vi.fn(),
  previous: vi.fn(),
  status: vi.fn(),
  notification: vi.fn(),
  claim: vi.fn(),
  dashboard: vi.fn(),
  proxy: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    businessSetting: { findUnique: mocks.business },
    closure: { findUnique: mocks.closure },
    user: { findMany: mocks.owners, findFirst: mocks.activeOwner },
    auditLog: { findUnique: mocks.previous, upsert: mocks.status },
    notification: { findUnique: mocks.notification, createMany: mocks.claim },
  },
}));
vi.mock("@/lib/read-as-actor", () => ({
  readAsActor: async (_id: string, _roles: string[], work: (tx: unknown) => unknown) =>
    work({ auditLog: { findFirst: mocks.settings } }),
}));
vi.mock("@/modules/station/dashboard-service", () => ({ loadDashboard: mocks.dashboard }));
vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: class {
    proxy = mocks.proxy;
  },
}));
import { runLowVolumeAlerts } from "@/modules/automation/low-volume";

describe("low-volume alert delivery", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T19:01:00Z"));
    mocks.business.mockResolvedValue({ configured: true, operatingDays: [1, 2, 3, 4, 5, 6] });
    mocks.closure.mockResolvedValue(null);
    mocks.owners.mockResolvedValue([{ id: "owner" }]);
    mocks.activeOwner.mockResolvedValue({ id: "owner" });
    mocks.settings.mockImplementation(async ({ where }: { where: { action: string } }) =>
      where.action === "LOW_VOLUME_ALERT_SETTINGS"
        ? { details: { active: true, email: "owner@example.com" } }
        : null,
    );
    mocks.previous.mockResolvedValue(null);
    mocks.notification.mockResolvedValue(null);
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.status.mockResolvedValue({});
    mocks.dashboard.mockResolvedValue({
      query: { start: "2026-11-18", end: "2026-11-18" },
      current: { date: "2026-11-18", retrievedAt: new Date().toISOString() },
      summary: { cars: 50, revenueCents: 100_000, coveredDays: 1 },
      missingDates: [],
      staleDates: [],
      retestMissingDates: [],
      knownIncompleteDates: [],
    });
    mocks.proxy.mockImplementation(
      async (_connector: string, path: string) =>
        new Response(
          JSON.stringify(
            path.endsWith("/profile")
              ? { emailAddress: "qpemissions@gmail.com" }
              : { id: "confirmed" },
          ),
          { status: 200 },
        ),
    );
  });
  it("claims the in-app alert before sending one email at exactly 50", async () => {
    await runLowVolumeAlerts();
    expect(mocks.claim).toHaveBeenCalledOnce();
    expect(mocks.proxy.mock.calls.filter((call) => call[1].endsWith("/send"))).toHaveLength(1);
    expect(mocks.claim.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.proxy.mock.invocationCallOrder[0],
    );
    expect(mocks.status.mock.calls.at(-1)?.[0].update.details.status).toBe("SENT");
  });
  it("does not send above 50", async () => {
    const data = await mocks.dashboard();
    data.summary.revenueCents = 102_000;
    await runLowVolumeAlerts();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.proxy).not.toHaveBeenCalled();
    expect(mocks.status.mock.calls.at(-1)?.[0].update.details.status).toBe("ABOVE_THRESHOLD");
  });
  it("does not duplicate an existing alert or a concurrent claim", async () => {
    mocks.notification.mockResolvedValue({ id: "already" });
    await runLowVolumeAlerts();
    expect(mocks.dashboard).not.toHaveBeenCalled();
    mocks.notification.mockResolvedValue(null);
    mocks.claim.mockResolvedValue({ count: 0 });
    await runLowVolumeAlerts();
    expect(mocks.proxy).not.toHaveBeenCalled();
  });
  it("does not use incomplete data", async () => {
    const data = await mocks.dashboard();
    data.retestMissingDates = ["2026-11-01"];
    await runLowVolumeAlerts();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.proxy).not.toHaveBeenCalled();
  });
  it("does not retry an uncertain email", async () => {
    mocks.proxy.mockRejectedValue(new Error("network"));
    await runLowVolumeAlerts();
    expect(mocks.status.mock.calls.at(-1)?.[0].update.details.status).toBe("EMAIL_UNCONFIRMED");
    mocks.notification.mockResolvedValue({ id: "claimed" });
    await runLowVolumeAlerts();
    expect(mocks.proxy).toHaveBeenCalledTimes(1);
  });
  it("requires the connected Quick Pass mailbox", async () => {
    mocks.proxy.mockResolvedValue(
      new Response(JSON.stringify({ emailAddress: "wrong@example.com" })),
    );
    await runLowVolumeAlerts();
    expect(mocks.proxy).toHaveBeenCalledTimes(1);
    expect(mocks.status.mock.calls.at(-1)?.[0].update.details.status).toBe("EMAIL_UNCONFIRMED");
  });
  it("never reads the source on a closure or with alerts disabled", async () => {
    mocks.closure.mockResolvedValue({ date: "2026-11-18" });
    await runLowVolumeAlerts();
    expect(mocks.dashboard).not.toHaveBeenCalled();
    mocks.closure.mockResolvedValue(null);
    mocks.settings.mockResolvedValue({ details: { active: false, email: "owner@example.com" } });
    await runLowVolumeAlerts();
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });
});
