import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { dealershipInvoiceBrands } from "../src/modules/finance/dealership-invoice-branding";
import { createInvoicePdf } from "../src/modules/finance/invoice-pdf";
import { invoiceDesignFixture } from "../tests/fixtures/invoice-design";

async function main() {
  const folder = path.resolve("../../generated-artifacts/dealership-invoice-designs");
  await mkdir(folder, { recursive: true });
  const combined = await PDFDocument.create();
  combined.setTitle("Quick Pass dealership invoice design samples — not real invoices");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  for (const brand of dealershipInvoiceBrands) {
    const bytes = await createInvoicePdf(invoiceDesignFixture(brand.displayName));
    await writeFile(path.join(folder, `${brand.id}.pdf`), bytes);
    const source = await PDFDocument.load(bytes);
    for (const page of await combined.copyPages(source, source.getPageIndices()))
      combined.addPage(page);

    const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
    try {
      const doc = await task.promise;
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      type Surface = {
        canvas: HTMLCanvasElement & { toBuffer(type: "image/png"): Buffer };
        context: CanvasRenderingContext2D;
      };
      const factory = doc.canvasFactory as {
        create(width: number, height: number): Surface;
        destroy(surface: Surface): void;
      };
      const surface = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      try {
        await page.render({ viewport, canvas: surface.canvas, canvasContext: surface.context })
          .promise;
        await writeFile(path.join(folder, `${brand.id}.png`), surface.canvas.toBuffer("image/png"));
      } finally {
        factory.destroy(surface);
      }
      console.log(`${brand.displayName}: ${source.getPageCount()} sample page(s) rendered`);
    } finally {
      await task.destroy();
    }
  }
  await writeFile(path.join(folder, "dealership-invoice-samples.pdf"), await combined.save());
  console.log("Saved demonstration-only invoice samples. No business records were accessed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
