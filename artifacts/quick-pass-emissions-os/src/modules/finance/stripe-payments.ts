import { randomUUID } from "node:crypto";
import { Prisma, StripeInvoicePaymentState } from "@prisma/client";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { businessDate } from "@/lib/time";
import { db } from "@/lib/db";
import { readAsActor } from "@/lib/read-as-actor";
import { BusinessError, financeRoles, phase4, requireRule } from "../phase4";
import { receivable, sumCents } from "./rules";

type StripeObject = {
  id: string;
  status?: string;
  customer?: string | { id: string } | null;
  hosted_invoice_url?: string | null;
  amount_due?: number;
  amount_paid?: number;
  currency?: string;
  due_date?: number | null;
  status_transitions?: { paid_at?: number | null };
  metadata?: Record<string, string>;
};

type StripeEvent = {
  id: string;
  type: string;
  data?: { object?: { id?: string } };
};

type StripeWebhookEndpoint = {
  id: string;
  url: string;
  status: string;
  enabled_events: string[];
};

class StripePaymentApiError extends Error {
  constructor(readonly status: number) {
    super("Stripe payment request failed.");
  }
}

function connector() {
  return new ReplitConnectors();
}

async function stripeRequest<T>(
  path: string,
  method: "GET" | "POST" | "DELETE",
  params?: URLSearchParams,
  idempotencyKey?: string,
): Promise<T> {
  const response = await connector().proxy("stripe", path, {
    method,
    headers: {
      ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(params ? { body: params.toString() } : {}),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) throw new StripePaymentApiError(response.status);
  return body as T;
}

function form(values: Record<string, string | number | boolean>) {
  return new URLSearchParams(
    Object.entries(values).map(([key, value]) => [key, String(value)]),
  );
}

function dueTimestamp(date: string) {
  const timestamp = Date.parse(`${date}T12:00:00.000Z`);
  requireRule(Number.isFinite(timestamp), "Invoice due date is invalid.");
  return Math.floor(timestamp / 1000);
}

function invoiceBalance(invoice: {
  state: string;
  approvedAt: Date | null;
  totalCents: number;
  issueDate: string;
  dueDate: string;
  voidDate: string | null;
  payments: { amountCents: number; date: string }[];
}) {
  const summary = receivable(
    { ...invoice, state: invoice.approvedAt ? invoice.state : "DRAFT" },
    invoice.payments,
    businessDate(),
  );
  return invoice.state === "DRAFT"
    ? Math.max(0, invoice.totalCents - summary.paidCents)
    : summary.remainingCents;
}

function publicHost() {
  const value = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  requireRule(
    value && /^[A-Za-z0-9.-]+(?::\d+)?$/.test(value),
    "Stripe payment notifications are not configured for this app address.",
  );
  return value;
}

async function ensurePaymentWebhook() {
  const url = `https://${publicHost()}/api/invoices/stripe-webhook`;
  const endpoints = await stripeRequest<{ data: StripeWebhookEndpoint[] }>(
    "/v1/webhook_endpoints?limit=100",
    "GET",
  );
  const existing = endpoints.data.find(
    (endpoint) =>
      endpoint.url === url &&
      endpoint.status === "enabled" &&
      endpoint.enabled_events.includes("invoice.paid"),
  );
  if (existing) return;
  const params = new URLSearchParams();
  params.set("url", url);
  params.set("description", "Quick Pass invoice payment confirmation");
  params.set("enabled_events[0]", "invoice.paid");
  await stripeRequest<StripeWebhookEndpoint>("/v1/webhook_endpoints", "POST", params);
}

async function getOrCreateCustomer(input: {
  dealershipId: string;
  dealershipName: string;
  customerEmail: string;
  stripeCustomerId: string | null;
  requestId: string;
}) {
  if (input.stripeCustomerId) {
    try {
      return await stripeRequest<{ id: string }>(
        `/v1/customers/${encodeURIComponent(input.stripeCustomerId)}`,
        "POST",
        form({ name: input.dealershipName, email: input.customerEmail }),
      );
    } catch (error) {
      if (!(error instanceof StripePaymentApiError) || error.status !== 404) throw error;
    }
  }

  const query = new URLSearchParams({
    query: `metadata['quick_pass_dealership_id']:'${input.dealershipId}'`,
    limit: "1",
  });
  const matches = await stripeRequest<{ data: { id: string }[] }>(
    `/v1/customers/search?${query.toString()}`,
    "GET",
  );
  const customer =
    matches.data[0] ??
    (await stripeRequest<{ id: string }>(
      "/v1/customers",
      "POST",
      form({
        name: input.dealershipName,
        email: input.customerEmail,
        "metadata[quick_pass_dealership_id]": input.dealershipId,
      }),
      `qp-dealership-${input.dealershipId}`,
    ));
  if (matches.data[0])
    await stripeRequest(
      `/v1/customers/${encodeURIComponent(customer.id)}`,
      "POST",
      form({ name: input.dealershipName, email: input.customerEmail }),
    );
  return customer;
}

async function reservePaymentLink(
  actorId: string,
  invoiceId: string,
  customerEmail: string,
  allowUnsent: boolean,
) {
  return phase4(actorId, financeRoles, async (tx) => {
    const invoice = await tx.dealerInvoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true, dealership: true, stripePaymentLink: true },
    });
    requireRule(invoice, "Invoice not found.");
    requireRule(!invoice.archivedAt && invoice.state !== "VOIDED", "Restore this invoice before taking payment.");
    requireRule(
      allowUnsent
        ? invoice.state === "DRAFT" || invoice.state === "APPROVED"
        : invoice.state === "SENT",
      "Only a sent invoice can have an online payment link.",
    );
    const amountCents = invoiceBalance(invoice);
    requireRule(amountCents > 0, "This invoice has no unpaid balance.");
    const current = invoice.stripePaymentLink;
    if (current?.state === StripeInvoicePaymentState.PAID)
      throw new BusinessError("Stripe already recorded payment for this invoice.");
    if (current?.state === StripeInvoicePaymentState.CREATING)
      requireRule(
        current.updatedAt.getTime() < Date.now() - 5 * 60_000,
        "The Stripe payment page is still being prepared. Refresh and try again shortly.",
      );
    requireRule(
      current?.state !== StripeInvoicePaymentState.REVIEW,
      "Review the Stripe payment discrepancy before making another invoice change.",
    );
    const requestId = randomUUID();
    const link = await tx.dealerInvoicePaymentLink.upsert({
      where: { invoiceId },
      create: {
        invoiceId,
        requestId,
        amountCents,
        state: StripeInvoicePaymentState.CREATING,
        stripeCustomerId: invoice.dealership.stripeCustomerId,
      },
      update: {
        requestId,
        amountCents,
        state: StripeInvoicePaymentState.CREATING,
        stripeInvoiceId: null,
        hostedUrl: null,
        reviewReason: null,
        stripeCustomerId: invoice.dealership.stripeCustomerId,
      },
    });
    return {
      invoice,
      link,
      requestId,
      amountCents,
      dealership: invoice.dealership,
      customerEmail,
    };
  });
}

