import { NextResponse } from "next/server";
import { currentUser } from "@/lib/access";
import { personalWorkspace, mutatePersonalWorkspace } from "@/modules/personal/service";
import { z } from "zod";
import { previewTrustedOrigins } from "@/lib/auth-origins";

export async function GET() {
  const actor = await currentUser();
  return NextResponse.json(
    { data: await personalWorkspace(actor.id) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function POST(request: Request) {
  const actor = await currentUser();
  const origin = request.headers.get("origin");
  const trusted = new Set([
    new URL(request.url).origin,
    ...previewTrustedOrigins(process.env),
    ...(process.env.REPLIT_DEV_DOMAIN && process.env.NODE_ENV !== "production"
      ? [`https://${process.env.REPLIT_DEV_DOMAIN}`]
      : []),
    ...(process.env.BETTER_AUTH_URL ? [new URL(process.env.BETTER_AUTH_URL).origin] : []),
  ]);
  if (!origin || !trusted.has(origin)) {
    return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  }
  try {
    const data = await mutatePersonalWorkspace(actor.id, await request.json());
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues.map((i) => i.message).join(" ") },
        { status: 400 },
      );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save. Your changes have not been saved.",
      },
      {
        status:
          error instanceof Error && error.message.includes("changed in another session")
            ? 409
            : 400,
      },
    );
  }
}
