import { NextResponse } from "next/server";
import { receiveStripePaymentEvent } from "@/modules/finance/stripe-payments";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let eventId = "";
  try {
    const body = (await request.json()) as { id?: unknown };
    if (typeof body.id !== "string")
      return NextResponse.json({ error: "Invalid event." }, { status: 400 });
    eventId = body.id;
    const result = await receiveStripePaymentEvent(eventId);
    return NextResponse.json({ received: true, result });
  } catch {
    // Stripe retries provider errors; posted event contents are never trusted as payment proof.
    return NextResponse.json({ error: "Payment confirmation could not be checked." }, { status: 503 });
  }
}
