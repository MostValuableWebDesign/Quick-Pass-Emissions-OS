"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ExpenseFields,
  ExpenseView,
  ExpenseWorkspaceData,
} from "@/modules/personal/expense-types";
import {
  centsToInput,
  errText,
  expenseLoad,
  fieldsOf,
  fmtDay,
  missingLabel,
  money,
  parseCents,
  STATUS_TEXT,
} from "./expenses-api";
import { ExpenseLedger } from "./expenses-ledger";
import { ExpenseAttachments } from "./expenses-attachments";
import type { Run } from "./expenses-workspace";

type Form = Omit<ExpenseFields, "amountCents"> & { amount: string };
const toForm = (e: ExpenseView): Form => {
  const { amountCents, ...rest } = fieldsOf(e);
  return { ...rest, amount: centsToInput(amountCents) };
};

export function ExpenseDetail({
  expense,
  data,
  busy,
  run,
  notify,
  reload,
  setData,
  onDirty,
  onClosed,
}: {
  expense: ExpenseView;
  data: ExpenseWorkspaceData;
  busy: boolean;
  run: Run;
  notify: (t: "ok" | "err", s: string) => void;
  reload: () => Promise<boolean>;
  setData: (d: ExpenseWorkspaceData) => void;
  onDirty: (d: boolean) => void;
  onClosed: () => void;
}) {
  const [form, setForm] = useState<Form>(() => toForm(expense));
  const [base, setBase] = useState(() => JSON.stringify(toForm(expense)));
  const [err, setErr] = useState<{ text: string; stale: boolean } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const versionRef = useRef(expense.version);
  const savingRef = useRef(false);

  const dirty = JSON.stringify(form) !== base;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);

  // Adopt server changes when there are no local edits.
  useEffect(() => {
    if (expense.version > versionRef.current && !dirty && !err) {
      versionRef.current = expense.version;
      const f = toForm(expense);
      setForm(f);
      setBase(JSON.stringify(f));
    }
  }, [expense, dirty, err]);

  const cents = parseCents(form.amount);
  const badAmount = Number.isNaN(cents);
  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));

  const save = async (version = versionRef.current) => {
    if (savingRef.current || !form.title.trim() || badAmount) return;
    savingRef.current = true;
    const sent = JSON.stringify(form);
    const { amount, ...rest } = form;
    void amount;
    const r = await run(
      {
        op: "expense.save",
        id: expense.id,
        version,
        ...rest,
        title: form.title.trim(),
        date: form.date || null,
        amountCents: cents,
      },
      "Expense saved.",
    );
    savingRef.current = false;
    if (!r.ok) return setErr({ text: r.error, stale: r.stale });
    setErr(null);
    const saved = r.res.data.expenses.find((x) => x.id === expense.id);
    if (saved) {
      versionRef.current = Math.max(versionRef.current, saved.version);
      const f = toForm(saved);
      setForm((current) => (JSON.stringify(current) === sent ? f : current));
      setBase(JSON.stringify(f));
    }
  };

  const keepMine = async () => {
    try {
      const next = await expenseLoad();
      setData(next);
      const latest = next.expenses.find((x) => x.id === expense.id);
      if (!latest) return setErr({ text: "This expense no longer exists.", stale: false });
      await save(latest.version);
    } catch (e) {
      setErr({ text: errText(e), stale: true });
    }
  };
  const loadSaved = async () => {
    try {
      const next = await expenseLoad();
      const latest = next.expenses.find((e) => e.id === expense.id);
      if (!latest) throw new Error("This expense is unavailable.");
      setData(next);
      versionRef.current = latest.version;
      const fields = toForm(latest);
      setForm(fields);
      setBase(JSON.stringify(fields));
      setErr(null);
    } catch (error) {
      setErr({ text: errText(error), stale: true });
    }
  };

  const archive = async (archived: boolean) => {
    const r = await run(
      { op: "expense.archive", id: expense.id, version: expense.version, archived },
      archived ? "Expense archived." : "Expense back in the book.",
    );
    setConfirmArchive(false);
    if (!r.ok) return notify("err", r.error);
    if (archived) onClosed();
  };

  const unlink = async (linkId: string) => {
    const r = await run(
      { op: "expense.unlink", id: expense.id, version: expense.version, linkId },
      "Link removed.",
    );
    if (!r.ok) notify("err", r.error);
  };

  const t = expense.totals;
  const archived = !!expense.archivedAt;

  return (
    <article className="pw-editor ex-editor">
      <div className="pw-toolbar">
        <span className={`ex-status ex-status-${t.status.toLowerCase()}`}>
          {STATUS_TEXT[t.status]}
        </span>
        <span className="pw-stamp">Updated {fmtDay(expense.updatedAt)}</span>
        <div className="pw-toolbar-actions">
          {confirmArchive ? (
            <span className="ex-confirm" role="alert">
              Archive this expense? It stays in reports and can be restored.
              <button
                type="button"
                className="pw-btn pw-btn-sm pw-btn-danger"
                disabled={busy}
                onClick={() => archive(true)}
                data-testid="button-confirm-archive"
              >
                Archive
              </button>
              <button
                type="button"
                className="pw-btn pw-btn-sm pw-btn-quiet"
                onClick={() => setConfirmArchive(false)}
              >
                Keep
              </button>
            </span>
          ) : archived ? (
            <button
              type="button"
              className="pw-btn pw-btn-sm pw-btn-primary"
              disabled={busy}
              onClick={() => archive(false)}
              data-testid="button-unarchive"
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              className="pw-btn pw-btn-sm pw-btn-quiet"
              disabled={busy}
              onClick={() => setConfirmArchive(true)}
              data-testid="button-archive"
            >
              Archive
            </button>
          )}
        </div>
      </div>
      {archived && (
        <p className="pw-banner">
          Archived {fmtDay(expense.archivedAt)}. Restore it to make changes.
        </p>
      )}

      <div className="pw-paper ex-paper">
        <div className="ex-figures">
          <Fig label="Total" v={money(expense.amountCents)} />
          <Fig label="Paid" v={money(t.paidCents)} />
          <Fig label="Refunded" v={money(t.refundedCents)} />
          <Fig label="Net spent" v={money(t.spentCents)} strong />
          <Fig
            label="Vendor balance"
            v={t.balanceCents == null ? "Total unknown" : money(t.balanceCents)}
          />
          <Fig label="Reimbursed" v={money(t.reimbursedCents)} />
          {(t.reimbursementReturnDueCents ?? 0) > 0 && (
            <Fig label="Reimbursement to return" v={money(t.reimbursementReturnDueCents)} warn />
          )}
          {t.personalOutstandingCents > 0 && (
            <Fig label="Owed back to you" v={money(t.personalOutstandingCents)} warn />
          )}
        </div>
        {expense.missing.length > 0 && (
          <p className="ex-missing ex-missing-block">
            Missing: {expense.missing.map(missingLabel).join(", ")}. Fill in whenever you have it.
          </p>
        )}

        <form
          className="ex-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={archived || busy} className="ex-grid">
            <label className="pw-field ex-span">
              <span>Title</span>
              <input
                className="pw-title-input"
                value={form.title}
                maxLength={200}
                onChange={(e) => set({ title: e.target.value })}
                aria-invalid={!form.title.trim()}
                data-testid="input-title"
              />
            </label>
            <label className="pw-field">
              <span>
                Total (USD) <em>optional</em>
              </span>
              <input
                inputMode="decimal"
                className="ex-num"
                value={form.amount}
                placeholder="0.00"
                onChange={(e) => set({ amount: e.target.value })}
                aria-invalid={badAmount}
                data-testid="input-amount"
              />
            </label>
            <label className="pw-field">
              <span>Date</span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set({ date: e.target.value })}
                data-testid="input-date"
              />
            </label>
            <label className="pw-field">
              <span>Vendor</span>
              <input
                value={form.vendor}
                maxLength={120}
                onChange={(e) => set({ vendor: e.target.value })}
                data-testid="input-vendor"
              />
            </label>
            <label className="pw-field">
              <span>Category</span>
              <input
                value={form.category}
                maxLength={80}
                list="ex-categories"
                placeholder="Supplies, Equipment repair…"
                onChange={(e) => set({ category: e.target.value })}
                data-testid="input-category"
              />
            </label>
            <label className="pw-field">
              <span>Payment method</span>
              <input
                value={form.paymentMethod}
                maxLength={80}
                list="ex-methods"
                placeholder="Business card, check…"
                onChange={(e) => set({ paymentMethod: e.target.value })}
                data-testid="input-method"
              />
            </label>
            <label className="pw-switch ex-planned">
              <input
                type="checkbox"
                checked={form.planned}
                onChange={(e) => set({ planned: e.target.checked })}
                data-testid="toggle-planned"
              />
              <span>Still planned (not bought yet)</span>
            </label>
            <label className="pw-field ex-span">
              <span>Business purpose</span>
              <textarea
                rows={2}
                value={form.purpose}
                placeholder="Why the shop needed it"
                onChange={(e) => set({ purpose: e.target.value })}
                data-testid="input-purpose"
              />
            </label>
            <datalist id="ex-categories">
              {[...new Set(data.expenses.map((x) => x.category).filter(Boolean))].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <datalist id="ex-methods">
              {[...new Set(data.expenses.map((x) => x.paymentMethod).filter(Boolean))].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </fieldset>
          {badAmount && <p className="pw-error-text">Use a dollar amount like 1,240.50.</p>}
          {err && (
            <div className="pw-save-alert" role="alert">
              <div>
                <strong>{err.stale ? "Changed somewhere else" : "Not saved"}</strong>
                <span>{err.text} Your edits are still here.</span>
              </div>
              <div className="pw-save-actions">
                {err.stale ? (
                  <>
                    <button
                      type="button"
                      className="pw-btn pw-btn-sm pw-btn-primary"
                      onClick={keepMine}
                    >
                      Keep my edits
                    </button>
                    <button
                      type="button"
                      className="pw-btn pw-btn-sm pw-btn-quiet"
                      onClick={loadSaved}
                    >
                      Load saved version
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="pw-btn pw-btn-sm pw-btn-primary"
                    onClick={() => save()}
                  >
                    Retry save
                  </button>
                )}
              </div>
            </div>
          )}
          {!archived && (
            <div className="ex-form-foot">
              <span className="pw-hint">{dirty ? "Unsaved changes" : "All details saved"}</span>
              {dirty && (
                <button
                  type="button"
                  className="pw-btn pw-btn-sm pw-btn-quiet"
                  onClick={() => {
                    setForm(JSON.parse(base) as Form);
                    setErr(null);
                  }}
                >
                  Discard
                </button>
              )}
              <button
                type="submit"
                className="pw-btn pw-btn-sm pw-btn-primary"
                disabled={busy || !dirty || !form.title.trim() || badAmount}
                data-testid="button-save-expense"
              >
                Save details
              </button>
            </div>
          )}
        </form>

        {dirty && (
          <p className="pw-hint">
            Save or discard detail changes before recording money or changing links.
          </p>
        )}
        <ExpenseLedger
          expense={expense}
          today={data.today}
          busy={busy || dirty}
          run={run}
          archived={archived}
        />
        <ExpenseAttachments
          expense={expense}
          setData={setData}
          reload={reload}
          archived={archived}
        />

        <section className="ex-sec">
          <h3 className="pw-doc-h">
            Linked notes &amp; tasks <span>{expense.links.length}</span>
          </h3>
          {expense.links.length ? (
            <ul className="ex-links">
              {expense.links.map((l) => {
                const label = l.noteId
                  ? `Note: ${data.notes.find((n) => n.id === l.noteId)?.title || "Untitled note"}`
                  : `Task: ${data.tasks.find((n) => n.id === l.taskId)?.title || "Untitled task"}`;
                return (
                  <li key={l.id}>
                    <span>{label}</span>
                    {!archived && (
                      <button
                        type="button"
                        className="pw-link"
                        disabled={busy || dirty}
                        onClick={() => unlink(l.id)}
                        data-testid={`button-unlink-${l.id}`}
                      >
                        Unlink
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="pw-hint">Open a note or task and choose Expense to link it here.</p>
          )}
        </section>

        <section className="ex-sec">
          <h3 className="pw-doc-h">
            History <span>{expense.history.length}</span>
          </h3>
          {expense.history.length ? (
            <ol className="ex-history">
              {[...expense.history]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((h) => (
                  <li key={h.id}>
                    <time>{fmtDay(h.createdAt)}</time>
                    <span>
                      <strong>{h.action.replace(/[._]/g, " ").toLowerCase()}</strong>
                      {h.detail ? ` · ${h.detail}` : ""}
                    </span>
                  </li>
                ))}
            </ol>
          ) : (
            <p className="pw-hint">Changes will be listed here.</p>
          )}
        </section>
      </div>
    </article>
  );
}

function Fig({
  label,
  v,
  strong,
  warn,
}: {
  label: string;
  v: string;
  strong?: boolean;
  warn?: boolean;
}) {
  return (
    <div className={`ex-fig ${strong ? "is-strong" : ""} ${warn ? "is-warn" : ""}`}>
      <span>{label}</span>
      <b className="ex-num">{v}</b>
    </div>
  );
}
