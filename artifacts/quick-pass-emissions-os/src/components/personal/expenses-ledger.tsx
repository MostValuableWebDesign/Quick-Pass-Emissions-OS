"use client";

import { useRef, useState } from "react";
import type { ExpenseEntry, ExpenseView } from "@/modules/personal/expense-types";
import { centsToInput, fmtDay, KIND_TEXT, money, parseCents, rid } from "./expenses-api";
import type { Run } from "./expenses-workspace";

type Kind = ExpenseEntry["kind"];
const KINDS: Kind[] = ["PAYMENT", "REFUND", "REIMBURSEMENT", "REIMBURSEMENT_RETURN"];
const KIND_HINT: Record<Kind, string> = {
  PAYMENT: "Money that went to the vendor.",
  REFUND: "Money the vendor gave back. It lowers spending but does not reopen the balance.",
  REIMBURSEMENT:
    "The business repaying a personally funded purchase. Not counted as more spending.",
  REIMBURSEMENT_RETURN:
    "Part of an earlier reimbursement paid back to the business, e.g. after a refund.",
};

type EntryForm = {
  kind: Kind;
  amount: string;
  date: string;
  fundingSource: "BUSINESS" | "PERSONAL";
  paymentMethod: string;
  note: string;
  reason: string;
};

export function ExpenseLedger({
  expense,
  today,
  busy,
  run,
  archived,
}: {
  expense: ExpenseView;
  today: string;
  busy: boolean;
  run: Run;
  archived: boolean;
}) {
  const [mode, setMode] = useState<
    { kind: "add" } | { kind: "correct"; entry: ExpenseEntry } | null
  >(null);
  const [voiding, setVoiding] = useState<{ id: string; reason: string; error: string } | null>(
    null,
  );
  const entries = [...expense.entries].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );

  const doVoid = async () => {
    if (!voiding?.reason.trim()) return;
    const r = await run(
      {
        op: "entry.void",
        expenseId: expense.id,
        version: expense.version,
        entryId: voiding.id,
        reason: voiding.reason.trim(),
      },
      "Entry voided. It stays in history.",
    );
    if (!r.ok) setVoiding({ ...voiding, error: r.error });
    else setVoiding(null);
  };

  return (
    <section className="ex-sec">
      <div className="ex-sec-head">
        <h3 className="pw-doc-h">
          Money moved <span>{expense.entries.filter((e) => !e.voidedAt).length}</span>
        </h3>
        {!archived && !mode && (
          <button
            type="button"
            className="pw-btn pw-btn-sm pw-btn-primary"
            disabled={busy}
            onClick={() => setMode({ kind: "add" })}
            data-testid="button-add-entry"
          >
            Record money moved
          </button>
        )}
      </div>
      {mode && (
        <EntryEditor
          key={mode.kind === "correct" ? mode.entry.id : "add"}
          expense={expense}
          today={today}
          busy={busy}
          run={run}
          correcting={mode.kind === "correct" ? mode.entry : null}
          onDone={() => setMode(null)}
        />
      )}
      {entries.length ? (
        <ul className="ex-ledger">
          {entries.map((e) => (
            <li key={e.id} className={e.voidedAt ? "is-void" : ""} data-kind={e.kind}>
              <div className="ex-ledger-main">
                <strong>{KIND_TEXT[e.kind] ?? e.kind}</strong>
                <span className="ex-row-meta">
                  {fmtDay(e.date)} ·{" "}
                  {e.fundingSource === "PERSONAL" ? "Personal funds" : "Business funds"}
                  {e.paymentMethod ? ` · ${e.paymentMethod}` : ""}
                </span>
                {e.note && <span className="ex-row-meta">{e.note}</span>}
                {e.voidedAt && (
                  <span className="ex-void-note">
                    Voided {fmtDay(e.voidedAt)}
                    {e.voidReason ? `: ${e.voidReason}` : ""}
                  </span>
                )}
              </div>
              <span className="ex-num ex-ledger-amt">
                {e.kind === "PAYMENT" || e.kind === "REIMBURSEMENT_RETURN" ? "" : "−"}
                {money(e.amountCents)}
              </span>
              {!e.voidedAt && !archived && (
                <div className="ex-ledger-acts">
                  <button
                    type="button"
                    className="pw-link"
                    disabled={busy}
                    onClick={() => setMode({ kind: "correct", entry: e })}
                    data-testid={`button-correct-${e.id}`}
                  >
                    Correct
                  </button>
                  <button
                    type="button"
                    className="pw-link"
                    disabled={busy}
                    onClick={() => setVoiding({ id: e.id, reason: "", error: "" })}
                    data-testid={`button-void-${e.id}`}
                  >
                    Void
                  </button>
                </div>
              )}
              {voiding?.id === e.id && (
                <form
                  className="ex-void-form"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    void doVoid();
                  }}
                >
                  <input
                    autoFocus
                    placeholder="Why void it? e.g. Entered twice"
                    value={voiding.reason}
                    maxLength={200}
                    onChange={(ev) => setVoiding({ ...voiding, reason: ev.target.value })}
                    aria-label="Void reason"
                    data-testid="input-void-reason"
                  />
                  <button
                    type="submit"
                    className="pw-btn pw-btn-sm pw-btn-danger"
                    disabled={busy || !voiding.reason.trim()}
                  >
                    Void entry
                  </button>
                  <button
                    type="button"
                    className="pw-btn pw-btn-sm pw-btn-quiet"
                    onClick={() => setVoiding(null)}
                  >
                    Cancel
                  </button>
                  {voiding.error && (
                    <p className="pw-error-text" role="alert">
                      {voiding.error}
                    </p>
                  )}
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !mode && (
          <p className="pw-hint">
            No payments yet.{" "}
            {expense.amountCents == null ? "Add the total first, then record what you paid." : ""}
          </p>
        )
      )}
    </section>
  );
}

function EntryEditor({
  expense,
  today,
  busy,
  run,
  correcting,
  onDone,
}: {
  expense: ExpenseView;
  today: string;
  busy: boolean;
  run: Run;
  correcting: ExpenseEntry | null;
  onDone: () => void;
}) {
  const t = expense.totals;
  const [f, setF] = useState<EntryForm>(() =>
    correcting
      ? {
          kind: correcting.kind,
          amount: centsToInput(correcting.amountCents),
          date: correcting.date.slice(0, 10),
          fundingSource: correcting.fundingSource,
          paymentMethod: correcting.paymentMethod,
          note: correcting.note,
          reason: "",
        }
      : {
          kind: "PAYMENT",
          amount: t.balanceCents && t.balanceCents > 0 ? centsToInput(t.balanceCents) : "",
          date: today,
          fundingSource: "BUSINESS",
          paymentMethod: expense.paymentMethod,
          note: "",
          reason: "",
        },
  );
  const [error, setError] = useState("");
  const idRef = useRef(rid());
  const set = (p: Partial<EntryForm>) => setF((x) => ({ ...x, ...p }));
  const cents = parseCents(f.amount);

  // Gentle client checks; the server is the final word.
  const prior =
    correcting && !correcting.voidedAt && correcting.kind === f.kind ? correcting.amountCents : 0;
  let problem = "";
  if (Number.isNaN(cents)) problem = "Use a dollar amount like 84.17.";
  else if (cents !== null && cents <= 0) problem = "Amount must be more than zero.";
  else if (f.date > today) problem = "Money moved can only be recorded for today or earlier.";
  else if (f.kind === "PAYMENT" && expense.amountCents == null)
    problem = "Save a total for this expense before recording a payment.";
  else if (
    f.kind === "PAYMENT" &&
    cents != null &&
    expense.amountCents != null &&
    t.paidCents - prior + cents > expense.amountCents
  )
    problem = `Payments would exceed the ${money(expense.amountCents)} total.`;
  else if (f.kind === "REFUND" && cents != null && cents > t.paidCents - t.refundedCents + prior)
    problem = "A refund cannot be more than what was paid.";
  const reasonNeeded = !!correcting && !f.reason.trim();

  const submit = async () => {
    if (problem || cents == null || reasonNeeded) return;
    setError("");
    const body = {
      expenseId: expense.id,
      version: expense.version,
      kind: f.kind,
      amountCents: cents,
      date: f.date,
      fundingSource: f.fundingSource,
      paymentMethod: f.paymentMethod.trim(),
      note: f.note.trim(),
    };
    const r = await run(
      correcting
        ? {
            op: "entry.correct",
            ...body,
            id: idRef.current,
            entryId: correcting.id,
            reason: f.reason.trim(),
          }
        : { op: "entry.add", ...body, id: idRef.current },
      correcting
        ? "Correction recorded. Original kept in history."
        : `${KIND_TEXT[f.kind]} recorded.`,
    );
    if (!r.ok) return setError(r.error);
    onDone();
  };

  return (
    <form
      className="ex-entry"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="pw-panel-title">{correcting ? "Correct entry" : "Record money moved"}</p>
      <fieldset className="pw-seg ex-seg">
        <legend>Kind</legend>
        {KINDS.map((k) => (
          <button
            type="button"
            key={k}
            className={f.kind === k ? "is-on" : ""}
            aria-pressed={f.kind === k}
            onClick={() =>
              set({ kind: k, fundingSource: k === "PAYMENT" ? f.fundingSource : "PERSONAL" })
            }
            data-testid={`seg-kind-${k.toLowerCase()}`}
          >
            {KIND_TEXT[k]}
          </button>
        ))}
      </fieldset>
      <p className="pw-hint">{KIND_HINT[f.kind]}</p>
      {t.reimbursementReturnDueCents > 0 && (
        <p className="ex-missing ex-missing-block">
          A refund left your reimbursement {money(t.reimbursementReturnDueCents)} too high. Record a
          reimbursement return once you pay it back.
        </p>
      )}
      <div className="ex-grid">
        <label className="pw-field">
          <span>Amount (USD)</span>
          <input
            inputMode="decimal"
            className="ex-num"
            value={f.amount}
            onChange={(e) => set({ amount: e.target.value })}
            required
            data-testid="input-entry-amount"
          />
        </label>
        <label className="pw-field">
          <span>Date</span>
          <input
            type="date"
            value={f.date}
            max={today}
            onChange={(e) => set({ date: e.target.value })}
            required
            data-testid="input-entry-date"
          />
        </label>
        {(f.kind === "PAYMENT" || f.kind === "REFUND") && (
          <fieldset className="pw-seg">
            <legend>{f.kind === "REFUND" ? "Refund returned to" : "Paid from"}</legend>
            {(["BUSINESS", "PERSONAL"] as const).map((s) => (
              <button
                type="button"
                key={s}
                className={f.fundingSource === s ? "is-on" : ""}
                aria-pressed={f.fundingSource === s}
                onClick={() => set({ fundingSource: s })}
              >
                {s === "BUSINESS" ? "Business" : "My own money"}
              </button>
            ))}
          </fieldset>
        )}
        <label className="pw-field">
          <span>
            Method <em>optional</em>
          </span>
          <input
            value={f.paymentMethod}
            maxLength={80}
            onChange={(e) => set({ paymentMethod: e.target.value })}
          />
        </label>
        <label className="pw-field ex-span">
          <span>
            Note <em>optional</em>
          </span>
          <input value={f.note} maxLength={300} onChange={(e) => set({ note: e.target.value })} />
        </label>
        {correcting && (
          <label className="pw-field ex-span">
            <span>Reason for correction</span>
            <input
              value={f.reason}
              maxLength={200}
              placeholder="e.g. Wrong amount on first entry"
              onChange={(e) => set({ reason: e.target.value })}
              data-testid="input-correct-reason"
            />
          </label>
        )}
      </div>
      {problem && f.amount && <p className="pw-error-text">{problem}</p>}
      {error && (
        <p className="pw-error-text" role="alert">
          {error} Your entry is still here.
        </p>
      )}
      <div className="ex-form-foot">
        <button type="button" className="pw-btn pw-btn-sm pw-btn-quiet" onClick={onDone}>
          Cancel
        </button>
        <button
          type="submit"
          className="pw-btn pw-btn-sm pw-btn-primary"
          disabled={busy || !!problem || cents == null || reasonNeeded}
          data-testid="button-save-entry"
        >
          {correcting ? "Save correction" : "Record"}
        </button>
      </div>
    </form>
  );
}