export async function createInvoicePaymentLink(
  actorId: string,
  invoiceId: string,
  customerEmail: string,
  allowUnsent = false,
) {
  const email = customerEmail.trim().toLowerCase();
  requireRule(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Enter the dealership billing email.");
  const existing = await readAsActor(actorId, financeRoles, (tx) =>
    tx.dealerInvoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true, stripePaymentLink: true },
    }),
  );
  requireRule(existing, "Invoice not found.");
  if (
    existing.stripePaymentLink?.state === StripeInvoicePaymentState.OPEN &&
    existing.stripePaymentLink.hostedUrl &&
    existing.stripePaymentLink.amountCents === invoiceBalance(existing)
  )
    return existing.stripePaymentLink;
  if (existing.stripePaymentLink?.state === StripeInvoicePaymentState.OPEN)
    await voidInvoicePaymentLink(actorId, invoiceId);

  const reservation = await reservePaymentLink(actorId, invoiceId, email, allowUnsent);
  let stripeInvoiceId: string | undefined;
  try {
    await ensurePaymentWebhook();
    const customer = await getOrCreateCustomer({
      dealershipId: reservation.dealership.id,
      dealershipName: reservation.dealership.name,
      customerEmail: email,
      stripeCustomerId: reservation.dealership.stripeCustomerId,
      requestId: reservation.requestId,
    });
    await phase4(actorId, financeRoles, async (tx) => {
      await tx.dealership.update({
        where: { id: reservation.dealership.id },
        data: { stripeCustomerId: customer.id },
      });
    });

    const metadata = {
      "metadata[quick_pass_invoice_id]": invoiceId,
      "metadata[quick_pass_invoice_number]": reservation.invoice.number,
      "metadata[quick_pass_payment_request_id]": reservation.requestId,
    };
    const stripeInvoice = await stripeRequest<StripeObject>(
      "/v1/invoices",
      "POST",
      form({
        customer: customer.id,
        collection_method: "send_invoice",
        due_date: dueTimestamp(reservation.invoice.dueDate),
        auto_advance: false,
        pending_invoice_items_behavior: "exclude",
        description: `Quick Pass Emissions invoice ${reservation.invoice.number}`,
        ...metadata,
      }),
      `qp-invoice-${reservation.requestId}`,
    );
    stripeInvoiceId = stripeInvoice.id;

    await stripeRequest(
      "/v1/invoiceitems",
      "POST",
      form({
        customer: customer.id,
        invoice: stripeInvoice.id,
        amount: reservation.amountCents,
        currency: "usd",
        description: `Outstanding balance for Quick Pass invoice ${reservation.invoice.number}`,
        "metadata[quick_pass_invoice_id]": invoiceId,
        "metadata[quick_pass_payment_request_id]": reservation.requestId,
      }),
      `qp-invoice-item-${reservation.requestId}`,
    );

    const finalized = await stripeRequest<StripeObject>(
      `/v1/invoices/${encodeURIComponent(stripeInvoice.id)}/finalize`,
      "POST",
      form({ auto_advance: false }),
    );
    requireRule(
      finalized.status === "open" &&
        finalized.currency === "usd" &&
        finalized.amount_due === reservation.amountCents &&
        !!finalized.hosted_invoice_url,
      "Stripe did not confirm the exact invoice balance.",
    );

    return await phase4(actorId, financeRoles, async (tx) => {
      const current = await tx.dealerInvoice.findUnique({
        where: { id: invoiceId },
        include: { payments: true, stripePaymentLink: true },
      });
      requireRule(
        current &&
          !current.archivedAt &&
          current.state !== "VOIDED" &&
          invoiceBalance(current) === reservation.amountCents &&
          current.stripePaymentLink?.requestId === reservation.requestId,
        "The invoice balance changed while Stripe prepared the payment page. Refresh it before sending.",
      );
      const saved = await tx.dealerInvoicePaymentLink.update({
        where: { invoiceId },
        data: {
          stripeInvoiceId: finalized.id,
          stripeCustomerId: customer.id,
          hostedUrl: finalized.hosted_invoice_url!,
          state: StripeInvoicePaymentState.OPEN,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "DEALER_INVOICE_STRIPE_LINK_CREATED",
          entityId: invoiceId,
          details: {
            invoiceNumber: current.number,
            amountCents: reservation.amountCents,
            stripeInvoiceId: finalized.id,
          },
        },
      });
      return saved;
    });
  } catch {
    if (stripeInvoiceId) {
      try {
        const remote = await stripeRequest<StripeObject>(
          `/v1/invoices/${encodeURIComponent(stripeInvoiceId)}`,
          "GET",
        );
        if (remote.status === "open")
          await stripeRequest(
            `/v1/invoices/${encodeURIComponent(stripeInvoiceId)}/void`,
            "POST",
            new URLSearchParams(),
          );
        else if (remote.status === "draft")
          await stripeRequest(`/v1/invoices/${encodeURIComponent(stripeInvoiceId)}`, "DELETE");
      } catch {
        // The saved CREATING state prevents a second link until the owner retries safely.
      }
    }
    await db.dealerInvoicePaymentLink.updateMany({
      where: { invoiceId, requestId: reservation.requestId, state: "CREATING" },
      data: {
        state: StripeInvoicePaymentState.FAILED,
        stripeInvoiceId,
        hostedUrl: null,
      },
    });
    throw new BusinessError(
      "Stripe could not prepare the exact-balance payment page. No invoice email was sent.",
    );
  }
}

