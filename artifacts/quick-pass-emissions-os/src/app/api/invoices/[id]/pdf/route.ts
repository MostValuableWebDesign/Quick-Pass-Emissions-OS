import { currentUser } from "@/lib/access";
import { businessDate } from "@/lib/time";
import { invoiceDetail } from "@/modules/finance/service";
import { receivable } from "@/modules/finance/rules";
import { invoiceSnapshotSchema } from "@/modules/finance/invoice-document";
import { createInvoicePdf } from "@/modules/finance/invoice-pdf";
import { BusinessError } from "@/modules/phase4";

export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await currentUser();
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const data = await invoiceDetail(actor.id, (await params).id);
    const invoice = data.invoice;
    if (!invoice) return new Response("Invoice not found.", { status: 404, headers });
    const summary = receivable(
      { ...invoice, state: invoice.approvedAt ? invoice.state : "DRAFT" },
      invoice.payments,
      businessDate(),
    );
    const bytes = await createInvoicePdf({
      ...invoice,
      status: summary.status,
      snapshot: invoiceSnapshotSchema.parse(invoice.snapshot),
      demo: data.demo,
      paidCents: summary.paidCents,
      remainingCents: summary.remainingCents,
    });
    const filename = invoice.number.replace(/[^a-zA-Z0-9_-]/g, "_") || "invoice";
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Quick-Pass-${filename}.pdf"`,
      },
    });
  } catch (error) {
    return new Response(
      error instanceof BusinessError ? error.message : "Unable to generate this invoice PDF. Your invoice has not been changed.",
      { status: error instanceof BusinessError ? 403 : 500, headers },
    );
  }
}
