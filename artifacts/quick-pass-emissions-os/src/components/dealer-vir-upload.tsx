"use client";

import { AlertTriangle, CheckCircle2, FileUp, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { commitDealerVirs, previewDealerVirs } from "@/app/dealer-vir-actions";
import type {
  DealerVirPreview,
  DealerVirResult,
  DealerVirReviewRow,
  DealerVirRow,
} from "@/modules/finance/dealer-vir-types";
import "./dealer-vir-upload.css";

const MAX_FILES = 10;
const MAX_BYTES = 15_000_000;
const OUTCOMES = ["PASS", "FAIL", "ABORT", "UNKNOWN"] as const;
const TYPES = ["INITIAL", "RETEST", "UNKNOWN"] as const;

type Billing = DealerVirReviewRow["billing"];

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
    certificate: src.certificate,
    testNumber: src.testNumber,
    outcome: src.outcome,
    testType: src.testType,
    billing: "EXCLUDE",
    confirmed: false,
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
}: {
  dealershipId?: string;
  dealers?: { id: string; name: string }[];
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
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<DealerVirPreview | null>(null);
  const [rows, setRows] = useState<DealerVirReviewRow[]>([]);
  const [createDraft, setCreateDraft] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [result, setResult] = useState<(DealerVirResult & { dealershipId: string }) | null>(null);

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
        ? "Combined size must be 15 MB or less."
        : files.some((f) => f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"))
          ? "Only PDF files are accepted."
          : "";

  const srcById = useMemo(() => new Map((preview?.rows ?? []).map((r) => [r.id, r])), [preview]);

  const tally = useMemo(() => {
    let bill = 0,
      free = 0,
      excluded = 0;
    for (const r of rows) {
      if (r.billing === "BILL") bill++;
      else if (r.billing === "FREE") free++;
      else excluded++;
    }
    const rate = preview?.rateCents ?? null;
    const subtotal = rate === null ? null : rate * bill;
    const tax =
      subtotal !== null && preview?.taxBps != null
        ? Math.floor((subtotal * preview.taxBps + 5000) / 10000)
        : null;
    return { bill, free, excluded, subtotal, tax };
  }, [rows, preview]);

  const included = rows.filter((r) => r.billing !== "EXCLUDE");
  const allReviewed = included.length > 0 && included.every((r) => r.confirmed);
  const rateMissing = preview?.rateCents == null;
  const termsReady = !!preview?.termsReady;
  const draftOn = createDraft && termsReady && !rateMissing && tally.bill > 0;
  const blockReason = !included.length
    ? "Include at least one inspection to save."
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
    setInvoiceNumber("");
    setIssueDate(today());
    setDealer(dealershipId ?? "");
    if (fileInput.current) fileInput.current.value = "";
  }

  function open() {
    reset();
    dialog.current?.showModal();
  }

  function requestClose() {
    if (busy) return;
    dialog.current?.close();
  }

  async function runPreview() {
    if (!dealer || !files.length || fileError) return;
    setBusy("preview");
    setError("");
    try {
      const form = new FormData();
      form.set("dealershipId", dealer);
      files.forEach((f) => form.append("reports", f));
      const res = await previewDealerVirs(form);
      if (!dialog.current?.open) return;
      if (!res.ok) return setError(res.message);
      setPreview(res.data);
      setRows(res.data.rows.map(initialRow));
      setCreateDraft(res.data.termsReady && res.data.rateCents != null);
      setIssueDate(res.data.issueDate || today());
    } catch {
      setError("The reports could not be read. Check the files and try again.");
    } finally {
      setBusy("");
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
      setResult({ ...res.data, dealershipId: preview.dealershipId });
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
          ["date", "certificate", "testNumber", "outcome", "testType", "billing"] as const
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
        Upload VIR PDFs
      </button>

      {result && (
        <div className="vir-result" role="status" data-testid="status-vir-result">
          <CheckCircle2 size={18} aria-hidden="true" />
          <p>
            Saved {result.saved} reviewed inspection{result.saved === 1 ? "" : "s"} ·{" "}
            {result.billable} billable · {result.free} free · {result.skipped} skipped.{" "}
            {result.invoiceId ? (
              <a href={`/invoices/${result.invoiceId}`}>
                Open invoice draft {result.invoiceNumber ?? ""}
              </a>
            ) : (
              <a href={`/dealerships/${result.dealershipId}`}>View dealership services</a>
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
                    onChange={(e) => setDealer(e.target.value)}
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
              <label className="vir-drop">
                <FileUp size={22} aria-hidden="true" />
                <strong>Choose vehicle inspection report PDFs</strong>
                <span>Up to 10 files · 15 MB combined · 40 pages total</span>
                <input
                  ref={fileInput}
                  type="file"
                  name="reports"
                  accept="application/pdf,.pdf"
                  multiple
                  disabled={!!busy}
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
                Files are read once for review and discarded. The PDFs, full VINs and OCR text are
                never stored.
              </p>
              {busy === "preview" && (
                <div className="vir-progress" role="status" aria-live="polite">
                  <Loader2 size={16} className="vir-spin" aria-hidden="true" />
                  <span>
                    Reading reports on this server · {elapsedLabel(elapsed)} elapsed. Scanned pages
                    use local OCR and can take a few minutes. This window stays open until reading
                    finishes.
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
              <div className="vir-tally" data-testid="status-vir-tally">
                <div>
                  <span>Found</span>
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
                      : `${tally.bill} × ${money(preview.rateCents)} authorized rate${tally.tax !== null ? ` + ${money(tally.tax)} tax` : " · tax not configured"}`}
                  </small>
                </div>
              </div>

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
                        {src.duplicate && <span className="vir-chip bad">Already recorded</span>}
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
                      <fieldset
                        className="vir-fields"
                        disabled={src.duplicate || busy === "commit"}
                      >
                        <legend className="sr-only">Inspection fields for {src.source}</legend>
                        <label>
                          <span>Test date</span>
                          <input
                            type="date"
                            value={r.date}
                            onChange={(e) => patch(r.id, { date: e.target.value })}
                          />
                        </label>
                        <label>
                          <span>Certificate</span>
                          <input
                            value={r.certificate}
                            maxLength={40}
                            onChange={(e) => patch(r.id, { certificate: e.target.value })}
                          />
                        </label>
                        <label>
                          <span>Test number</span>
                          <input
                            value={r.testNumber}
                            maxLength={40}
                            onChange={(e) => patch(r.id, { testNumber: e.target.value })}
                          />
                        </label>
                        <label>
                          <span>Outcome</span>
                          <select
                            value={r.outcome}
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
                        placeholder="Auto-numbered if blank"
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        data-testid="input-vir-invoice-number"
                      />
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
                  Drafts need approval by a different owner or manager. Nothing is sent or charged
                  here.
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
                  {draftOn ? "Create invoice draft" : "Save reviewed inspections"}
                </button>
              </div>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