async function reconcilePaidStripeInvoice(
  stripeInvoice: StripeObject,
  sourceEventId: string | null,
) {
  if (
    stripeInvoice.status !== "paid" ||
    stripeInvoice.currency !== "usd" ||
    !stripeInvoice.id ||
    !stripeInvoice.amount_paid ||
    !stripeInvoice.status_transitions?.paid_at
  )
    return "ignored" as const;

  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183504)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183505)`;
      const link = await tx.dealerInvoicePaymentLink.findUnique({
        where: { stripeInvoiceId: stripeInvoice.id },
        include: { invoice: { include: { payments: true } } },
      });
      if (!link) return "ignored" as const;
      if (
        stripeInvoice.metadata?.quick_pass_invoice_id !== link.invoiceId ||
        stripeInvoice.metadata?.quick_pass_payment_request_id !== link.requestId ||
        (typeof stripeInvoice.customer === "string"
          ? stripeInvoice.customer
          : stripeInvoice.customer?.id) !== link.stripeCustomerId
      )
        return "ignored" as const;
      const invoice = link.invoice;
      const currentBalance = invoiceBalance(invoice);
      if (
        link.state === StripeInvoicePaymentState.PAID &&
        (await tx.dealerPayment.findUnique({
          where: { stripeInvoiceId: stripeInvoice.id },
          select: { id: true },
        }))
      )
        return "duplicate" as const;
      if (
        link.state !== StripeInvoicePaymentState.OPEN ||
        invoice.state === "VOIDED" ||
        invoice.archivedAt ||
        stripeInvoice.amount_paid !== link.amountCents ||
        stripeInvoice.amount_due !== link.amountCents ||
        currentBalance !== link.amountCents
      ) {
        await tx.dealerInvoicePaymentLink.update({
          where: { invoiceId: link.invoiceId },
          data: {
            state: StripeInvoicePaymentState.REVIEW,
            reviewReason:
              "Stripe confirmed a payment, but the invoice balance or link status changed. Review Stripe and the invoice before recording it.",
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: null,
            action: "DEALER_INVOICE_STRIPE_PAYMENT_REVIEW",
            entityId: link.invoiceId,
            details: {
              stripeInvoiceId: stripeInvoice.id,
              eventId: sourceEventId,
              receivedCents: stripeInvoice.amount_paid,
              expectedCents: link.amountCents,
            },
          },
        });
        return "review" as const;
      }

      const paidDate = businessDate(new Date(stripeInvoice.status_transitions.paid_at * 1000));
      await tx.dealerPayment.create({
        data: {
          invoiceId: link.invoiceId,
          amountCents: stripeInvoice.amount_paid,
          date: paidDate,
          reference: `STRIPE:${stripeInvoice.id}`,
          evidence: `Stripe confirmed online payment for invoice ${invoice.number}.`,
          createdBy: "STRIPE",
          stripeInvoiceId: stripeInvoice.id,
        },
      });
      await tx.dealerInvoicePaymentLink.update({
        where: { invoiceId: link.invoiceId },
        data: { state: StripeInvoicePaymentState.PAID, reviewReason: null },
      });
      await tx.dealerInvoice.update({
        where: { id: link.invoiceId },
        data: {
          ...(invoice.state === "DRAFT"
            ? {
                state: "SENT",
                approvedAt: new Date(),
                approvedBy: invoice.createdBy,
                sentDate: paidDate,
                deliveryReference: `STRIPE:${stripeInvoice.id}`,
              }
            : {}),
          version: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: null,
          action: "DEALER_INVOICE_STRIPE_PAYMENT_RECORDED",
          entityId: link.invoiceId,
          details: {
            invoiceNumber: invoice.number,
            stripeInvoiceId: stripeInvoice.id,
            eventId: sourceEventId,
            amountCents: stripeInvoice.amount_paid,
            date: paidDate,
          },
        },
      });
      return "recorded" as const;
    },
    {
      maxWait: 10000,
      timeout: 30000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
}

export async function voidInvoicePaymentLink(actorId: string, invoiceId: string) {
  const link = await readAsActor(actorId, financeRoles, (tx) =>
    tx.dealerInvoicePaymentLink.findUnique({ where: { invoiceId } }),
  );
  if (link?.state === StripeInvoicePaymentState.REVIEW)
    throw new BusinessError("Review the Stripe payment discrepancy before changing this invoice.");
  if (!link || link.state !== StripeInvoicePaymentState.OPEN || !link.stripeInvoiceId) {
    requireRule(
      !link || link.state !== StripeInvoicePaymentState.CREATING,
      "A Stripe payment page is being prepared. Try again after it finishes.",
    );
    return;
  }
  const remote = await stripeRequest<StripeObject>(
    `/v1/invoices/${encodeURIComponent(link.stripeInvoiceId)}`,
    "GET",
  );
  if (remote.status === "paid") {
    await reconcilePaidStripeInvoice(remote, null);
    throw new BusinessError(
      "Stripe already received this payment. Refresh the invoice before recording another payment.",
    );
  }
  if (remote.status === "open")
    await stripeRequest(
      `/v1/invoices/${encodeURIComponent(link.stripeInvoiceId)}/void`,
      "POST",
      new URLSearchParams(),
    );
  else if (remote.status === "draft")
    await stripeRequest(`/v1/invoices/${encodeURIComponent(link.stripeInvoiceId)}`, "DELETE");
  await phase4(actorId, financeRoles, async (tx) => {
    const current = await tx.dealerInvoicePaymentLink.findUnique({ where: { invoiceId } });
    if (current?.stripeInvoiceId === link.stripeInvoiceId && current.state === "OPEN") {
      await tx.dealerInvoicePaymentLink.update({
        where: { invoiceId },
        data: { state: StripeInvoicePaymentState.VOID, hostedUrl: null },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "DEALER_INVOICE_STRIPE_LINK_VOIDED",
          entityId: invoiceId,
          details: { stripeInvoiceId: link.stripeInvoiceId },
        },
      });
    }
  });
}

export async function voidPaymentLinkForReceipt(actorId: string, paymentId: string) {
  const payment = await readAsActor(actorId, financeRoles, (tx) =>
    tx.dealerPayment.findUnique({
      where: { id: paymentId },
      select: { invoiceId: true, stripeInvoiceId: true },
    }),
  );
  requireRule(payment, "Payment not found.");
  requireRule(
    !payment.stripeInvoiceId,
    "Stripe payments must be refunded through Stripe before they can be reversed here.",
  );
  await voidInvoicePaymentLink(actorId, payment.invoiceId);
}

export async function receiveStripePaymentEvent(eventId: string) {
  if (!/^evt_[A-Za-z0-9]+$/.test(eventId)) throw new BusinessError("Invalid Stripe event.");
  const event = await stripeRequest<StripeEvent>(
    `/v1/events/${encodeURIComponent(eventId)}`,
    "GET",
  );
  if (event.id !== eventId || event.type !== "invoice.paid" || !event.data?.object?.id)
    return "ignored" as const;
  const invoice = await stripeRequest<StripeObject>(
    `/v1/invoices/${encodeURIComponent(event.data.object.id)}`,
    "GET",
  );
  return reconcilePaidStripeInvoice(invoice, event.id);
}
