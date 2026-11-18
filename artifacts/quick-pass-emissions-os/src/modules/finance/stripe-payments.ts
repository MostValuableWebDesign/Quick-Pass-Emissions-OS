import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { DealerInvoice, DealerPayment, DealerInvoicePaymentLink } from "@prisma/client";
import { db } from "@/lib/db";
import { businessDate } from "@/lib/time";
import { readAsActor } from "@/lib/read-as-actor";
import { uniqueReceiptReference } from "./references";
import { BusinessError, financeRoles, phase4, requireRule, type Tx } from "../phase4";
import {
  ensurePaymentWebhook,
  paymentAppUrl,
  stripeApi,
  stripeForm,
  verifiedInvoicePayment,
  type StripeInvoice,
} from "./stripe-api";

export function remainingInvoiceCents(
  invoice: Pick<DealerInvoice, "totalCents"> & {
    payments: Pick<DealerPayment, "amountCents">[];
  },
) {
  return (
    invoice.totalCents - invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0)
  );
}

function payable(invoice: DealerInvoice & { payments: DealerPayment[] }) {
  requireRule(
    invoice.state === "SENT" &&
      !!invoice.approvedAt &&
      !invoice.archivedAt &&
      remainingInvoiceCents(invoice) > 0,
    "This invoice is not available for online payment. Contact Quick Pass Emissions.",
  );
}

/** Draft email preparation creates only an unpayable app URL, not a Stripe invoice. */
export async function prepareInvoicePaymentLink(actorId: string, invoiceId: string) {
  const origin = paymentAppUrl();
  const token = await phase4(actorId, financeRoles, async (tx) => {
    const invoice = await tx.dealerInvoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true },
    });
    requireRule(
      invoice &&
        !invoice.archivedAt &&
        invoice.state !== "VOIDED" &&
        remainingInvoiceCents(invoice) > 0,
      "Only an active invoice with an unpaid balance can receive a payment link.",
    );
    if (invoice.stripePaymentToken) return invoice.stripePaymentToken;
    const token = randomUUID() + randomUUID();
    await tx.dealerInvoice.update({
      where: { id: invoiceId },
      data: { stripePaymentToken: token },
    });
    return token;
  });
  // Runs only from an explicit owner action; no email or charge is sent by Stripe.
  await ensurePaymentWebhook();
  return { hostedUrl: `${origin}/api/invoices/pay/${token}` };
}

export async function createInvoicePaymentLink(actorId: string, invoiceId: string) {
  await readAsActor(actorId, financeRoles, async (tx) => {
    const invoice = await tx.dealerInvoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true },
    });
    requireRule(invoice, "Invoice not found.");
    payable(invoice);
  });
  return prepareInvoicePaymentLink(actorId, invoiceId);
}

