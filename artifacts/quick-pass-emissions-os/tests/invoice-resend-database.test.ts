import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("Use an isolated test database.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

(enabled ? describe : describe.skip)("invoice resend safeguards", () => {
  let db: PrismaClient;
  let finance: typeof import("../src/modules/finance/service");
  let owner: string;
  let admin: string;
  let employee: string;
  let invoiceId: string;
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    finance = await import("../src/modules/finance/service");
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe('TRUNCATE "Dealership", "User" CASCADE');
    const makeUser = async (role: "OWNER" | "ADMIN" | "EMPLOYEE") =>
      (
        await db.user.create({
          data: { name: `Invoice test ${role}`, email: `${randomUUID()}@example.test`, role },
        })
      ).id;
    owner = await makeUser("OWNER");
    admin = await makeUser("ADMIN");
    employee = await makeUser("EMPLOYEE");
    const dealer = await db.dealership.create({
      data: {
        code: randomUUID(),
        name: "Resend test dealership",
        billingAddress: "Test only",
      },
    });
    const invoice = await db.dealerInvoice.create({
      data: {
        number: `QP-${today.slice(0, 4)}-${randomUUID().slice(0, 8)}`,
        dealershipId: dealer.id,
        issueDate: today,
        dueDate: today,
        state: "SENT",
        subtotalCents: 1500,
        taxBps: 0,
        taxCents: 0,
        totalCents: 1500,
        snapshot: { name: dealer.name, contacts: [] },
        notes: "",
        createdBy: owner,
        approvedBy: admin,
        approvedAt: new Date(),
        sentDate: today,
        deliveryReference: `GMAIL:${randomUUID()}`,
      },
    });
    invoiceId = invoice.id;
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("reconciles repeated submits, blocks uncertain duplicates, then records a confirmed resend", async () => {
    const requestId = randomUUID();
    const first = await finance.beginInvoiceResend(owner, {
      invoiceId,
      requestId,
      recipient: "billing@example.test, accounts@example.test",
    });
    expect(first.status).toBe("READY");
    expect(
      await finance.beginInvoiceResend(owner, {
        invoiceId,
        requestId,
        recipient: "billing@example.test, accounts@example.test",
      }),
    ).toMatchObject({ status: "RECONCILE", attempt: { id: first.attempt.id } });

    await finance.updateInvoiceResendFailure(owner, requestId, "UNCERTAIN");
    await expect(
      finance.beginInvoiceResend(owner, {
        invoiceId,
        requestId: randomUUID(),
        recipient: "billing@example.test, accounts@example.test",
      }),
    ).resolves.toMatchObject({ status: "RECONCILE", attempt: { id: first.attempt.id } });
    await expect(
      finance.resolveInvoiceResendNotSent(owner, {
        id: first.attempt.id,
        confirmNoEmail: "true",
      }),
    ).rejects.toThrow("Wait 90 seconds");

    await db.dealerInvoiceEmailResend.update({
      where: { id: first.attempt.id },
      data: { updatedAt: new Date(Date.now() - 120_000) },
    });
    await finance.resolveInvoiceResendNotSent(owner, {
      id: first.attempt.id,
      confirmNoEmail: "true",
    });
    const retryId = randomUUID();
    const retry = await finance.beginInvoiceResend(owner, {
      invoiceId,
      requestId: retryId,
      recipient: "billing@example.test, accounts@example.test",
    });
    expect(retry.status).toBe("READY");
    await finance.finishInvoiceResend(owner, {
      requestId: retryId,
      gmailMessageId: "gmail-resend-test",
    });
    expect(
      await finance.beginInvoiceResend(owner, {
        invoiceId,
        requestId: retryId,
        recipient: "billing@example.test, accounts@example.test",
      }),
    ).toMatchObject({ status: "SENT" });
    expect((await db.dealerInvoice.findUniqueOrThrow({ where: { id: invoiceId } })).state).toBe(
      "SENT",
    );
    expect(await db.dealerInvoiceEmailResend.count({ where: { invoiceId } })).toBe(2);
  });

  it("keeps resends limited to active sent invoices and management roles", async () => {
    const input = {
      invoiceId,
      requestId: randomUUID(),
      recipient: "billing@example.test",
    };
    await expect(finance.beginInvoiceResend(employee, input)).rejects.toThrow("permission");
    await db.dealerInvoice.update({ where: { id: invoiceId }, data: { archivedAt: new Date() } });
    await expect(
      finance.beginInvoiceResend(owner, { ...input, requestId: randomUUID() }),
    ).rejects.toThrow("active, previously sent");
  });
});
