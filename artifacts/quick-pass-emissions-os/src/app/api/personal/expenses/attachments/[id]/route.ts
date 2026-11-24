import { currentUser } from "@/lib/access";
import { downloadReceipt } from "@/modules/personal/expense-storage";
export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await currentUser();
  try {
    const { attachment: a, bytes } = await downloadReceipt(actor.id, (await params).id);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": a.mimeType,
        "Content-Disposition": `attachment; filename="${a.filename.replace(/[^a-zA-Z0-9._ -]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch {
    return new Response("Receipt unavailable.", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
