import { z } from "zod";
import { currentUser } from "@/lib/access";
import { exportOperational } from "@/modules/automation/reports";
import { BusinessError } from "@/modules/phase2";
export async function GET(request: Request) {
  const actor = await currentUser();
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const body = await exportOperational(actor.id, query);
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="quick-pass-operational-report.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return new Response(
      error instanceof BusinessError ? error.message : "Unable to export the selected report.",
      {
        status: error instanceof BusinessError ? 403 : error instanceof z.ZodError ? 400 : 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
