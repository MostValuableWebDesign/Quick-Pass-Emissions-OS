import { ReplitConnectors } from "@replit/connectors-sdk";
import { BusinessError } from "../phase4";

export type StripeInvoice = {
  id: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  customer: string;
  hosted_invoice_url: string | null;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  currency: string;
  paid_out_of_band?: boolean;
  status_transitions: { paid_at: number | null };
  metadata: Record<string, string>;
};

export function stripeForm(values: Record<string, string | number | boolean>) {
  return new URLSearchParams(Object.entries(values).map(([key, value]) => [key, String(value)]));
}

/** Uses the connected account; never copies a Stripe credential into the app. */
export async function stripeApi<T>(
  path: string,
  method: "GET" | "POST" | "DELETE",
  params?: URLSearchParams,
  idempotencyKey?: string,
): Promise<T> {
  const response = await new ReplitConnectors().proxy("stripe", path, {
    method,
    headers: {
      "Stripe-Version": "2025-06-30.basil",
      ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(params ? { body: params.toString() } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new BusinessError(
      "Stripe could not confirm this request. No payment was recorded. Try again shortly.",
    );
  return (await response.json()) as T;
}

export async function verifiedInvoicePayment(invoice: StripeInvoice) {
  if (invoice.status !== "paid" || invoice.paid_out_of_band) return null;
  const payments = await stripeApi<{
    has_more: boolean;
    data: {
      invoice: string;
      status: string;
      amount_paid: number;
      currency: string;
      payment: { type: string; payment_intent?: string };
    }[];
  }>(`/v1/invoice_payments?invoice=${encodeURIComponent(invoice.id)}&status=paid&limit=2`, "GET");
  if (payments.has_more || payments.data.length !== 1) return null;
  const payment = payments.data[0];
  if (
    payment.invoice !== invoice.id ||
    payment.status !== "paid" ||
    payment.currency !== "usd" ||
    payment.amount_paid !== invoice.amount_due ||
    payment.payment.type !== "payment_intent" ||
    !payment.payment.payment_intent
  )
    return null;
  const intent = await stripeApi<{
    id: string;
    status: string;
    amount_received: number;
    currency: string;
    customer: string;
  }>(`/v1/payment_intents/${encodeURIComponent(payment.payment.payment_intent)}`, "GET");
  return intent.status === "succeeded" &&
    intent.currency === "usd" &&
    intent.amount_received === invoice.amount_due &&
    intent.customer === invoice.customer
    ? intent.id
    : null;
}

export function paymentAppUrl() {
  // Runtime configuration only. Never derive an app URL from an incoming Host header.
  const value =
    process.env.OWNER_SUMMARY_APP_URL ||
    (process.env.REPLIT_DOMAINS?.split(",")[0]?.trim()
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}`
      : "");
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    )
      return url.origin;
  } catch {
    /* Fail explicitly below. */
  }
  throw new BusinessError("Set a public HTTPS app URL before adding invoice payment links.");
}

export async function ensurePaymentWebhook() {
  const url = `${paymentAppUrl()}/api/invoices/stripe-webhook`;
  const endpoints = await stripeApi<{
    data: { url: string; status: string; enabled_events: string[] }[];
  }>("/v1/webhook_endpoints?limit=100", "GET");
  if (
    endpoints.data.some(
      (endpoint) =>
        endpoint.url === url &&
        endpoint.status === "enabled" &&
        (endpoint.enabled_events.includes("invoice.paid") || endpoint.enabled_events.includes("*")),
    )
  )
    return;
  await stripeApi(
    "/v1/webhook_endpoints",
    "POST",
    stripeForm({
      url,
      description: "Quick Pass invoice payment confirmations",
      "enabled_events[0]": "invoice.paid",
    }),
    `qp-webhook-${new URL(url).hostname}`,
  );
}
