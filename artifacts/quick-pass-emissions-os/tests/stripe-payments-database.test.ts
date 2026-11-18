import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { StripeInvoice } from "@/modules/finance/stripe-api";

const provider = vi.hoisted(() => ({ proxy: vi.fn() }));
vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: class {
    proxy = provider.proxy;
  },
}));
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("Stripe verification requires an isolated _test database.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

(enabled ? describe : describe.skip)(
  "invoice-specific Stripe payments (isolated PostgreSQL)",
  () => {
    let db: PrismaClient;
    let payments: typeof import("@/modules/finance/stripe-payments");
    let finance: typeof import("@/modules/finance/service");
    let owner: string, outsider: string, invoiceId: string;
    const remote = new Map<string, StripeInvoice>();
    const idempotency = new Map<string, unknown>();
    const events = new Map<
      string,
      { id: string; type: string; data: { object: { id: string } } }
    >();
    let failVoid = false,
      failFinalize = false,
      loseInvoiceResponse = false,
      intentStatus = "succeeded";
    const date = "2026-11-18";
    const eventId = "evt_fixturepaid";

    beforeAll(async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-18T20:00:00Z"));
      vi.stubEnv("OWNER_SUMMARY_APP_URL", "https://payments.example.test");
      db = (await import("@/lib/db")).db;
      payments = await import("@/modules/finance/stripe-payments");
      finance = await import("@/modules/finance/service");
    });
    afterAll(() => {
      vi.unstubAllEnvs();
      vi.useRealTimers();
    });
    beforeEach(async () => {
      await db.$executeRawUnsafe('TRUNCATE "Dealership", "User" CASCADE');
      remote.clear();
      idempotency.clear();
      events.clear();
      failVoid = false;
      failFinalize = false;
      loseInvoiceResponse = false;
      intentStatus = "succeeded";
      owner = (
        await db.user.create({
          data: {
            name: "Payment fixture owner",
            email: `${randomUUID()}@example.test`,
            role: "OWNER",
          },
        })
      ).id;
      outsider = (
        await db.user.create({
          data: {
            name: "Payment fixture staff",
            email: `${randomUUID()}@example.test`,
            role: "EMPLOYEE",
          },
        })
      ).id;
      const dealer = await db.dealership.create({
        data: {
          code: randomUUID(),
          name: "Fixture dealer",
          billingAddress: "Fixture street",
        },
      });
      invoiceId = (
        await db.dealerInvoice.create({
          data: {
            number: `QP-2026-${randomUUID()}`,
            dealershipId: dealer.id,
            issueDate: date,
            dueDate: "2026-12-18",
            state: "SENT",
            approvedAt: new Date(),
            approvedBy: owner,
            sentDate: date,
            deliveryReference: "GMAIL:fixture",
            subtotalCents: 15000,
            taxBps: 0,
            taxCents: 0,
            totalCents: 15000,
            snapshot: { fixture: true },
            notes: "",
            createdBy: owner,
          },
        })
      ).id;
      provider.proxy.mockReset();
      provider.proxy.mockImplementation(
        async (service: string, path: string, init: RequestInit) => {
          expect(service).toBe("stripe");
          const params = new URLSearchParams(String(init.body ?? ""));
          const key = new Headers(init.headers).get("Idempotency-Key");
          if (key && idempotency.has(key)) return Response.json(idempotency.get(key));
          const url = new URL(path, "https://api.stripe.test");
          let result: unknown;
          if (path.startsWith("/v1/webhook_endpoints"))
            result = init.method === "GET" ? { data: [] } : { id: "we_fixture" };
          else if (path === "/v1/customers") result = { id: `cus_fixture${idempotency.size}` };
          else if (url.pathname === "/v1/invoices" && init.method === "GET")
            result = {
              has_more: false,
              data: [...remote.values()].filter(
                (invoice) => invoice.customer === url.searchParams.get("customer"),
              ),
            };
          else if (path === "/v1/invoices") {
            const id = `in_fixture${remote.size + 1}`;
            const invoice: StripeInvoice = {
              id,
              status: "draft",
              customer: params.get("customer")!,
              amount_due: 0,
              amount_paid: 0,
              amount_remaining: 0,
              currency: "usd",
              hosted_invoice_url: null,
              status_transitions: { paid_at: null },
              metadata: {
                quick_pass_invoice_id: params.get("metadata[quick_pass_invoice_id]")!,
                quick_pass_payment_request_id: params.get(
                  "metadata[quick_pass_payment_request_id]",
                )!,
              },
            };
            expect(params.get("auto_advance")).toBe("false");
            expect(params.get("collection_method")).toBe("send_invoice");
            remote.set(id, invoice);
            result = invoice;
          } else if (path === "/v1/invoiceitems") {
            const row = remote.get(params.get("invoice")!)!;
            row.amount_due += Number(params.get("amount"));
            row.amount_remaining = row.amount_due;
            result = { id: "ii_fixture" };
          } else if (url.pathname === "/v1/invoice_payments") {
            const invoice = remote.get(url.searchParams.get("invoice")!)!;
            result = {
              has_more: false,
              data: [
                {
                  invoice: invoice.id,
                  status: "paid",
                  amount_paid: invoice.amount_paid,
                  currency: invoice.currency,
                  payment: { type: "payment_intent", payment_intent: "pi_fixture" },
                },
              ],
            };
          } else if (path.startsWith("/v1/payment_intents/")) {
            const invoice = [...remote.values()].find((item) => item.status === "paid")!;
            result = {
              id: "pi_fixture",
              status: intentStatus,
              currency: "usd",
              customer: invoice.customer,
              amount_received: invoice.amount_paid,
            };
          } else if (path.startsWith("/v1/events/")) result = events.get(path.split("/").at(-1)!);
          else {
            const row = remote.get(path.split("/")[3])!;
            if (path.endsWith("/finalize")) {
              if (failFinalize) return Response.json({ error: "fixture failure" }, { status: 503 });
              row.status = "open";
              row.hosted_invoice_url = `https://invoice.stripe.com/i/${row.id}`;
            }
            if (path.endsWith("/void")) {
              if (failVoid || row.status === "paid")
                return Response.json({ error: "fixture failure" }, { status: 400 });
              row.status = "void";
            }
            if (init.method === "DELETE") row.status = "void";
            result = init.method === "DELETE" ? { id: row.id, deleted: true } : row;
          }
          if (key) idempotency.set(key, structuredClone(result));
          if (path === "/v1/invoices" && loseInvoiceResponse) {
            loseInvoiceResponse = false;
            throw new Error("Fixture lost invoice response");
          }
          return Response.json(result);
        },
      );
    });
    async function prepare() {
      await payments.createInvoicePaymentLink(owner, invoiceId);
      return (await db.dealerInvoice.findUniqueOrThrow({ where: { id: invoiceId } }))
        .stripePaymentToken!;
    }
    async function opened() {
      const token = await prepare();
      const url = await payments.startInvoicePayment(token);
      return { token, url, invoice: [...remote.values()].at(-1)! };
    }
    function paid(invoice: StripeInvoice) {
      invoice.status = "paid";
      invoice.amount_paid = invoice.amount_due;
      invoice.amount_remaining = 0;
      invoice.status_transitions.paid_at = Math.floor(Date.parse(`${date}T20:00:00Z`) / 1000);
      events.set(eventId, {
        id: eventId,
        type: "invoice.paid",
        data: { object: { id: invoice.id } },
      });
    }
    it("creates no payable Stripe page until a sent invoice's customer continues", async () => {
      const token = await prepare();
      expect(await payments.paymentLinkAvailable(token)).toBe(true);
      expect(remote.size).toBe(0);
      const url = await payments.startInvoicePayment(token);
      expect(url).toMatch(/^https:\/\/invoice.stripe.com\//);
      expect([...remote.values()][0].amount_due).toBe(15000);
      expect(await payments.startInvoicePayment(token)).toBe(url);
      expect(remote.size).toBe(1);
      expect(provider.proxy.mock.calls.some((call) => call[1].endsWith("/send"))).toBe(false);
    });
    it.each(["DRAFT", "VOIDED", "ARCHIVED", "PAID"] as const)(
      "refuses payable links for %s invoices",
      async (state) => {
        const token = await prepare();
        await db.dealerInvoice.update({
          where: { id: invoiceId },
          data:
            state === "ARCHIVED"
              ? { archivedAt: new Date() }
              : state === "PAID"
                ? {}
                : state === "DRAFT"
                  ? {
                      state,
                      approvedAt: null,
                      approvedBy: null,
                      sentDate: null,
                      deliveryReference: null,
                    }
                  : { state, voidDate: date, voidReason: "Fixture void" },
        });
        if (state === "PAID")
          await db.dealerPayment.create({
            data: {
              invoiceId,
              date,
              amountCents: 15000,
              reference: "already-paid",
              evidence: "Fixture",
              createdBy: owner,
            },
          });
        await expect(payments.createInvoicePaymentLink(owner, invoiceId)).rejects.toThrow();
        await expect(payments.startInvoicePayment(token)).rejects.toThrow();
        expect(await payments.paymentLinkAvailable(token)).toBe(false);
        expect(remote.size).toBe(0);
      },
    );
    it("lets a draft email contain a dormant link without creating a Stripe invoice", async () => {
      await db.dealerInvoice.update({
        where: { id: invoiceId },
        data: {
          state: "DRAFT",
          approvedAt: null,
          approvedBy: null,
          sentDate: null,
          deliveryReference: null,
        },
      });
      const link = await payments.prepareInvoicePaymentLink(owner, invoiceId);
      expect(link.hostedUrl).toContain("/api/invoices/pay/");
      expect(await payments.paymentLinkAvailable(link.hostedUrl.split("/").at(-1)!)).toBe(false);
      expect(remote.size).toBe(0);
    });
    it("keeps role checks on link creation and payment refresh", async () => {
      await expect(payments.createInvoicePaymentLink(outsider, invoiceId)).rejects.toThrow(
        "permission",
      );
      await expect(payments.refreshInvoicePayment(outsider, invoiceId)).rejects.toThrow(
        "permission",
      );
      expect(provider.proxy).not.toHaveBeenCalled();
    });
    it("uses the remaining amount after a manual partial payment and preserves reversals", async () => {
      const first = await opened();
      const receipt = await finance.recordDealerPayment(owner, {
        invoiceId,
        amountCents: 4500,
        date,
        reference: "check-fixture",
        evidence: "Confirmed fixture receipt",
      });
      expect(first.invoice.status).toBe("void");
      const nextUrl = await payments.startInvoicePayment(first.token);
      expect(nextUrl).not.toBe(first.url);
      expect([...remote.values()].at(-1)!.amount_due).toBe(10500);
      await finance.reverseDealerPayment(owner, {
        id: receipt.id,
        date,
        reference: "reversal-fixture",
        evidence: "Fixture reversal confirmed",
      });
      expect([...remote.values()].at(-1)!.status).toBe("void");
      expect((await db.dealerPayment.findMany()).reduce((sum, p) => sum + p.amountCents, 0)).toBe(
        0,
      );
    });
    it("does not change manual balances if Stripe cannot close the old page", async () => {
      await opened();
      failVoid = true;
      await expect(
        finance.recordDealerPayment(owner, {
          invoiceId,
          amountCents: 4500,
          date,
          reference: "blocked-fixture",
          evidence: "Fixture receipt",
        }),
      ).rejects.toThrow("Stripe");
      expect(await db.dealerPayment.count()).toBe(0);
    });
    it("closes an unpaid payment page when the invoice is archived", async () => {
      const { invoice, token } = await opened();
      await finance.setInvoiceArchived(owner, { id: invoiceId, version: 0, archived: true });
      expect(invoice.status).toBe("void");
      expect(await payments.paymentLinkAvailable(token)).toBe(false);
      expect(await db.dealerPayment.count()).toBe(0);
    });
    it("retries a failed finalize with the same request and no duplicate amount", async () => {
      const token = await prepare();
      failFinalize = true;
      await expect(payments.startInvoicePayment(token)).rejects.toThrow();
      expect(remote.size).toBe(1);
      await db.dealerInvoicePaymentLink.update({
        where: { invoiceId },
        data: { updatedAt: new Date(Date.now() - 100_000) },
      });
      failFinalize = false;
      await payments.startInvoicePayment(token);
      expect(remote.size).toBe(1);
      expect([...remote.values()][0].amount_due).toBe(15000);
    });
    it("rejects duplicate concurrent creation attempts", async () => {
      const token = await prepare();
      const results = await Promise.allSettled([
        payments.startInvoicePayment(token),
        payments.startInvoicePayment(token),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(remote.size).toBe(1);
    });
    it("records a verified payment once, including concurrent webhook delivery", async () => {
      const { invoice } = await opened();
      paid(invoice);
      const result = await Promise.all([
        payments.receiveStripePaymentEvent(eventId, invoice.id),
        payments.receiveStripePaymentEvent(eventId, invoice.id),
      ]);
      expect(result.sort()).toEqual(["duplicate", "recorded"]);
      expect(await db.dealerPayment.count()).toBe(1);
      expect(await db.dealerPayment.findFirst()).toMatchObject({
        amountCents: 15000,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: "pi_fixture",
      });
      expect(
        (await db.dealerInvoicePaymentLink.findUniqueOrThrow({ where: { invoiceId } })).state,
      ).toBe("PAID");
      await expect(
        finance.reverseDealerPayment(owner, {
          id: (await db.dealerPayment.findFirstOrThrow()).id,
          date,
          reference: "not-a-refund",
          evidence: "Fixture",
        }),
      ).rejects.toThrow("Stripe");
    });
    it("does not accept a fabricated or unrelated event as proof", async () => {
      const { invoice } = await opened();
      events.set(eventId, {
        id: eventId,
        type: "invoice.created",
        data: { object: { id: invoice.id } },
      });
      expect(await payments.receiveStripePaymentEvent(eventId, invoice.id)).toBe("ignored");
      expect(await payments.receiveStripePaymentEvent("invalid", invoice.id)).toBe("ignored");
      expect(await payments.receiveStripePaymentEvent(eventId, "in_other")).toBe("ignored");
      expect(await db.dealerPayment.count()).toBe(0);
    });
    it.each(["mismatch", "pending", "out-of-band"] as const)(
      "does not book %s payment evidence",
      async (change) => {
        const { invoice } = await opened();
        paid(invoice);
        if (change === "mismatch") invoice.amount_paid = 14900;
        if (change === "pending") intentStatus = "processing";
        if (change === "out-of-band") invoice.paid_out_of_band = true;
        expect(await payments.receiveStripePaymentEvent(eventId, invoice.id)).toBe("review");
        expect(await db.dealerPayment.count()).toBe(0);
        expect(
          (await db.dealerInvoicePaymentLink.findUniqueOrThrow({ where: { invoiceId } })).state,
        ).toBe("REVIEW");
      },
    );
    it("rejects an otherwise paid invoice with foreign Quick Pass metadata", async () => {
      const { invoice } = await opened();
      paid(invoice);
      invoice.metadata.quick_pass_invoice_id = "foreign-invoice";
      await expect(payments.receiveStripePaymentEvent(eventId, invoice.id)).rejects.toThrow(
        "identity",
      );
      expect(await db.dealerPayment.count()).toBe(0);
    });
    it("supports a manual provider-status check when a webhook is delayed", async () => {
      const { invoice, token } = await opened();
      paid(invoice);
      await payments.refreshInvoicePayment(owner, invoiceId);
      expect(await db.dealerPayment.count()).toBe(1);
      expect(await payments.paymentLinkAvailable(token)).toBe(false);
      await payments.refreshInvoicePayment(owner, invoiceId);
      expect(await db.dealerPayment.count()).toBe(1);
    });
    it("preserves cross-invoice receipt-reference uniqueness", async () => {
      const { invoice } = await opened();
      const original = await db.dealerInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
      const other = await db.dealerInvoice.create({
        data: {
          ...original,
          id: undefined,
          number: `QP-2026-${randomUUID()}`,
          stripePaymentToken: null,
          snapshot: { fixture: true },
        },
      });
      await db.dealerPayment.create({
        data: {
          invoiceId: other.id,
          date,
          amountCents: 1500,
          reference: `STRIPE:${invoice.id}`,
          evidence: "Fixture pre-existing receipt reference",
          createdBy: owner,
        },
      });
      paid(invoice);
      await expect(payments.receiveStripePaymentEvent(eventId, invoice.id)).rejects.toThrow(
        "reference",
      );
      expect(await db.dealerPayment.count({ where: { invoiceId } })).toBe(0);
    });
    it("safely cancels failed preparation before accepting a manual receipt", async () => {
      const token = await prepare();
      failFinalize = true;
      await expect(payments.startInvoicePayment(token)).rejects.toThrow();
      await db.dealerInvoicePaymentLink.update({
        where: { invoiceId },
        data: { updatedAt: new Date(Date.now() - 100_000) },
      });
      await payments.cancelInvoicePaymentLink(owner, invoiceId);
      expect([...remote.values()][0].status).toBe("void");
      expect(await payments.paymentLinkAvailable(token)).toBe(false);
      await finance.recordDealerPayment(owner, {
        invoiceId,
        amountCents: 15000,
        date,
        reference: "cancelled-to-check",
        evidence: "Fixture confirmed check",
      });
      expect(await db.dealerPayment.count()).toBe(1);
    });
    it("recovers cancellation when Stripe voided a still-CREATING invoice", async () => {
      const token = await prepare();
      failFinalize = true;
      await expect(payments.startInvoicePayment(token)).rejects.toThrow();
      [...remote.values()][0].status = "void";
      await db.dealerInvoicePaymentLink.update({
        where: { invoiceId },
        data: { updatedAt: new Date(Date.now() - 100_000) },
      });
      await payments.cancelInvoicePaymentLink(owner, invoiceId);
      expect(
        (await db.dealerInvoicePaymentLink.findUniqueOrThrow({ where: { invoiceId } })).state,
      ).toBe("VOID");
      await finance.setInvoiceArchived(owner, { id: invoiceId, version: 0, archived: true });
      expect(
        (await db.dealerInvoice.findUniqueOrThrow({ where: { id: invoiceId } })).archivedAt,
      ).not.toBeNull();
    });
    it("finds and closes a remote invoice after its create response was lost", async () => {
      const token = await prepare();
      loseInvoiceResponse = true;
      await expect(payments.startInvoicePayment(token)).rejects.toThrow();
      const request = await db.dealerInvoicePaymentLink.findUniqueOrThrow({ where: { invoiceId } });
      expect(request.stripeInvoiceId).toBeNull();
      expect(request.stripeCustomerId).toBeTruthy();
      expect(remote.size).toBe(1);
      await db.dealerInvoicePaymentLink.update({
        where: { invoiceId },
        data: { updatedAt: new Date(Date.now() - 100_000) },
      });
      await payments.cancelInvoicePaymentLink(owner, invoiceId);
      expect([...remote.values()][0].status).toBe("void");
      expect(
        (await db.dealerInvoicePaymentLink.findUniqueOrThrow({ where: { invoiceId } }))
          .stripeInvoiceId,
      ).toBe([...remote.values()][0].id);
    });
    it("does not release the invoice when cancellation discovers a paid request", async () => {
      const { invoice } = await opened();
      paid(invoice);
      await expect(payments.cancelInvoicePaymentLink(owner, invoiceId)).rejects.toThrow(
        "already received",
      );
      expect(
        (await db.dealerInvoicePaymentLink.findUniqueOrThrow({ where: { invoiceId } })).state,
      ).toBe("OPEN");
    });
  },
);
