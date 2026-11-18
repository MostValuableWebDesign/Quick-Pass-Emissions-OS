import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  execute: vi.fn(),
  actor: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));
import { readAsActor } from "@/lib/read-as-actor";
import { phase2 } from "@/modules/phase2";
import { phase3 } from "@/modules/phase3";
import { phase4 } from "@/modules/phase4";
import { automation } from "@/modules/automation/transaction";

describe("permission-checked read transactions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async (work) =>
      work({ $executeRaw: mocks.execute, user: { findUnique: mocks.actor } }),
    );
    mocks.actor.mockResolvedValue({
      id: "owner",
      name: "Owner",
      role: "OWNER",
      active: true,
      employee: null,
    });
  });
  it("uses a read-only consistent snapshot without acquiring advisory locks", async () => {
    const result = await readAsActor("owner", ["OWNER"], async (_tx, actor) => actor.name);
    expect(result).toBe("Owner");
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[0][0].join("")).toBe("SET TRANSACTION READ ONLY");
    expect(mocks.transaction.mock.calls[0][1]).toMatchObject({
      isolationLevel: "RepeatableRead",
      timeout: 30000,
    });
    expect(mocks.actor).toHaveBeenCalledWith({
      where: { id: "owner" },
      include: { employee: { select: { id: true } } },
    });
  });
  it.each([
    null,
    { id: "owner", active: false, role: "OWNER" },
    { id: "staff", active: true, role: "EMPLOYEE" },
    { id: "bookkeeper", active: true, role: "BOOKKEEPER" },
    { id: "admin", active: true, role: "ADMIN" },
  ])("rejects an unauthorized reader before loading data: %j", async (actor) => {
    mocks.actor.mockResolvedValue(actor);
    const work = vi.fn();
    await expect(readAsActor("id", ["OWNER"], work)).rejects.toThrow("permission");
    expect(work).not.toHaveBeenCalled();
  });
  it("checks active status again on each read instead of caching permissions", async () => {
    await readAsActor("owner", ["OWNER"], async () => true);
    mocks.actor.mockResolvedValue({ id: "owner", active: false, role: "OWNER" });
    await expect(readAsActor("owner", ["OWNER"], async () => true)).rejects.toThrow("permission");
    expect(mocks.actor).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["phase2", phase2, 1],
    ["phase3", phase3, 1],
    ["phase4", phase4, 2],
    ["automation", automation, 5],
  ] as const)("retains all advisory locks for the %s write path", async (_name, write, locks) => {
    await write("owner", ["OWNER"], async () => true);
    expect(mocks.execute).toHaveBeenCalledTimes(locks);
    for (const call of mocks.execute.mock.calls)
      expect(call[0].join("")).toContain("pg_advisory_xact_lock");
  });
});
