import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  refresh: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/access", () => ({ currentUser: async () => ({ id: "fixture-owner" }) }));
vi.mock("@/modules/finance/service", () => ({ createInvoice: mocks.create }));

import { createInvoice } from "@/app/phase4-actions";

describe("create replacement invoice from saved services", () => {
  beforeEach(() => vi.clearAllMocks());

  function form() {
    const data = new FormData();
    data.set("dealershipId", "fixture-dealer");
    data.set("issueDate", "2026-11-17");
    data.append("serviceIds", "saved-service-one");
    data.append("serviceIds", "saved-service-two");
    return data;
  }

  it("passes selected saved services and opens the new draft for review", async () => {
    mocks.create.mockResolvedValue({ id: "replacement-invoice" });
    await expect(createInvoice({ ok: false, message: "" }, form())).rejects.toThrow(
      "REDIRECT:/invoices/replacement-invoice",
    );
    expect(mocks.create).toHaveBeenCalledWith(
      "fixture-owner",
      expect.objectContaining({
        dealershipId: "fixture-dealer",
        serviceIds: ["saved-service-one", "saved-service-two"],
      }),
    );
    expect(mocks.refresh).toHaveBeenCalledWith("/", "layout");
  });

  it("leaves the form in place when draft creation fails", async () => {
    mocks.create.mockRejectedValue(new Error("creation failed"));
    const result = await createInvoice({ ok: false, message: "" }, form());
    expect(result.ok).toBe(false);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
