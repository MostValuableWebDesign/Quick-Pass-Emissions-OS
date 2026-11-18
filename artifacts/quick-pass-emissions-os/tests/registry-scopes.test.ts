import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  bays: vi.fn(),
  equipment: vi.fn(),
  vendors: vi.fn(),
  employees: vi.fn(),
  plans: vi.fn(),
  demo: vi.fn(),
}));
vi.mock("@/lib/read-as-actor", () => ({
  readAsActor: async (_id: string, _roles: string[], work: (tx: unknown) => unknown) =>
    work({
      carwashBay: { findMany: mocks.bays },
      equipment: { findMany: mocks.equipment },
      vendor: { findMany: mocks.vendors },
      employee: { findMany: mocks.employees, count: mocks.demo },
      maintenancePlan: { findMany: mocks.plans },
    }),
}));
import { registry } from "@/modules/maintenance/service";

describe("page-scoped registry reads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    for (const mock of [mocks.bays, mocks.equipment, mocks.vendors, mocks.employees, mocks.plans])
      mock.mockResolvedValue([]);
    mocks.demo.mockResolvedValue(0);
  });
  it("does not load unrelated equipment, vendor directories or all plans for Carwash", async () => {
    const data = await registry("owner", "bays");
    expect(mocks.equipment).not.toHaveBeenCalled();
    expect(mocks.vendors).not.toHaveBeenCalled();
    expect(mocks.plans).not.toHaveBeenCalled();
    expect(data.equipment).toEqual([]);
    expect(mocks.bays.mock.calls[0][0].include.supportAssociations).toEqual({
      select: { vendor: { select: { id: true, name: true, active: true } } },
    });
  });
  it("loads Equipment's support links in one registry request, without bay histories", async () => {
    await registry("owner", "equipment");
    expect(mocks.equipment).toHaveBeenCalledTimes(1);
    expect(mocks.equipment.mock.calls[0][0].include.supportAssociations).toBeDefined();
    expect(mocks.bays.mock.calls[0][0].include.tickets.take).toBe(0);
    expect(mocks.bays.mock.calls[0][0].include.downtime.take).toBe(0);
    expect(mocks.plans).not.toHaveBeenCalled();
  });
  it("preserves the complete registry for existing callers", async () => {
    await registry("owner");
    expect(mocks.bays).toHaveBeenCalledOnce();
    expect(mocks.equipment).toHaveBeenCalledOnce();
    expect(mocks.vendors).toHaveBeenCalledOnce();
    expect(mocks.plans).toHaveBeenCalledOnce();
    expect(mocks.bays.mock.calls[0][0].include.tickets.take).toBe(20);
  });
});
