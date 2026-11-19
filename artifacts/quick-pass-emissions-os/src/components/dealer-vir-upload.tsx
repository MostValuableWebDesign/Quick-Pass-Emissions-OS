"use client";

import { AlertTriangle, CheckCircle2, FileUp, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PDFDocument as PdfDocument } from "pdf-lib";
import {
  commitDealerVirs,
  failDealerVirs,
  finishDealerVirs,
  processDealerVirChunk,
  startDealerVirs,
} from "@/app/dealer-vir-actions";
import type {
  DealerVirPreview,
  DealerVirResult,
  DealerVirReviewRow,
  DealerVirRow,
} from "@/modules/finance/dealer-vir-types";
import "./dealer-vir-upload.css";
import { DealerVirRecoveryNotice } from "./dealer-vir-recovery-notice";

const MAX_FILES = 100;
const MAX_BYTES = 150_000_000;
const MAX_FILE_BYTES = 50_000_000;
const MAX_PAGES = 1000;
const MAX_BATCH_PAGES = 40;
const MAX_BATCH_BYTES = 15_000_000;
const OUTCOMES = ["PASS", "FAIL", "ABORT", "UNKNOWN"] as const;
const TYPES = ["INITIAL", "RETEST", "UNKNOWN"] as const;

type Billing = DealerVirReviewRow["billing"];

class VirUploadUserError extends Error {}

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function canBill(row: DealerVirReviewRow, src: DealerVirRow) {
  return (
    !src.duplicate &&
    !src.freeRetest &&
    !!row.vin.trim() &&
    (row.outcome === "PASS" || row.outcome === "FAIL") &&
    row.testType !== "UNKNOWN" &&
    !!row.date &&
    (!!row.certificate.trim() || !!row.testNumber.trim())
  );
}

function initialRow(src: DealerVirRow): DealerVirReviewRow {
  const base: DealerVirReviewRow = {
    id: src.id,
    date: src.date,
    vin: src.vin,
    certificate: src.certificate,
    testNumber: src.testNumber,
    outcome: src.outcome,
    testType: src.testType,
    billing: "EXCLUDE",
    confirmed: false,
    saveExistingVin: false,
  };
  if (src.duplicate) return base;
  if (src.freeRetest) return { ...base, billing: "FREE" };
  return { ...base, billing: canBill(base, src) ? "BILL" : "EXCLUDE" };
}

