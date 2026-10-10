import { currentUser } from "@/lib/access";
import { exportPerformance } from "@/modules/station/performance";
import { BusinessError } from "@/modules/phase2";
export async function GET(request: Request) {
  const actor = await currentUser();
  try {
    const body = await exportPerformance(
      actor.id,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="quick-pass-performance.csv"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return new Response(
      e instanceof BusinessError
        ? e.message
        : "Unable to export. Check dates and station configuration.",
      {
        status: e instanceof BusinessError ? 403 : 400,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
