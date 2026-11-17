import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  release: vi.fn(),
  removeLines: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/modules/phase4", () => ({
  financeRoles: ["OWNER", "ADMIN"],
  reviewers: ["OWNER", "ADMIN"],
  phase4: async (_actor: string, _roles: string[], work: (tx: unknown) => Promise<unknown>) =>
    work({
      dealerInvoice: {
        findUnique: mocks.findUnique,
        update: mocks.update,
        delete: mocks.remove,
      },
      dealerService: { updateMany: mocks.release },
      dealerInvoiceLine: { deleteMany: mocks.removeLines },
    }),
  requireRule: (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  },
  audit: mocks.audit,
}));

import { deleteDraftInvoice, setInvoiceArchived } from "@/modules/finance/service";

const draft = {
  id: "fixture-invoice",
  number: "QP-2026-0099",
  version: 2,
  state: "DRAFT",
  approvedAt: null,
  sentDate: null,
  deliveryReference: null,
  archivedAt: null,
  dealershipId: "fixture-dealer",
  totalCents: 1500,
  payments: [],
  lines: [{ serviceId: "fixture-service" }],
};

describe("invoice archive and draft deletion safeguards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(draft);
    mocks.update.mockResolvedValue({ ...draft, version: 3 });
  });

  it("archives without changing balances, payments or service allocations", async () => {
    await setInvoiceArchived("owner", { id: draft.id, version: 2, archived: true });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: draft.id },
      data: { archivedAt: expect.any(Date), version: { increment: 1 } },
    });
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("restores an archived invoice to the active list", async () => {
    mocks.findUnique.mockResolvedValue({ ...draft, archivedAt: new Date() });
    await setInvoiceArchived("owner", { id: draft.id, version: 2, archived: false });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: draft.id },
      data: { archivedAt: null, version: { increment: 1 } },
    });
  });

  it("releases services and retains an audit record before deleting a draft", async () => {
    await deleteDraftInvoice("owner", { id: draft.id, version: 2 });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      "owner",
      "DEALER_INVOICE_DELETED",
      draft.id,
      expect.objectContaining({ number: draft.number, serviceIds: ["fixture-service"] }),
    );
    expect(mocks.release).toHaveBeenCalledWith({
      where: { invoiceId: draft.id },
      data: { invoiceId: null },
    });
    expect(mocks.removeLines).toHaveBeenCalledWith({ where: { invoiceId: draft.id } });
    expect(mocks.remove).toHaveBeenCalledWith({ where: { id: draft.id } });
  });

  it.each([
    { state: "SENT" },
    { state: "APPROVED" },
    { state: "VOIDED" },
    { approvedAt: new Date() },
    { sentDate: "2026-11-17" },
    { deliveryReference: "GMAIL:fixture" },
    { payments: [{ amountCents: 1500 }] },
    { version: 3 },
  ])("refuses unsafe deletion for %j", async (changes) => {
    mocks.findUnique.mockResolvedValue({ ...draft, ...changes });
    await expect(
      deleteDraftInvoice("owner", { id: draft.id, version: 2 }),
    ).rejects.toThrow("Only an unsent draft");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });
});
