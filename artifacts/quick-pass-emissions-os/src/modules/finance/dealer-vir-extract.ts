import language from "@tesseract.js-data/eng";
import { requireRule } from "../phase4";
import { parseVirPage, type StoredVirRow } from "./dealer-vir-parser";

// PDF parsing/OCR runs locally. No source bytes or text are logged or persisted.
export async function extractDealerVirs(
  files: File[],
  sourceLabels: string[] = [],
): Promise<StoredVirRow[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createWorker } = await import("tesseract.js");
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  const rows: StoredVirRow[] = [];
  const started = Date.now();
  try {
    let pageIndex = 0;
    for (const [fileIndex, file] of files.entries()) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      requireRule(
        Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-",
        `PDF ${fileIndex + 1} is not a valid PDF file.`,
      );
      const task = getDocument({
        data: bytes,
        verbosity: 0,
        useSystemFonts: false,
        stopAtErrors: true,
      });
      try {
        const doc = await task.promise;
        requireRule(
          doc.numPages > 0 && rows.length + doc.numPages <= 40,
          "Upload at most 40 report pages at a time.",
        );
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
          requireRule(
            Date.now() - started < 240_000,
            "Scan processing took too long. Upload fewer pages.",
          );
          const page = await doc.getPage(pageNumber);
          const content = await page.getTextContent();
          const text = content.items
            .filter((item) => "str" in item)
            .map((item) => item.str)
            .join(" ");
          const source = sourceLabels[pageIndex] ?? `PDF ${fileIndex + 1} · Page ${pageNumber}`;
          let row = parseVirPage(text, source, "TEXT");
          // Even a scan with a text layer may have OCR-corrupted dates or identifiers.
          if (
            !row.date ||
            !row.reportKey ||
            row.outcome === "UNKNOWN" ||
            row.testType === "UNKNOWN" ||
            row.feeCents === null
          ) {
            worker ??= await createWorker("eng", 1, {
              langPath: language.langPath,
              cacheMethod: "none",
              logger: () => {},
              errorHandler: () => {},
            });
            const base = page.getViewport({ scale: 1 });
            requireRule(
              Number.isFinite(base.width) &&
                Number.isFinite(base.height) &&
                base.width > 0 &&
                base.height > 0,
              `${source} has an unsupported page size.`,
            );
            const scale = Math.min(2.25, 2200 / Math.max(base.width, base.height));
            const viewport = page.getViewport({ scale });
            // PDF.js exposes its Node canvas factory as `object` in the public types.
            type CanvasSurface = {
              canvas: HTMLCanvasElement & { toBuffer(format: "image/png"): Buffer };
              context: CanvasRenderingContext2D;
            };
            const factory = doc.canvasFactory as {
              create(width: number, height: number): CanvasSurface;
              destroy(surface: CanvasSurface): void;
            };
            const canvas = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
            try {
              await page.render({ canvas: canvas.canvas, canvasContext: canvas.context, viewport })
                .promise;
              const image = canvas.canvas.toBuffer("image/png") as Buffer;
              let timer: ReturnType<typeof setTimeout> | undefined;
              try {
                const result = await Promise.race([
                  worker.recognize(image),
                  new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error("OCR_TIMEOUT")), 60_000);
                  }),
                ]);
                row = parseVirPage(result.data.text, source, "OCR", result.data.confidence);
              } finally {
                if (timer) clearTimeout(timer);
              }
            } finally {
              factory.destroy(canvas);
            }
          }
          rows.push(row);
          pageIndex++;
          page.cleanup();
        }
      } finally {
        await task.destroy();
      }
    }
    if (sourceLabels.length)
      requireRule(
        sourceLabels.length === rows.length,
        "The processed batch page labels do not match its report pages.",
      );
    return rows;
  } finally {
    await worker?.terminate();
  }
}
