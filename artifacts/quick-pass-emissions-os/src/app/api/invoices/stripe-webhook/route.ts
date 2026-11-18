import { NextResponse } from "next/server";
import { receiveStripePaymentEvent } from "@/modules/finance/stripe-payments";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 100_000)
      return NextResponse.json({ error: "Event too large." }, { status: 413 });
    const body = JSON.parse(text) as { id?: unknown; data?: { object?: { id?: unknown } } };
    if (typeof body.id !== "string" || typeof body.data?.object?.id !== "string")
      return NextResponse.json({ error: "Invalid event." }, { status: 400 });
    const result = await receiveStripePaymentEvent(body.id, body.data.object.id);
    return NextResponse.json({ received: true, result });
  } catch {
    // Stripe retries provider errors; posted event contents are never trusted as payment proof.
    return NextResponse.json(
      { error: "Payment confirmation could not be checked." },
      { status: 503 },
    );
  }
}
