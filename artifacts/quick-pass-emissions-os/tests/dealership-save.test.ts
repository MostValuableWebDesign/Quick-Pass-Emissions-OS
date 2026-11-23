import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  tx: {
    dealership: {
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    dealerContact: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    dealerInvoice: { findMany: vi.fn() },
    employee: { count: vi.fn() },
  },
}));
vi.mock("@/modules/phase4", () => ({
  financeRoles: ["OWNER", "ADMIN"],
  reviewers: ["OWNER", "ADMIN"],
  BusinessError: class extends Error {},
  phase4: async (_actor: string, _roles: string[], work: (tx: unknown) => unknown) =>
    work(mocks.tx),
  requireRule: (allowed: unknown, message: string) => {
    if (!allowed) throw new Error(message);
  },
  audit: mocks.audit,
}));
vi.mock("@/lib/read-as-actor", () => ({
  readAsActor: async (_actor: string, _roles: string[], work: (tx: unknown) => unknown) =>
    work(mocks.tx),
}));
import { dealerOverview, saveContact, saveDealer } from "@/modules/finance/service";

const dealerId = "c1234567890123456789012345";
const input = {
  id: "",
  version: 0,
  name: "Fixture Motors",
  billingAddress: "Fixture billing address",
};

describe("simplified dealership records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.dealership.findUnique.mockResolvedValue(null);
    mocks.tx.dealership.count.mockResolvedValue(0);
    mocks.tx.dealership.findMany.mockResolvedValue([]);
    mocks.tx.employee.count.mockResolvedValue(0);
    mocks.tx.dealerInvoice.findMany.mockResolvedValue([]);
    mocks.tx.dealership.create.mockImplementation(async ({ data }) => ({ id: dealerId, ...data }));
    mocks.tx.dealership.update.mockImplementation(async ({ data }) => ({ id: dealerId, ...data }));
    mocks.tx.dealerContact.update.mockImplementation(async ({ data }) => ({ ...data }));
  });

  it("generates an internal code and creates an active partner without status or change reason inputs", async () => {
    const saved = await saveDealer("owner", { ...input, phone: "555-0100" });
    expect(saved.code).toMatch(/^DLR-[a-f0-9-]{36}$/);
    expect(saved.phone).toBe("555-0100");
    expect(saved.active).toBe(true);
    expect(saved).toMatchObject({
      defaultRateCents: 1500,
      termsDays: 30,
      taxBps: 0,
      termsAuthorizedBy: "owner",
    });
    expect(saved.termsAuthorizedAt).toBeInstanceOf(Date);
    expect(mocks.audit).toHaveBeenCalledWith(
      mocks.tx,
      "owner",
      "DEALER_SAVED",
      dealerId,
      expect.objectContaining({ reason: "Dealership details saved." }),
    );
  });

  it("preserves existing codes, phone numbers and archived partnerships when omitted on edit", async () => {
    mocks.tx.dealership.findUnique.mockResolvedValue({
      id: dealerId,
      version: 0,
      code: "LEGACY-CODE",
      phone: "555-0101",
      active: false,
    });
    await saveDealer("owner", { ...input, id: dealerId });
    expect(mocks.tx.dealership.update).toHaveBeenCalledWith({
      where: { id: dealerId },
      data: expect.objectContaining({ code: "LEGACY-CODE", phone: "555-0101", active: false }),
    });
    expect(mocks.tx.dealership.update.mock.calls[0][0].data).not.toHaveProperty("defaultRateCents");
  });

  it("archives a dealership without deleting its saved history", async () => {
    mocks.tx.dealership.findUnique.mockResolvedValue({
      id: dealerId,
      version: 0,
      code: "LEGACY-CODE",
      phone: "555-0101",
      active: true,
      billingAddress: "Fixture billing address",
      notes: "",
    });
    await saveDealer("owner", { ...input, id: dealerId, active: false });
    expect(mocks.tx.dealership.update).toHaveBeenCalledWith({
      where: { id: dealerId },
      data: expect.objectContaining({ active: false, code: "LEGACY-CODE" }),
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      mocks.tx,
      "owner",
      "DEALER_SAVED",
      dealerId,
      expect.objectContaining({ active: false }),
    );
  });

  it("allows an entered phone number to be cleared", async () => {
    mocks.tx.dealership.findUnique.mockResolvedValue({
      id: dealerId,
      version: 0,
      code: "LEGACY-CODE",
      phone: "555-0101",
      active: true,
    });
    await saveDealer("owner", { ...input, id: dealerId, phone: "" });
    expect(mocks.tx.dealership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: "" }) }),
    );
  });

  it("rejects malformed dealership phone numbers and email addresses", async () => {
    await expect(saveDealer("owner", { ...input, phone: "555-fixture" })).rejects.toThrow(
      "valid phone number",
    );
    await expect(saveDealer("owner", { ...input, email: "not-an-email" })).rejects.toThrow();
    expect(mocks.tx.dealership.create).not.toHaveBeenCalled();
  });

  it("keeps archived contacts archived when their details are edited", async () => {
    mocks.tx.dealership.count.mockResolvedValue(1);
    mocks.tx.dealerContact.findUnique.mockResolvedValue({
      id: dealerId,
      version: 0,
      dealershipId: dealerId,
      active: false,
    });
    await saveContact("owner", {
      id: dealerId,
      version: 0,
      dealershipId: dealerId,
      name: "Fixture billing contact",
      email: "billing@example.test",
      phone: "",
      purpose: "Invoices",
      source: "Provided by dealership",
    });
    expect(mocks.tx.dealerContact.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ active: false }) }),
    );
  });

  it("shows active partners by default and searches phone numbers and active contacts", async () => {
    await dealerOverview("owner", "Fixture");
    expect(mocks.tx.dealership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          OR: expect.arrayContaining([
            { phone: { contains: "Fixture", mode: "insensitive" } },
            expect.objectContaining({ contacts: expect.any(Object) }),
          ]),
        }),
      }),
    );
    await dealerOverview("owner", "", "all");
    expect(mocks.tx.dealership.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it("puts a newly created draft invoice, amount, and account link on its dealership card data", async () => {
    const dealer = {
      id: dealerId,
      name: "Fixture Motors",
      active: true,
      phone: "",
      email: "",
      contacts: [],
      invoices: [
        {
          id: "draft-invoice-id",
          number: "QP-2026-0042",
          state: "DRAFT",
          approvedAt: null,
          totalCents: 4500,
          issueDate: "2026-11-18",
          dueDate: "2026-12-18",
          voidDate: null,
          payments: [],
        },
      ],
    };
    mocks.tx.dealership.findMany.mockResolvedValue([dealer]);
    mocks.tx.dealerInvoice.findMany.mockResolvedValue([]);
    mocks.tx.employee.count.mockResolvedValue(0);
    const overview = await dealerOverview("owner");
    expect(overview.dealers[0].latestInvoice).toEqual({
      id: "draft-invoice-id",
      number: "QP-2026-0042",
      status: "Draft",
      totalCents: 4500,
    });
  });
});
