import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { businessDate, addDays } from "@/lib/time";

const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("Test database name must end in _test");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

(enabled ? describe : describe.skip)("confirmed Gmail send database constraints", () => {
  let db: PrismaClient;
  let record: typeof import("@/modules/finance/service").recordGmailInvoiceSent;
  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    record = (await import("@/modules/finance/service")).recordGmailInvoiceSent;
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  async function draft() {
    const owner = await db.user.create({
      data: { name: "Invoice fixture", email: `${randomUUID()}@example.test`, role: "OWNER" },
    });
    const dealer = await db.dealership.create({
      data: { code: randomUUID(), name: "Fixture dealer", billingAddress: "Fixture address" },
    });
    const invoice = await db.dealerInvoice.create({
      data: {
        number: `FIXTURE-${randomUUID()}`,
        dealershipId: dealer.id,
        issueDate: businessDate(),
        dueDate: addDays(businessDate(), 30),
        subtotalCents: 1500,
        taxBps: 0,
        taxCents: 0,
        totalCents: 1500,
        snapshot: {},
        notes: "",
        createdBy: owner.id,
      },
    });
    return { owner, invoice };
  }

  it("persists an owner's confirmed send of their own draft and safely reconciles it twice", async () => {
    const { owner, invoice } = await draft();
    const input = {
      id: invoice.id,
      version: invoice.version,
      date: businessDate(),
      reference: "GMAIL:fixture-message",
    };
    const sent = await record(owner.id, input);
    expect(sent.state).toBe("SENT");
    expect(sent.approvedBy).toBe(owner.id);
    expect(sent.sentDate).toBe(businessDate());
    const persisted = await db.dealerInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(persisted.state).toBe("SENT");
    expect(persisted.deliveryReference).toBe(input.reference);
    expect((await record(owner.id, input)).version).toBe(sent.version);
    expect(
      await db.auditLog.count({ where: { entityId: invoice.id, action: "DEALER_INVOICE_SENT" } }),
    ).toBe(1);
  });

  it("retains the separate reviewer constraint for legacy approvals", async () => {
    const { owner, invoice } = await draft();
    await expect(
      db.dealerInvoice.update({
        where: { id: invoice.id },
        data: { state: "APPROVED", approvedBy: owner.id, approvedAt: new Date() },
      }),
    ).rejects.toThrow();
    expect((await db.dealerInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).state).toBe(
      "DRAFT",
    );
  });
});
