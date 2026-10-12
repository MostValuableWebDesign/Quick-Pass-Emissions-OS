import { currentUser } from "@/lib/access";
import { personalNotificationInbox } from "@/modules/automation/personal-reminders";
import { BusinessError } from "@/modules/phase2";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await currentUser();
  try {
    const inbox = await personalNotificationInbox(actor.id);
    return Response.json(inbox, {
      headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    const status = error instanceof BusinessError ? 403 : 500;
    return Response.json(
      { error: error instanceof BusinessError ? error.message : "Unable to load notifications." },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
