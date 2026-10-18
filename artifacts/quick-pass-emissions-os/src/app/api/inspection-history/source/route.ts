import { currentUser } from "@/lib/access";
import { historySourceReport } from "@/modules/station/history/service";
export async function GET(request: Request) {
  const actor = await currentUser(),
    q = new URL(request.url).searchParams;
  try {
    const body = await historySourceReport(actor.id, q.get("jobId") || "", q.get("windowId") || "");
    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": 'attachment; filename="original-vir-report.html.txt"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response("Owner access and a saved authorized VIR report are required.", {
      status: 403,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
