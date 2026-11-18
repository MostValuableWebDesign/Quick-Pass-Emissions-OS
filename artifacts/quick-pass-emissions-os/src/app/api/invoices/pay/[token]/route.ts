import { paymentLinkAvailable, startInvoicePayment } from "@/modules/finance/stripe-payments";
import { paymentPage as page, paymentPageHeaders as headers } from "@/modules/finance/payment-page";

export const runtime = "nodejs";

type Context = { params: Promise<{ token: string }> };
export async function GET(_request: Request, { params }: Context) {
  const available = await paymentLinkAvailable((await params).token);
  // Opening/scanning the email alone never creates a Stripe invoice.
  return new Response(page(available), { status: available ? 200 : 410, headers });
}
export async function POST(_request: Request, { params }: Context) {
  const token = (await params).token;
  try {
    const url = await startInvoicePayment(token);
    return new Response(null, {
      status: 303,
      headers: {
        Location: url,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    const available = await paymentLinkAvailable(token);
    return new Response(page(available, true), { status: available ? 503 : 410, headers });
  }
}