async function paymentWrite<T>(work: (tx: Tx) => Promise<T>) {
  return db.$transaction(
    async (tx) => {
      // Match the existing finance mutation lock order. Read-only pages never use these.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183504)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183505)`;
      return work(tx);
    },
    {
      maxWait: 10000,
      timeout: 30000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
}

async function preparationStep<T>(
  invoiceId: string,
  requestId: string,
  work: (tx: Tx, link: DealerInvoicePaymentLink) => Promise<T>,
) {
  return paymentWrite(async (tx) => {
    const link = await tx.dealerInvoicePaymentLink.findUnique({ where: { invoiceId } });
    requireRule(
      link?.state === "CREATING" && link.requestId === requestId,
      "This payment request was cancelled or changed. Open the invoice again.",
    );
    return work(tx, link);
  });
}

export async function paymentLinkAvailable(token: string) {
  if (!/^[a-f0-9-]{72}$/.test(token)) return false;
  const invoice = await db.dealerInvoice.findUnique({
    where: { stripePaymentToken: token },
    include: { payments: true },
  });
  if (!invoice) return false;
  try {
    payable(invoice);
    return true;
  } catch {
    return false;
  }
}

/** No payer inputs can choose the invoice, amount, currency, or dealership. */
export async function startInvoicePayment(token: string) {
  requireRule(/^[a-f0-9-]{72}$/.test(token), "This payment link is unavailable.");
  const reservation = await paymentWrite(async (tx) => {
    const invoice = await tx.dealerInvoice.findUnique({
      where: { stripePaymentToken: token },
      include: { payments: true, dealership: true, stripePaymentLink: true },
    });
    requireRule(invoice, "This payment link is unavailable.");
    payable(invoice);
    const current = invoice.stripePaymentLink;
    requireRule(
      current?.state !== "REVIEW",
      "This payment needs review. Contact Quick Pass Emissions.",
    );
    if (current?.state === "OPEN") {
      requireRule(
        current.amountCents === remainingInvoiceCents(invoice),
        "The balance changed. Contact Quick Pass Emissions.",
      );
      return { invoice, link: current, reuse: true };
    }
    requireRule(current?.state !== "PAID", "Payment has already been received.");
    if (current?.state === "CREATING") {
      requireRule(
        current.updatedAt.getTime() < Date.now() - 90_000,
        "The payment page is being prepared. Please try again in a moment.",
      );
      requireRule(
        !!current.stripeInvoiceId ||
          current.requestStartedAt.getTime() > Date.now() - 23 * 3600_000,
        "This payment request needs review. Contact Quick Pass Emissions.",
      );
      await tx.dealerInvoicePaymentLink.update({
        where: { invoiceId: invoice.id },
        data: { state: "CREATING" },
      });
      return { invoice, link: current, reuse: false };
    }
    const link = await tx.dealerInvoicePaymentLink.upsert({
      where: { invoiceId: invoice.id },
      create: {
        invoiceId: invoice.id,
        amountCents: remainingInvoiceCents(invoice),
        requestId: randomUUID(),
      },
      update: {
        amountCents: remainingInvoiceCents(invoice),
        requestId: randomUUID(),
        requestStartedAt: new Date(),
        state: "CREATING",
        stripeInvoiceId: null,
        stripeCustomerId: null,
        hostedUrl: null,
        reviewReason: null,
      },
    });
    return { invoice, link, reuse: false };
  });
  const { invoice, link } = reservation;
  if (reservation.reuse) {
    const remote = await stripeApi<StripeInvoice>(`/v1/invoices/${link.stripeInvoiceId}`, "GET");
    if (remote.status === "paid") {
      await reconcilePaidStripeInvoice(remote, null);
      throw new BusinessError("Payment has already been received.");
    }
    if (remote.status === "void") {
      await paymentWrite(async (tx) => {
        await tx.dealerInvoicePaymentLink.updateMany({
          where: { invoiceId: invoice.id, requestId: link.requestId, state: "OPEN" },
          data: { state: "VOID", hostedUrl: null },
        });
      });
      return startInvoicePayment(token);
    }
    requireRule(
      remote.status === "open" &&
        remote.amount_due === link.amountCents &&
        remote.amount_paid === 0 &&
        remote.amount_remaining === link.amountCents &&
        remote.currency === "usd" &&
        remote.hosted_invoice_url,
      "This payment page is unavailable. Contact Quick Pass Emissions.",
    );
    return remote.hosted_invoice_url;
  }
  const requestId = link.requestId;
  const customerId = await preparationStep(invoice.id, requestId, async (tx, current) => {
    if (current.stripeCustomerId) return current.stripeCustomerId;
    const customer = await stripeApi<{ id: string }>(
      "/v1/customers",
      "POST",
      stripeForm({
        name: invoice.dealership.name,
        "metadata[quick_pass_invoice_id]": invoice.id,
      }),
      `qp-customer-${requestId}`,
    );
    await tx.dealerInvoicePaymentLink.update({
      where: { invoiceId: invoice.id },
      data: { stripeCustomerId: customer.id },
    });
    return customer.id;
  });
  let remote = await preparationStep(invoice.id, requestId, async (tx, current) => {
    if (current.stripeInvoiceId)
      return stripeApi<StripeInvoice>(`/v1/invoices/${current.stripeInvoiceId}`, "GET");
    const created = await stripeApi<StripeInvoice>(
      "/v1/invoices",
      "POST",
      stripeForm({
        customer: customerId,
        collection_method: "send_invoice",
        auto_advance: false,
        // Past-due Quick Pass invoices remain due immediately. Original terms are not changed.
        due_date: Math.max(
          Math.floor(Date.parse(`${invoice.dueDate}T23:59:59Z`) / 1000),
          Math.floor(link.requestStartedAt.getTime() / 1000) + 86400,
        ),
        pending_invoice_items_behavior: "exclude",
        "payment_settings[payment_method_types][0]": "card",
        description: `Payment for Quick Pass invoice ${invoice.number} (original due date ${invoice.dueDate})`,
        "metadata[quick_pass_invoice_id]": invoice.id,
        "metadata[quick_pass_payment_request_id]": requestId,
      }),
      `qp-invoice-${requestId}`,
    );
    await tx.dealerInvoicePaymentLink.update({
      where: { invoiceId: invoice.id },
      data: { stripeInvoiceId: created.id },
    });
    return created;
  });
  if (remote.status === "draft") {
    if (remote.amount_due === 0) {
      await preparationStep(invoice.id, requestId, async () =>
        stripeApi(
          "/v1/invoiceitems",
          "POST",
          stripeForm({
            customer: customerId,
            invoice: remote.id,
            amount: link.amountCents,
            currency: "usd",
            description: `Unpaid balance — Quick Pass invoice ${invoice.number}`,
          }),
          `qp-invoice-item-${requestId}`,
        ),
      );
    } else {
      requireRule(
        remote.amount_due === link.amountCents,
        "Stripe's balance needs review. Contact Quick Pass Emissions.",
      );
    }
  }
  remote = await preparationStep(invoice.id, requestId, async (tx) => {
    if (remote.status === "draft")
      remote = await stripeApi<StripeInvoice>(
        `/v1/invoices/${remote.id}/finalize`,
        "POST",
        stripeForm({ auto_advance: false }),
        `qp-finalize-${requestId}`,
      );
    requireRule(
      remote.status === "open" &&
        remote.currency === "usd" &&
        remote.amount_due === link.amountCents &&
        remote.amount_remaining === link.amountCents &&
        remote.amount_paid === 0 &&
        remote.hosted_invoice_url?.startsWith("https://invoice.stripe.com/"),
      "Stripe could not confirm the exact unpaid balance. Contact Quick Pass Emissions.",
    );
    const latest = await tx.dealerInvoice.findUnique({
      where: { id: invoice.id },
      include: { payments: true, stripePaymentLink: true },
    });
    requireRule(latest, "Invoice not found.");
    payable(latest);
    requireRule(
      latest.stripePaymentLink?.requestId === requestId &&
        latest.stripePaymentLink.state === "CREATING" &&
        remainingInvoiceCents(latest) === link.amountCents,
      "The invoice changed. Contact Quick Pass Emissions.",
    );
    await tx.dealerInvoicePaymentLink.update({
      where: { invoiceId: invoice.id },
      data: { state: "OPEN", hostedUrl: remote.hosted_invoice_url },
    });
    await tx.auditLog.create({
      data: {
        action: "DEALER_INVOICE_STRIPE_LINK_CREATED",
        entityId: invoice.id,
        details: { stripeInvoiceId: remote.id, amountCents: link.amountCents },
      },
    });
    return remote;
  });
  return remote.hosted_invoice_url!;
}

/** The event body never constitutes proof: fetch both event and invoice from the connected account. */
export async function receiveStripePaymentEvent(eventId: string, invoiceId: string) {
  if (!/^evt_[A-Za-z0-9]+$/.test(eventId) || !/^in_[A-Za-z0-9]+$/.test(invoiceId)) return "ignored";
  if (!(await db.dealerInvoicePaymentLink.findUnique({ where: { stripeInvoiceId: invoiceId } })))
    return "ignored";
  const event = await stripeApi<{
    id: string;
    type: string;
    data: { object: { id: string } };
  }>(`/v1/events/${eventId}`, "GET");
  if (event.id !== eventId || event.type !== "invoice.paid" || event.data.object.id !== invoiceId)
    return "ignored";
  const remote = await stripeApi<StripeInvoice>(`/v1/invoices/${invoiceId}`, "GET");
  return reconcilePaidStripeInvoice(remote, event.id);
}

async function reconcilePaidStripeInvoice(remote: StripeInvoice, eventId: string | null) {
  if (remote.status !== "paid") return "ignored";
  const intentId = await verifiedInvoicePayment(remote);
  return paymentWrite(async (tx) => {
    const link = await tx.dealerInvoicePaymentLink.findUnique({
      where: { stripeInvoiceId: remote.id },
      include: { invoice: { include: { payments: true } } },
    });
    if (!link) return "ignored";
    if (await tx.dealerPayment.findUnique({ where: { stripeInvoiceId: remote.id } }))
      return "duplicate";
    requireRule(
      remote.metadata.quick_pass_invoice_id === link.invoiceId &&
        remote.metadata.quick_pass_payment_request_id === link.requestId &&
        remote.customer === link.stripeCustomerId,
      "Stripe payment identity does not match the saved request.",
    );
    const invoice = link.invoice;
    if (
      !["CREATING", "OPEN"].includes(link.state) ||
      invoice.state !== "SENT" ||
      invoice.archivedAt ||
      !invoice.approvedAt ||
      remote.currency !== "usd" ||
      remote.amount_due !== link.amountCents ||
      remote.amount_paid !== link.amountCents ||
      remote.amount_remaining !== 0 ||
      !intentId ||
      !Number.isSafeInteger(remote.status_transitions.paid_at) ||
      !remote.status_transitions.paid_at ||
      remainingInvoiceCents(invoice) !== link.amountCents
    ) {
      await tx.dealerInvoicePaymentLink.update({
        where: { invoiceId: invoice.id },
        data: {
          state: "REVIEW",
          hostedUrl: null,
          reviewReason:
            "Stripe received payment, but its amount or invoice status needs review. No receipt was added.",
        },
      });
      await tx.auditLog.create({
        data: {
          action: "DEALER_INVOICE_STRIPE_PAYMENT_REVIEW",
          entityId: invoice.id,
          details: { stripeInvoiceId: remote.id, eventId },
        },
      });
      return "review";
    }
    const date = businessDate(new Date(remote.status_transitions.paid_at * 1000));
    await uniqueReceiptReference(tx, `STRIPE:${remote.id}`);
    await tx.dealerPayment.create({
      data: {
        invoiceId: invoice.id,
        amountCents: link.amountCents,
        date,
        reference: `STRIPE:${remote.id}`,
        evidence: `Stripe-confirmed payment for ${invoice.number}.`,
        createdBy: "STRIPE",
        stripeInvoiceId: remote.id,
        stripePaymentIntentId: intentId,
      },
    });
    await tx.dealerInvoicePaymentLink.update({
      where: { invoiceId: invoice.id },
      data: { state: "PAID", hostedUrl: null },
    });
    await tx.dealerInvoice.update({
      where: { id: invoice.id },
      data: { version: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        action: "DEALER_INVOICE_STRIPE_PAYMENT_RECORDED",
        entityId: invoice.id,
        details: { stripeInvoiceId: remote.id, eventId, amountCents: link.amountCents, date },
      },
    });
    return "recorded";
  });
}

/** Must run in the same locked mutation as the balance or lifecycle change. */
export async function closeInvoicePaymentLink(tx: Tx, invoiceId: string) {
  const link = await tx.dealerInvoicePaymentLink.findUnique({ where: { invoiceId } });
  if (!link || link.state === "VOID" || link.state === "PAID") return;
  requireRule(link.state !== "REVIEW", "This Stripe payment needs review before making changes.");
  if (link.state === "CREATING")
    requireRule(
      link.updatedAt.getTime() < Date.now() - 90_000,
      "The payment request may still be running. Wait 90 seconds, then cancel or try again.",
    );
  let remote: StripeInvoice | undefined;
  if (link.stripeInvoiceId)
    remote = await stripeApi<StripeInvoice>(`/v1/invoices/${link.stripeInvoiceId}`, "GET");
  else if (link.stripeCustomerId) {
    // An invoice create may have succeeded while its response was lost. Use the saved,
    // request-specific customer and exact metadata; never assume an absent local ID means unpaid.
    const found = await stripeApi<{ has_more: boolean; data: StripeInvoice[] }>(
      `/v1/invoices?customer=${encodeURIComponent(link.stripeCustomerId)}&limit=100`,
      "GET",
    );
    const matches = found.data.filter(
      (invoice) =>
        invoice.metadata.quick_pass_invoice_id === invoiceId &&
        invoice.metadata.quick_pass_payment_request_id === link.requestId,
    );
    requireRule(
      !found.has_more && matches.length <= 1,
      "Stripe's request history needs review before cancellation.",
    );
    remote = matches[0];
  }
  // No saved customer means preparation never passed its separately committed first
  // step, so no provider invoice could be created. The finance lock fences old workers.
  if (remote) {
    requireRule(
      remote.customer === link.stripeCustomerId &&
        remote.metadata.quick_pass_invoice_id === invoiceId &&
        remote.metadata.quick_pass_payment_request_id === link.requestId,
      "Stripe payment identity needs review before cancellation.",
    );
    requireRule(
      remote.status !== "paid" && remote.amount_paid === 0,
      "Stripe already received a payment. Refresh payment status before recording another receipt.",
    );
    if (remote.status === "draft") {
      const deleted = await stripeApi<{ deleted: boolean }>(`/v1/invoices/${remote.id}`, "DELETE");
      requireRule(deleted.deleted, "Stripe did not confirm cancellation.");
    } else if (remote.status === "open" || remote.status === "uncollectible") {
      const closed = await stripeApi<StripeInvoice>(
        `/v1/invoices/${remote.id}/void`,
        "POST",
        stripeForm({}),
        `qp-void-${link.requestId}`,
      );
      requireRule(closed.status === "void", "Stripe did not confirm cancellation.");
    } else
      requireRule(
        remote.status === "void",
        "Review this Stripe payment before changing the invoice.",
      );
  }
  await tx.dealerInvoicePaymentLink.update({
    where: { invoiceId },
    data: { state: "VOID", hostedUrl: null, ...(remote ? { stripeInvoiceId: remote.id } : {}) },
  });
  await tx.auditLog.create({
    data: {
      action: "DEALER_INVOICE_STRIPE_LINK_VOIDED",
      entityId: invoiceId,
      details: { stripeInvoiceId: remote?.id ?? link.stripeInvoiceId },
    },
  });
}

export async function cancelInvoicePaymentLink(actorId: string, invoiceId: string) {
  return phase4(actorId, financeRoles, async (tx) => {
    const invoice = await tx.dealerInvoice.findUnique({ where: { id: invoiceId } });
    requireRule(invoice, "Invoice not found.");
    await closeInvoicePaymentLink(tx, invoiceId);
    await tx.dealerInvoice.update({
      where: { id: invoiceId },
      data: { stripePaymentToken: null },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "DEALER_INVOICE_ONLINE_PAYMENT_CANCELLED",
        entityId: invoiceId,
        details: { invoiceNumber: invoice.number },
      },
    });
  });
}

export async function refreshInvoicePayment(actorId: string, invoiceId: string) {
  const link = await readAsActor(actorId, financeRoles, (tx) =>
    tx.dealerInvoicePaymentLink.findUnique({ where: { invoiceId } }),
  );
  if (!link?.stripeInvoiceId) return;
  const remote = await stripeApi<StripeInvoice>(`/v1/invoices/${link.stripeInvoiceId}`, "GET");
  await reconcilePaidStripeInvoice(remote, null);
}
