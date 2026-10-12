import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshCertificateInsights } from "../src/modules/certificates/order-history";

const mocks = vi.hoisted(() => ({
  recent: vi.fn(),
  fetchOrders: vi.fn(),
  refreshBalance: vi.fn(),
  audit: vi.fn(),
}));
const portal = {
  balance: 100,
  checkedAt: "2026-10-12T12:00:00.000Z",
  threshold: 50,
  station: "GA102539",
  analyzer: "HT111411",
};
vi.mock("@/lib/db", () => ({
  db: {
    auditLog: { findFirst: vi.fn().mockResolvedValue(null) },
    certificateSetting: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock("@/modules/phase2", () => ({
  approvalRoles: ["OWNER"],
  audit: mocks.audit,
  BusinessError: class extends Error {},
  phase2: async (_actor: string, _roles: string[], work: (tx: unknown) => unknown) =>
    work({ auditLog: { findFirst: mocks.recent } }),
}));
vi.mock("@/modules/certificates/portal", () => ({
  CERTIFICATE_PORTAL_SCOPE: "fixture",
  readCertificatePortalStatus: async () => portal,
  refreshCertificateBalance: mocks.refreshBalance,
}));
vi.mock("@/modules/certificates/order-history-source", () => ({
  fetchCertificateOrderHistory: mocks.fetchOrders,
}));

beforeEach(() => {
  mocks.recent.mockReset().mockResolvedValue(null);
  mocks.audit.mockReset().mockResolvedValue(undefined);
  mocks.fetchOrders.mockReset().mockResolvedValue({
    checkedAt: "2026-10-12T12:00:00.000Z",
    orders: [],
  });
  mocks.refreshBalance.mockReset().mockResolvedValue({ ...portal, sourceStatus: "cached" });
});

describe("certificate refresh source metadata", () => {
  it("reports source orders and cached balance independently", async () => {
    const result = await refreshCertificateInsights("fixture", true);
    expect(result.sourceStatuses).toEqual({ orders: "source", balance: "cached" });
    expect(mocks.fetchOrders).toHaveBeenCalledOnce();
  });

  it("skips a provider order pull when recent history can be reused", async () => {
    mocks.recent.mockResolvedValue({
      action: "CERTIFICATE_ORDER_HISTORY_CACHED",
      createdAt: new Date(),
    });
    const result = await refreshCertificateInsights("fixture", false);
    expect(result.sourceStatuses.orders).toBe("cached");
    expect(mocks.fetchOrders).not.toHaveBeenCalled();
  });

  it("reports a deferred manual pull without pretending it reached the source", async () => {
    mocks.recent.mockResolvedValue({
      action: "CERTIFICATE_ORDER_HISTORY_STARTED",
      createdAt: new Date(),
    });
    const result = await refreshCertificateInsights("fixture", true);
    expect(result.sourceStatuses.orders).toBe("blocked");
    expect(mocks.fetchOrders).not.toHaveBeenCalled();
  });

  it("keeps order failure separate from a successful source balance check", async () => {
    mocks.fetchOrders.mockRejectedValue(new Error("Fixture failure"));
    mocks.refreshBalance.mockResolvedValue({ ...portal, sourceStatus: "source" });
    const result = await refreshCertificateInsights("fixture", true);
    expect(result.sourceStatuses).toEqual({ orders: "failed", balance: "source" });
  });
});
