import { currentUser } from "@/lib/access";
import { materialForActor } from "@/modules/marketing/service";
import { downloadMaterial } from "@/modules/marketing/material-storage";
export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await currentUser();
  try {
    const material = await materialForActor(actor.id, (await params).id);
    if (!material.objectPath) return new Response("No file attached.", { status: 404 });
    const bytes = await downloadMaterial(material.objectPath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": material.mimeType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${(material.filename ?? "material").replace(/[^a-zA-Z0-9._ -]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch {
    return new Response("Material not available.", { status: 404 });
  }
}
