import { currentUser } from "@/lib/access";
import { exportPayroll } from "@/modules/payroll/service";
import { BusinessError } from "@/modules/phase2";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await currentUser();
  try {
    const id = (await params).id;
    const csv = await exportPayroll(actor.id, id);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payroll-${id.replace(/[^a-zA-Z0-9_-]/g, "")}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof BusinessError)
      return new Response(error.message, {
        status: 403,
        headers: { "Cache-Control": "private, no-store" },
      });
    return new Response("Unable to export payroll.", {
      status: 500,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
