import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DASHBOARD_LAYOUT } from "../src/components/performance-dashboard-layout";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/access", () => ({ currentUser: mocks.currentUser }));
vi.mock("@/lib/db", () => ({
  db: { performancePanelLayout: { upsert: mocks.upsert } },
}));

import { savePerformancePanelLayoutAction } from "../src/app/performance-layout-actions";

describe("account-scoped Performance layouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ id: "signed-in-owner" });
    mocks.upsert.mockResolvedValue({});
  });

  it("saves only against the signed-in account", async () => {
    const layout = DEFAULT_DASHBOARD_LAYOUT.map((panel) => ({
      ...panel,
      userId: "another-account",
    }));
    expect(await savePerformancePanelLayoutAction(layout)).toEqual({ ok: true });
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { userId: "signed-in-owner" },
      create: { userId: "signed-in-owner", layout: DEFAULT_DASHBOARD_LAYOUT },
      update: { layout: DEFAULT_DASHBOARD_LAYOUT },
    });
  });

  it("rejects incomplete or duplicate layouts without writing", async () => {
    expect(await savePerformancePanelLayoutAction(DEFAULT_DASHBOARD_LAYOUT.slice(0, 1))).toEqual({
      ok: false,
    });
    expect(
      await savePerformancePanelLayoutAction(
        DEFAULT_DASHBOARD_LAYOUT.map(() => DEFAULT_DASHBOARD_LAYOUT[0]),
      ),
    ).toEqual({ ok: false });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("reports a persistence failure so the client can offer retry", async () => {
    mocks.upsert.mockRejectedValue(new Error("private database diagnostic"));
    expect(await savePerformancePanelLayoutAction(DEFAULT_DASHBOARD_LAYOUT)).toEqual({
      ok: false,
    });
  });

  it("does not write without an authenticated account", async () => {
    mocks.currentUser.mockRejectedValue(new Error("sign-in required"));
    await expect(savePerformancePanelLayoutAction(DEFAULT_DASHBOARD_LAYOUT)).rejects.toThrow(
      "sign-in required",
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
