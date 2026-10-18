import { currentUser } from "@/lib/access";
import { windowErrorReport } from "@/modules/station/history/service";
import { csvCell } from "@/modules/payroll/calculations";
export async function GET(request: Request) {
  const actor = await currentUser(),
    q = new URL(request.url).searchParams;
  try {
    const rows = await windowErrorReport(actor.id, q.get("jobId") || "", q.get("windowId") || "");
    const body = [
      ["Source row", "Decision", "Reason", "Canonical inspection"],
      ...rows.map((r) => [
        String(r.rowNumber),
        r.identityReview ? "IDENTIFIER_REVIEW" : r.status,
        r.reason || "",
        r.recordId || "",
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="inspection-history-errors.csv"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Owner access and an authorized import window are required.", {
      status: 403,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
