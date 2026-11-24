import { currentUser } from "@/lib/access";
import { expenseDate, expenseWorkspace } from "@/modules/personal/expense-service";
import { expenseError, expenseResponse } from "@/modules/personal/expense-http";
import { buildSpendingReport, spendingCsv } from "@/modules/personal/expense-rules";
export async function GET(request: Request) {
  const actor = await currentUser();
  try {
    const params = new URL(request.url).searchParams;
    const start = expenseDate.parse(params.get("start")),
      end = expenseDate.parse(params.get("end"));
    if (start > end) throw new Error("The end date must be on or after the start date.");
    const data = await expenseWorkspace(actor.id),
      report = buildSpendingReport(data.expenses, start, end);
    if (params.get("format") === "csv")
      return new Response(spendingCsv(report), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="quick-pass-expenses-${start}-${end}.csv"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    return expenseResponse({ report });
  } catch (error) {
    return expenseError(error);
  }
}
