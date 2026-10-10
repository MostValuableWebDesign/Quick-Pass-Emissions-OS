import { z } from "zod";
import { currentUser } from "@/lib/access";
import { exportFinance } from "@/modules/finance/service";
import { BusinessError } from "@/modules/phase4";
export async function GET(request: Request) {
  const actor = await currentUser();
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const csv = await exportFinance(actor.id, query);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="quick-pass-${query.dataset}-${query.start}-${query.end}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return new Response(
      error instanceof BusinessError
        ? error.message
        : error instanceof z.ZodError
          ? "Invalid export selection or dates."
          : "Unable to export finance records.",
      {
        status: error instanceof BusinessError ? 403 : error instanceof z.ZodError ? 400 : 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
