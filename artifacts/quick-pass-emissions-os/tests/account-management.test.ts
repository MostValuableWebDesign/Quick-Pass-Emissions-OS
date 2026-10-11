import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    employee: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    session: { deleteMany: vi.fn() },
    invite: { create: vi.fn(), updateMany: vi.fn() },
    account: { count: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { tx, manager: vi.fn(), transaction: vi.fn(), revalidate: vi.fn() };
});

vi.mock("@/lib/access", () => ({ manager: mocks.manager, currentUser: mocks.manager }));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import {
  createManagerAccount,
  issueManagerAccountInvite,
  saveOwnAccount,
  setManagerAccountActive,
} from "@/app/actions";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
const owner = { id: "owner", role: "OWNER", active: true };
const manager = { id: "manager", role: "ADMIN", active: true };
const newUser = { name: "Example Manager", email: "manager@example.test", phone: "", role: "ADMIN" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.manager.mockResolvedValue(owner);
  mocks.tx.user.findUnique.mockResolvedValue(owner);
  mocks.tx.user.findUniqueOrThrow.mockResolvedValue({ ...manager, employee: { id: "profile" } });
  mocks.tx.user.findFirst.mockResolvedValue(null);
  mocks.tx.employee.create.mockResolvedValue({ id: "profile", userId: "new-user" });
  mocks.tx.employee.findUnique.mockResolvedValue({ id: "profile" });
  mocks.tx.account.count.mockResolvedValue(0);
  mocks.transaction.mockImplementation(async (work) => work(mocks.tx));
});

describe("account administration", () => {
  it.each(["ADMIN", "OWNER"])("lets an owner create an invited %s account", async (role) => {
    const result = await createManagerAccount({}, form({ ...newUser, role }));
    expect(result.ok).toBe(true);
    expect(result.invite).toMatch(/^\/invite#[a-f0-9]{64}$/);
    const data = mocks.tx.employee.create.mock.calls[0][0].data;
    expect(data.user.create.role).toBe(role);
    expect(data.user.create).not.toHaveProperty("password");
    const token = result.invite!.split("#")[1];
    expect(data.invites.create.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(data.invites.create.expiresAt.getTime()).toBeGreaterThan(Date.now() + 47 * 3600000);
  });

  it("prevents managers from creating privileged accounts", async () => {
    mocks.manager.mockResolvedValue(manager);
    const result = await createManagerAccount({}, form({ ...newUser, role: "OWNER" }));
    expect(result.ok).toBe(false);
    expect(mocks.tx.employee.create).not.toHaveBeenCalled();
  });

  it.each(["EMPLOYEE", "BOOKKEEPER"])("does not restore %s sign-ins", async (role) => {
    const result = await createManagerAccount({}, form({ ...newUser, role }));
    expect(result.ok).toBe(false);
    expect(mocks.tx.employee.create).not.toHaveBeenCalled();
  });

  it("rejects duplicate email identities", async () => {
    mocks.tx.user.findFirst.mockResolvedValue({ id: "existing" });
    const result = await createManagerAccount({}, form(newUser));
    expect(result.ok).toBe(false);
    expect(mocks.tx.employee.create).not.toHaveBeenCalled();
  });

  it("does not permit self-deactivation", async () => {
    mocks.tx.user.findUniqueOrThrow.mockResolvedValue({ ...owner, employee: null });
    const result = await setManagerAccountActive({}, form({ id: owner.id, active: "false" }));
    expect(result.ok).toBe(false);
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
    expect(mocks.tx.session.deleteMany).not.toHaveBeenCalled();
  });

  it("deactivates another account, revokes sessions and expires invitations without deleting history", async () => {
    const result = await setManagerAccountActive({}, form({ id: manager.id, active: "false" }));
    expect(result.ok).toBe(true);
    expect(mocks.tx.user.update).toHaveBeenCalledWith({
      where: { id: manager.id }, data: { active: false },
    });
    expect(mocks.tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: manager.id } });
    expect(mocks.tx.invite.updateMany).toHaveBeenCalledWith({
      where: { employeeId: "profile", usedAt: null }, data: { usedAt: expect.any(Date) },
    });
    expect(mocks.tx.employee.update).not.toHaveBeenCalled();
  });

  it("requires owner access for deactivation", async () => {
    mocks.manager.mockResolvedValue(manager);
    const result = await setManagerAccountActive({}, form({ id: "other-manager", active: "false" }));
    expect(result.ok).toBe(false);
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
  });

  it("allows reactivation of another management account", async () => {
    const result = await setManagerAccountActive({}, form({ id: manager.id, active: "true" }));
    expect(result.ok).toBe(true);
    expect(mocks.tx.user.update).toHaveBeenCalledWith({
      where: { id: manager.id }, data: { active: true },
    });
  });

  it("edits only the current user's name and phone, ignoring submitted email and role", async () => {
    const result = await saveOwnAccount({}, form({
      name: "Updated Name", phone: "(404) 555-0123", role: "ADMIN", email: "other@example.test",
    }));
    expect(result.ok).toBe(true);
    expect(mocks.tx.user.update).toHaveBeenCalledWith({
      where: { id: owner.id }, data: { name: "Updated Name", phone: "(404) 555-0123" },
    });
  });

  it("does not issue a replacement invitation for an activated account", async () => {
    mocks.tx.account.count.mockResolvedValue(1);
    const result = await issueManagerAccountInvite({}, form({ id: manager.id }));
    expect(result.ok).toBe(false);
    expect(mocks.tx.invite.create).not.toHaveBeenCalled();
  });
});
