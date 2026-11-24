"use client";

import { useRef, useState } from "react";
import type { ExpenseView, ExpenseWorkspaceData } from "@/modules/personal/expense-types";
import {
  errText,
  fmtBytes,
  fmtDay,
  RECEIPT_MAX,
  RECEIPT_TYPES,
  uploadReceipt,
} from "./expenses-api";

type Up = { key: string; name: string; pct: number; error: string; file: File };

export function ExpenseAttachments({
  expense,
  setData,
  reload,
  archived,
}: {
  expense: ExpenseView;
  setData: (d: ExpenseWorkspaceData) => void;
  reload: () => Promise<boolean>;
  archived: boolean;
}) {
  const [ups, setUps] = useState<Up[]>([]);
  const [pickErr, setPickErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const done = expense.attachments.filter((a) => a.uploadedAt);

  const patch = (key: string, p: Partial<Up>) =>
    setUps((l) => l.map((u) => (u.key === key ? { ...u, ...p } : u)));

  const start = async (file: File, key = `${file.name}-${crypto.randomUUID()}`) => {
    setUps((l) =>
      l.some((u) => u.key === key)
        ? l.map((u) => (u.key === key ? { ...u, pct: 0, error: "" } : u))
        : [...l, { key, name: file.name, pct: 0, error: "", file }],
    );
    try {
      const next = await uploadReceipt(expense.id, file, (pct) => patch(key, { pct }));
      if (next) setData(next);
      else await reload();
      setUps((l) => l.filter((u) => u.key !== key));
    } catch (e) {
      patch(key, { error: errText(e, "Upload failed.") });
    }
  };

  const onPick = (files: FileList | null) => {
    setPickErr("");
    for (const f of Array.from(files ?? [])) {
      if (!RECEIPT_TYPES.includes(f.type)) {
        setPickErr(`${f.name}: only PDF, PNG, JPEG or WEBP.`);
        continue;
      }
      if (f.size > RECEIPT_MAX) {
        setPickErr(`${f.name} is ${fmtBytes(f.size)}. The limit is 25 MB.`);
        continue;
      }
      void start(f);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <section className="ex-sec">
      <div className="ex-sec-head">
        <h3 className="pw-doc-h">
          Receipts <span>{done.length}</span>
        </h3>
        {!archived && (
          <label className="pw-btn pw-btn-sm pw-btn-quiet ex-file">
            Attach receipt
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
              multiple
              onChange={(e) => onPick(e.target.files)}
              data-testid="input-receipt"
            />
          </label>
        )}
      </div>
      {pickErr && (
        <p className="pw-error-text" role="alert">
          {pickErr}
        </p>
      )}
      {ups.map((u) => (
        <div key={u.key} className={`ex-up ${u.error ? "is-err" : ""}`}>
          <span>{u.name}</span>
          {u.error ? (
            <>
              <em role="alert">{u.error}</em>
              <button type="button" className="pw-link" onClick={() => void start(u.file, u.key)}>
                Retry
              </button>
              <button
                type="button"
                className="pw-link"
                onClick={() => setUps((l) => l.filter((x) => x.key !== u.key))}
              >
                Dismiss
              </button>
            </>
          ) : (
            <span
              className="ex-bar"
              role="progressbar"
              aria-valuenow={u.pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ transform: `scaleX(${u.pct / 100})` }} />
            </span>
          )}
        </div>
      ))}
      {done.length ? (
        <ul className="ex-files">
          {done.map((a) => (
            <li key={a.id}>
              <a
                href={`/api/personal/expenses/attachments/${a.id}`}
                target="_blank"
                rel="noreferrer"
                data-testid={`link-receipt-${a.id}`}
              >
                <b>{a.mimeType === "application/pdf" ? "PDF" : "IMG"}</b>
                {a.filename}
              </a>
              <small>
                {fmtBytes(a.byteSize)} · {fmtDay(a.uploadedAt)}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        !ups.length && (
          <p className="pw-hint">PDF, PNG, JPEG or WEBP up to 25 MB. Only you can open them.</p>
        )
      )}
    </section>
  );
}