function elapsedLabel(s: number) {
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

export function DealerVirUpload({
  dealershipId,
  dealers = [],
  resumeUploadId,
}: {
  dealershipId?: string;
  dealers?: { id: string; name: string }[];
  resumeUploadId?: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const baseId = useId();

  const [dealer, setDealer] = useState(dealershipId ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<"" | "preview" | "commit">("");
  const [elapsed, setElapsed] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<DealerVirPreview | null>(null);
  const [rows, setRows] = useState<DealerVirReviewRow[]>([]);
  const [createDraft, setCreateDraft] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [result, setResult] = useState<
    | (DealerVirResult & {
        dealershipId: string;
        fileCount: number;
        processedPages: number;
        uploadedPages: number;
      })
    | null
  >(null);

  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  const fileError =
    files.length > MAX_FILES
      ? `Select at most ${MAX_FILES} PDFs.`
      : totalBytes > MAX_BYTES
        ? "Combined size must be 150 MB or less."
        : files.some((f) => f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"))
          ? "Only PDF files are accepted."
          : files.some((f) => f.size > MAX_FILE_BYTES)
            ? "Each PDF must be 50 MB or smaller."
            : "";

  const srcById = useMemo(() => new Map((preview?.rows ?? []).map((r) => [r.id, r])), [preview]);

  const tally = useMemo(() => {
    let bill = 0,
      free = 0,
      excluded = 0,
      reusedCents = 0;
    const reused = new Set<string>();
    for (const r of rows) {
      if (r.billing === "BILL") bill++;
      else if (r.billing === "FREE") free++;
      else if (!r.saveExistingVin && !r.reuseSavedService) excluded++;
      const service = srcById.get(r.id)?.savedService;
      if (r.reuseSavedService && service && !reused.has(service.id)) {
        reused.add(service.id);
        reusedCents += service.quantity * service.unitCents;
      }
    }
    const rate = preview?.rateCents ?? null;
    const subtotal = rate === null && bill > 0 ? null : (rate ?? 0) * bill + reusedCents;
    const reusedCount = [...reused].reduce(
      (count, id) =>
        count +
        (preview?.rows.find((row) => row.savedService?.id === id)?.savedService?.quantity ?? 0),
      0,
    );
    const tax =
      subtotal !== null && preview?.taxBps != null
        ? Math.floor((subtotal * preview.taxBps + 5000) / 10000)
        : null;
    return { bill: bill + reusedCount, free, excluded, subtotal, tax, reusedCount };
  }, [rows, preview, srcById]);

  const included = rows.filter((r) => r.billing !== "EXCLUDE");
  const vinUpdates = rows.filter((r) => r.saveExistingVin || r.reuseSavedService);
  const allReviewed = included.every((r) => r.confirmed);
  const rateMissing = preview?.rateCents == null;
  const termsReady = !!preview?.termsReady;
  const draftOn = createDraft && termsReady && !rateMissing && tally.bill > 0;
  const blockReason =
    !included.length && !vinUpdates.length
      ? rows.some((row) => srcById.get(row.id)?.duplicate)
        ? "Select Update saved test to add its VIN, or Reuse saved service to create an invoice."
        : "Include at least one inspection to save."
      : vinUpdates.some((row) => !row.vin.trim())
        ? "Enter the VIN shown on each selected report before updating saved tests."
        : !allReviewed
          ? "Mark every included row as reviewed."
          : tally.bill > 0 && rateMissing
            ? "No owner-authorized service rate. Billable rows cannot be saved; mark them free or excluded."
            : draftOn && !issueDate
              ? "Choose an invoice issue date."
              : "";

  function reset() {
    setFiles([]);
    setPreview(null);
    setRows([]);
    setError("");
    setProgressMessage("");
    setInvoiceNumber("");
    setIssueDate(today());
    setDealer(dealershipId ?? "");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function open() {
    reset();
    dialog.current?.showModal();
    if (resumeUploadId) {
      setBusy("preview");
      setProgressMessage("Loading your uploaded reports…");
      try {
        const response = await finishDealerVirs(resumeUploadId);
        if (!response.ok) {
          setError(response.message);
          return;
        }
        setDealer(response.data.dealershipId);
        setPreview(response.data);
        setRows(response.data.rows.map(initialRow));
        setCreateDraft(false);
        setIssueDate(response.data.issueDate || today());
      } catch {
        setError("Unable to reopen the report review. Your invoice has not been changed.");
      } finally {
        setBusy("");
        setProgressMessage("");
      }
    }
  }

  function requestClose() {
    if (busy) return;
    dialog.current?.close();
  }

  async function runPreview() {
    if (!dealer || !files.length || fileError) return;
    setBusy("preview");
    setError("");
    setProgressMessage("Checking selected PDFs…");
    let uploadId = "";
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pageCounts: number[] = [];
      let expectedPages = 0;

      for (const [index, file] of files.entries()) {
        setProgressMessage(`Checking PDF ${index + 1} of ${files.length}…`);
        if (!file.name.toLowerCase().endsWith(".pdf") || file.size > MAX_FILE_BYTES)
          throw new VirUploadUserError(`PDF ${index + 1} is not a supported file.`);
        const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
        if (new TextDecoder().decode(signature) !== "%PDF-")
          throw new VirUploadUserError(`PDF ${index + 1} could not be opened.`);
        const source = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
        const count = source.getPageCount();
        if (!count) throw new VirUploadUserError(`PDF ${index + 1} has no pages.`);
        expectedPages += count;
        if (expectedPages > MAX_PAGES)
          throw new VirUploadUserError(
            `This upload contains more than ${MAX_PAGES} VIR pages. Split it into smaller uploads.`,
          );
        pageCounts.push(count);
      }

      const begin = new FormData();
      begin.set("dealershipId", dealer);
      begin.set("fileCount", String(files.length));
      begin.set("expectedPages", String(expectedPages));
      const started = await startDealerVirs(begin);
      if (!started.ok) throw new VirUploadUserError(started.message);
      uploadId = started.data.uploadId;

      type SourcePage = { source: number; page: number; label: string };
      const sources = new Map<number, PdfDocument>();
      const remainingPages = [...pageCounts];
      let pageBatch: SourcePage[] = [];
      let processedPages = 0;
      let processedBatches = 0;

      const sendPages = async (sourcePages: SourcePage[]): Promise<void> => {
        const output = await PDFDocument.create();
        for (const sourcePage of sourcePages) {
          const source = sources.get(sourcePage.source);
          if (!source)
            throw new VirUploadUserError(`PDF ${sourcePage.source + 1} could not be reopened.`);
          const [page] = await output.copyPages(source, [sourcePage.page]);
          output.addPage(page);
        }
        const bytes = await output.save({ useObjectStreams: true });
        if (bytes.byteLength > MAX_BATCH_BYTES) {
          if (sourcePages.length === 1)
            throw new VirUploadUserError(
              `${sourcePages[0].label} is larger than a single batch. Compress that PDF page and try again.`,
            );
          const middle = Math.ceil(sourcePages.length / 2);
          await sendPages(sourcePages.slice(0, middle));
          await sendPages(sourcePages.slice(middle));
          return;
        }

        setProgressMessage(
          `Processing batch ${processedBatches + 1} · ${processedPages} of ${expectedPages} VIRs processed`,
        );
        const form = new FormData();
        form.set("uploadId", uploadId);
        form.set("chunkKey", window.crypto.randomUUID());
        form.set("sourceLabels", JSON.stringify(sourcePages.map((page) => page.label)));
        const fileBytes = new Uint8Array(bytes).buffer as ArrayBuffer;
        form.append(
          "reports",
          new File([fileBytes], `VIR-batch-${processedBatches + 1}.pdf`, {
            type: "application/pdf",
          }),
        );
        const result = await processDealerVirChunk(form);
        if (!result.ok) throw new VirUploadUserError(result.message);
        processedPages = result.data.processedPages;
        processedBatches = result.data.processedBatches;
        setProgressMessage(
          `Processing batch ${processedBatches} · ${processedPages} of ${expectedPages} VIRs processed`,
        );
      };

      const releaseUnusedSources = () => {
        const needed = new Set(pageBatch.map((page) => page.source));
        for (const [index] of sources) {
          if (remainingPages[index] === 0 && !needed.has(index)) sources.delete(index);
        }
      };

      for (const [sourceIndex, file] of files.entries()) {
        setProgressMessage(
          `Preparing PDF ${sourceIndex + 1} of ${files.length} · ${processedPages} of ${expectedPages} VIRs processed`,
        );
        const source = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
        sources.set(sourceIndex, source);
        for (let page = 0; page < pageCounts[sourceIndex]; page++) {
          pageBatch.push({
            source: sourceIndex,
            page,
            label: `PDF ${sourceIndex + 1} · Page ${page + 1}`,
          });
          remainingPages[sourceIndex]--;
          if (pageBatch.length === MAX_BATCH_PAGES) {
            const ready = pageBatch;
            pageBatch = [];
            await sendPages(ready);
            releaseUnusedSources();
          }
        }
        releaseUnusedSources();
      }
      if (pageBatch.length) {
        const ready = pageBatch;
        pageBatch = [];
        await sendPages(ready);
      }

      setProgressMessage(`Finishing upload · ${processedPages} of ${expectedPages} VIRs processed`);
      const finished = await finishDealerVirs(uploadId);
      if (!finished.ok) throw new VirUploadUserError(finished.message);
      if (!dialog.current?.open) return;
      setPreview(finished.data);
      setRows(finished.data.rows.map(initialRow));
      setCreateDraft(finished.data.termsReady && finished.data.rateCents != null);
      setIssueDate(finished.data.issueDate || today());
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
    } catch (error) {
      if (uploadId) await failDealerVirs(uploadId);
      setError(
        error instanceof VirUploadUserError
          ? error.message
          : "The upload did not finish. No invoice was created. Check the selected PDFs and retry.",
      );
    } finally {
      setBusy("");
      setProgressMessage("");
    }
  }

  async function runCommit() {
    if (!preview || blockReason) return;
    setBusy("commit");
    setError("");
    try {
      const res = await commitDealerVirs({
        uploadId: preview.uploadId,
        dealershipId: preview.dealershipId,
        rows,
        createDraft: draftOn,
        invoiceNumber: draftOn ? invoiceNumber.trim() : "",
        issueDate: draftOn ? issueDate : preview.issueDate,
      });
      if (!res.ok) return setError(res.message);
      setResult({
        ...res.data,
        dealershipId: preview.dealershipId,
        fileCount: preview.fileCount,
        processedPages: preview.processedPages,
        uploadedPages: preview.uploadedPages,
      });
      dialog.current?.close();
      router.refresh();
    } catch {
      setError(
        "The save result could not be confirmed. Retry this upload safely; duplicate protection prevents repeated billing.",
      );
    } finally {
      setBusy("");
    }
  }

  function patch(id: string, change: Partial<DealerVirReviewRow>) {
    setRows((list) =>
      list.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...change };
        const src = srcById.get(id);
        if (src && next.billing === "BILL" && !canBill(next, src))
          next.billing = src.freeRetest ? "FREE" : "EXCLUDE";
        if (src?.duplicate) next.billing = "EXCLUDE";
        const edited = (
          ["date", "vin", "certificate", "testNumber", "outcome", "testType", "billing"] as const
        ).some((k) => k in change && next[k] !== r[k]);
        if (edited || next.billing === "EXCLUDE") next.confirmed = false;
        return next;
      }),
    );
  }

  const dealerName = dealers.find((d) => d.id === (preview?.dealershipId ?? dealer))?.name;

  return (
    <>
      <button
        type="button"
        className="button button-outline"
        onClick={open}
        data-testid="button-open-vir-upload"
      >
        <FileUp size={16} aria-hidden="true" />
        {resumeUploadId ? "Review uploaded VINs" : "Upload VIR PDFs"}
      </button>

      {result && (
        <div className="vir-result" role="status" data-testid="status-vir-result">
          <CheckCircle2 size={18} aria-hidden="true" />
          <p>
            {result.fileCount} PDF{result.fileCount === 1 ? "" : "s"} uploaded ·{" "}
            {result.processedPages} / {result.uploadedPages} VIR pages processed. Saved{" "}
            {result.saved} reviewed inspection{result.saved === 1 ? "" : "s"} · {result.billable}{" "}
            billable · {result.free} free · {result.skipped} skipped
            {result.vinUpdated
              ? ` · ${result.vinUpdated} saved test VIN${result.vinUpdated === 1 ? "" : "s"} updated`
              : ""}
            .{" "}
            {result.invoiceId ? (
              <a href={`/invoices/${result.invoiceId}`}>
                Open invoice {result.invoiceNumber ?? ""}
              </a>
            ) : (
              <a href={`/dealerships/${result.dealershipId}?section=services#create-invoice`}>
                View dealership services
              </a>
            )}
          </p>
          <button
            type="button"
            className="vir-result-dismiss"
            aria-label="Dismiss upload result"
            onClick={() => setResult(null)}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}

      <dialog
        ref={dialog}
        className="directory-add-dialog vir-dialog"
        aria-labelledby={titleId}
        onCancel={(e) => {
          e.preventDefault();
          requestClose();
        }}
        onClick={(e) => {
          if (e.target === dialog.current) requestClose();
        }}
      >
        <div className="directory-add-dialog-header">
          <h2 id={titleId}>{preview ? "Review dealership VIRs" : "Upload dealership VIR PDFs"}</h2>
          <button
            type="button"
            className="directory-add-dialog-close"
            aria-label="Close VIR upload"
            onClick={requestClose}
            disabled={!!busy}
            title={busy ? "Wait for the current step to finish" : undefined}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        <div className="directory-add-dialog-body vir-body">
          {error && (
            <p className="vir-alert" role="alert" data-testid="text-vir-error">
              <AlertTriangle size={16} aria-hidden="true" /> {error}
            </p>
          )}

          {!preview ? (
            <div className="vir-upload">
              {!dealershipId && (
                <label className="field">
                  <span>Dealership</span>
                  <select
                    value={dealer}
                    onChange={(e) => {
                      setDealer(e.target.value);
                      setFiles([]);
                      if (fileInput.current) fileInput.current.value = "";
                    }}
                    required
                    disabled={!!busy}
                    data-testid="select-vir-dealer"
                  >
                    <option value="">Choose an active dealership</option>
                    {dealers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className={`vir-drop${dealer ? "" : " is-disabled"}`} aria-disabled={!dealer}>
                <FileUp size={22} aria-hidden="true" />
                <strong>Choose vehicle inspection report PDFs</strong>
                <span>
                  {dealer
                    ? "Up to 100 PDFs · 150 MB combined · 1,000 pages, processed in batches of up to 40 VIRs"
                    : "Select an active dealership first"}
                </span>
                <input
                  ref={fileInput}
                  type="file"
                  name="reports"
                  accept="application/pdf,.pdf"
                  multiple
                  disabled={!!busy || !dealer}
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  data-testid="input-vir-files"
                />
              </label>
              {files.length > 0 && (
                <p
                  className={fileError ? "vir-file-note bad" : "vir-file-note"}
                  data-testid="text-vir-files"
                >
                  {files.length} PDF{files.length === 1 ? "" : "s"} ·{" "}
                  {(totalBytes / 1024 / 1024).toFixed(1)} MB
                  {fileError && ` — ${fileError}`}
                </p>
              )}
              <p className="muted vir-privacy">
                PDFs and OCR text are not retained. VINs are shown during review and saved only for
                billable services so the invoice can identify each tested vehicle.
              </p>
              {busy === "preview" && (
                <div className="vir-progress" role="status" aria-live="polite">
                  <Loader2 size={16} className="vir-spin" aria-hidden="true" />
                  <span>
                    {progressMessage || "Reading reports"} · {elapsedLabel(elapsed)} elapsed.
                    Scanned pages use local OCR and can take a few minutes. This window stays open
                    until reading finishes.
                  </span>
                </div>
              )}
              <div className="vir-footer">
                <button
                  type="button"
                  className="button button-outline"
                  onClick={requestClose}
                  disabled={!!busy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={!!busy || !dealer || !files.length || !!fileError}
                  onClick={runPreview}
                  data-testid="button-vir-preview"
                >
                  {busy === "preview" ? "Reading reports…" : "Read reports"}
                </button>
              </div>
            </div>
          ) : (
            <div className="vir-review">
              {preview.rows.some((row) => row.duplicate) && (
                <DealerVirRecoveryNotice dealershipId={preview.dealershipId} />
              )}
              <div className="vir-tally" data-testid="status-vir-tally">
                <div>
                  <span>Processed</span>
                  <strong>{rows.length}</strong>
                </div>
                <div>
                  <span>Billable</span>
                  <strong>{tally.bill}</strong>
                </div>
                <div>
                  <span>Free</span>
                  <strong>{tally.free}</strong>
                </div>
                <div>
                  <span>Excluded</span>
                  <strong>{tally.excluded}</strong>
                </div>
                <div className="vir-tally-amount">
                  <span>Charge{dealerName ? ` · ${dealerName}` : ""}</span>
                  <strong>
                    {tally.subtotal === null
                      ? "Rate not set"
                      : money(tally.subtotal + (tally.tax ?? 0))}
                  </strong>
                  <small>
                    {preview.rateCents === null
                      ? "Owner must authorize a rate"
                      : tally.reusedCount > 0
                        ? `${tally.reusedCount} saved inspections at their original rates${tally.bill > tally.reusedCount ? " + new billable inspections" : ""}${tally.tax !== null ? ` + ${money(tally.tax)} tax` : ""}`
                        : `${tally.bill} × ${money(preview.rateCents)} authorized rate${tally.tax !== null ? ` + ${money(tally.tax)} tax` : " · tax not configured"}`}
                  </small>
                </div>
              </div>
              <p className="vir-upload-summary" data-testid="text-vir-upload-counts">
                PDFs uploaded: <strong>{preview.fileCount}</strong>
                {" · "}VIR pages detected: <strong>{preview.uploadedPages}</strong>
                {" · "}Processed:{" "}
                <strong>
                  {preview.processedPages} / {preview.uploadedPages}
                </strong>
                {" · "}
                {preview.processedBatches} batches (up to 40 each)
              </p>

              {!rows.length && (
                <p className="vir-empty">No inspection reports were recognized in these PDFs.</p>
              )}

              <label className="check-row vir-all">
                <input
                  type="checkbox"
                  checked={allReviewed}
                  disabled={!included.length}
                  onChange={(e) =>
                    setRows((l) =>
                      l.map((r) =>
                        r.billing === "EXCLUDE" ? r : { ...r, confirmed: e.target.checked },
                      ),
                    )
                  }
                  data-testid="checkbox-vir-all-reviewed"
                />
                I have checked every included row against its PDF page
              </label>
              {preview.rows.some((row) => row.duplicate && row.savedService) && (
                <label className="check-row vir-all">
                  <input
                    type="checkbox"
                    checked={preview.rows
                      .filter((row) => row.duplicate && row.savedService)
                      .every((source) => rows.find((row) => row.id === source.id)?.saveExistingVin)}
                    disabled={!!busy}
                    onChange={(event) =>
                      setRows((list) =>
                        list.map((row) =>
                          srcById.get(row.id)?.savedService && srcById.get(row.id)?.duplicate
                            ? {
                                ...row,
                                saveExistingVin: event.target.checked,
                                reuseSavedService: event.target.checked
                                  ? row.reuseSavedService
                                  : false,
                              }
                            : row,
                        ),
                      )
                    }
                    data-testid="checkbox-vir-update-all-vins"
                  />
                  I checked the VINs above; update all matched saved tests and invoice VIN details.
                  Charges stay unchanged; no email will be sent.
                </label>
              )}

              <ol className="vir-rows">
                {rows.map((r) => {
                  const src = srcById.get(r.id)!;
                  const id = `${baseId}-${r.id}`;
                  const billable = canBill(r, src);
                  const low = src.confidence < 80;
                  return (
                    <li
                      key={r.id}
                      className={`vir-row is-${r.billing.toLowerCase()}`}
                      data-testid={`row-vir-${r.id}`}
                    >
                      <div className="vir-row-head">
                        <strong>{src.source}</strong>
                        <span className={low ? "vir-chip warn" : "vir-chip"}>
                          {src.method === "OCR" ? "OCR" : "Text"} · {Math.round(src.confidence)}%
                          confidence
                        </span>
                        {src.duplicate && (
                          <span className="vir-chip info">Saved test · reuse or update</span>
                        )}
                        {src.freeRetest && (
                          <span className="vir-chip info">Free retest detected</span>
                        )}
                      </div>
                      {src.warnings.length > 0 && (
                        <ul className="vir-warnings">
                          {src.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      )}
                      <fieldset className="vir-fields" disabled={busy === "commit"}>
                        <legend className="sr-only">Inspection fields for {src.source}</legend>
                        <label>
                          <span>Test date</span>
                          <input
                            type="date"
                            value={r.date}
                            disabled={src.duplicate}
                            onChange={(e) => patch(r.id, { date: e.target.value })}
                          />
                        </label>
                        <label>
                          <span>VIN</span>
                          <input
                            value={r.vin}
                            maxLength={40}
                            placeholder="VIN shown on report"
                            autoCapitalize="characters"
                            required={r.billing === "BILL"}
                            onChange={(e) => patch(r.id, { vin: e.target.value.toUpperCase() })}
                            data-testid={`input-vir-vin-${r.id}`}
                          />
                        </label>
                        <label>
                          <span>Certificate</span>
                          <input
                            value={r.certificate}
                            maxLength={40}
                            disabled={src.duplicate}
                            onChange={(e) => patch(r.id, { certificate: e.target.value })}
                          />
                        </label>
                        <label>
                          <span>Test number</span>
                          <input
                            value={r.testNumber}
                            maxLength={40}
                            disabled={src.duplicate}
                            onChange={(e) => patch(r.id, { testNumber: e.target.value })}
                          />
                        </label>
                        <label>
                          <span>Outcome</span>
                          <select
                            value={r.outcome}
                            disabled={src.duplicate}
                            onChange={(e) =>
                              patch(r.id, { outcome: e.target.value as DealerVirRow["outcome"] })
                            }
                          >
                            {OUTCOMES.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Test type</span>
                          <select
                            value={r.testType}
                            disabled={src.duplicate}
                            onChange={(e) =>
                              patch(r.id, { testType: e.target.value as DealerVirRow["testType"] })
                            }
                          >
                            {TYPES.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Billing</span>
                          <select
                            value={r.billing}
                            disabled={src.duplicate}
                            onChange={(e) => patch(r.id, { billing: e.target.value as Billing })}
                            data-testid={`select-vir-billing-${r.id}`}
                          >
                            <option value="BILL" disabled={!billable}>
                              Bill
                            </option>
                            <option value="FREE">Free</option>
                            <option value="EXCLUDE">Exclude</option>
                          </select>
                        </label>
                      </fieldset>
                      {src.duplicate && src.savedService && (
                        <label className="check-row vir-confirm">
                          <input
                            type="checkbox"
                            checked={r.saveExistingVin}
                            disabled={busy === "commit"}
                            onChange={(e) =>
                              patch(r.id, {
                                saveExistingVin: e.target.checked,
                                reuseSavedService: e.target.checked ? r.reuseSavedService : false,
                              })
                            }
                            data-testid={`checkbox-vir-save-existing-vin-${r.id}`}
                          />
                          Update this saved test and its active invoice with the verified VIN above.
                          Charges stay unchanged; no email will be sent.
                        </label>
                      )}
                      {src.duplicate && src.savedService?.availableForInvoice && (
                        <label className="check-row vir-confirm">
                          <input
                            type="checkbox"
                            checked={!!r.reuseSavedService}
                            disabled={!!busy}
                            onChange={(event) =>
                              patch(r.id, {
                                reuseSavedService: event.target.checked,
                                saveExistingVin: event.target.checked || r.saveExistingVin,
                              })
                            }
                            data-testid={`checkbox-vir-reuse-service-${r.id}`}
                          />
                          Reuse saved service on new invoice: {src.savedService.quantity} inspection
                          {src.savedService.quantity === 1 ? "" : "s"} ×{" "}
                          {money(src.savedService.unitCents)}. Includes the full saved service;
                          selecting it on multiple reports bills it once.
                        </label>
                      )}
                      {src.duplicate && src.savedService?.invoiceId && (
                        <p className="muted">
                          Already on{" "}
                          <Link href={`/invoices/${src.savedService.invoiceId}`}>
                            invoice {src.savedService.invoiceNumber}
                          </Link>
                          . Saving VIN updates adds them to this invoice and future PDF downloads.
                          Previously sent emails are unchanged.
                        </p>
                      )}
                      {r.billing !== "EXCLUDE" && (
                        <label className="check-row vir-confirm" htmlFor={id}>
                          <input
                            id={id}
                            type="checkbox"
                            checked={r.confirmed}
                            onChange={(e) => patch(r.id, { confirmed: e.target.checked })}
                            data-testid={`checkbox-vir-reviewed-${r.id}`}
                          />
                          Reviewed against {src.source}
                        </label>
                      )}
                    </li>
                  );
                })}
              </ol>

              <fieldset className="vir-invoice">
                <legend>Invoice</legend>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={draftOn}
                    disabled={!termsReady || rateMissing || tally.bill === 0}
                    onChange={(e) => setCreateDraft(e.target.checked)}
                    data-testid="checkbox-vir-create-draft"
                  />
                  Create an invoice draft for billable rows
                </label>
                {!termsReady && (
                  <p className="muted">
                    Billing terms are not authorized, so only services can be recorded.{" "}
                    <Link href={`/dealerships/${preview.dealershipId}#billing-terms`}>
                      Review dealership billing terms
                    </Link>
                  </p>
                )}
                {draftOn && (
                  <div className="vir-invoice-fields">
                    <label className="field">
                      <span>Invoice number · optional</span>
                      <input
                        value={invoiceNumber}
                        maxLength={40}
                        placeholder={`QP-${issueDate.slice(0, 4)}-0001`}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        data-testid="input-vir-invoice-number"
                      />
                      <small>Leave blank to assign the next QP-year-sequence number.</small>
                    </label>
                    <label className="field">
                      <span>Issue date</span>
                      <input
                        type="date"
                        value={issueDate}
                        required
                        onChange={(e) => setIssueDate(e.target.value)}
                        data-testid="input-vir-issue-date"
                      />
                    </label>
                  </div>
                )}
                <p className="muted">
                  Review and send from the invoice page. Nothing is emailed or charged here.
                </p>
              </fieldset>

              {blockReason && (
                <p className="vir-block" data-testid="text-vir-block">
                  {blockReason}
                </p>
              )}
              {busy === "commit" && (
                <p className="vir-progress" role="status">
                  <Loader2 size={16} className="vir-spin" aria-hidden="true" /> Saving reviewed
                  inspections. This window stays open until saving finishes.
                </p>
              )}
              <div className="vir-footer">
                <button
                  type="button"
                  className="button button-outline"
                  disabled={!!busy}
                  onClick={reset}
                >
                  Start over
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={!!busy || !!blockReason}
                  onClick={runCommit}
                  data-testid="button-vir-commit"
                >
                  {draftOn
                    ? "Create invoice draft"
                    : vinUpdates.length
                      ? "Save VIN updates"
                      : "Save reviewed inspections"}
                </button>
              </div>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
