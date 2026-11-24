"use client";

import { useRef, useState } from "react";
import type { ExpenseWorkspaceData } from "@/modules/personal/expense-types";
import { fmtDay, money, parseCents, rid } from "./expenses-api";
import type { Run } from "./expenses-workspace";

export type Source = { kind: "note" | "task"; id: string; title: string; found: boolean } | null;

export function ExpenseQuickAdd({
  data,
  busy,
  run,
  source,
  notify,
  onOpen,
}: {
  data: ExpenseWorkspaceData;
  busy: boolean;
  run: Run;
  source: Source;
  notify: (t: "ok" | "err", s: string) => void;
  onOpen: (id: string) => void;
}) {
  const [title, setTitle] = useState(source?.found ? source.title : "");
  const [amount, setAmount] = useState("");
  const [planned, setPlanned] = useState(true);
  const [error, setError] = useState("");
  const [dupId, setDupId] = useState<string | null>(null);
  const idRef = useRef(rid());
  const cents = parseCents(amount);
  const badAmount = Number.isNaN(cents);
  const dup = dupId ? data.expenses.find((e) => e.id === dupId) : undefined;
  const sourceLink = source?.found ? { [source.kind === "note" ? "noteId" : "taskId"]: source.id } : {};

  const submit = async (allowDuplicate = false) => {
    if (!title.trim() || badAmount) return;
    setError("");
    const r = await run(
      {
        op: "expense.create",
        id: idRef.current,
        title: title.trim(),
        amountCents: cents,
        planned,
        date: data.today,
        ...sourceLink,
        ...(allowDuplicate ? { allowDuplicate: true } : {}),
      },
      source?.found ? "Expense recorded and linked." : "Expense recorded.",
    );
    if (!r.ok) return setError(r.error);
    if (r.res.duplicateOf) return setDupId(r.res.duplicateOf);
    const newId = r.res.expenseId ?? idRef.current;
    idRef.current = rid();
    setTitle("");
    setAmount("");
    setPlanned(true);
    setDupId(null);
    onOpen(newId);
  };

  const reuse = async () => {
    if (!dup) return;
    if (source?.found && !dup.links.some((l) => l.noteId === source.id || l.taskId === source.id)) {
      const r = await run(
        { op: "expense.link", id: dup.id, version: dup.version, ...sourceLink },
        "Linked the existing expense.",
      );
      if (!r.ok) return setError(r.error);
    } else notify("ok", "Opened the existing expense.");
    setDupId(null);
    setTitle("");
    setAmount("");
    onOpen(dup.id);
  };

  return (
    <form
      className="ex-quick"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="ex-quick-row">
        <input
          value={title}
          maxLength={200}
          placeholder="What was it for? e.g. Brush motor rebuild"
          aria-label="Expense title"
          onChange={(e) => {
            setTitle(e.target.value);
            setDupId(null);
          }}
          data-testid="input-quick-title"
        />
        <input
          className="ex-amt"
          inputMode="decimal"
          value={amount}
          placeholder="$ total"
          aria-label="Total amount, optional"
          aria-invalid={badAmount}
          onChange={(e) => setAmount(e.target.value)}
          data-testid="input-quick-amount"
        />
      </div>
      <div className="ex-quick-row">
        <label className="pw-switch">
          <input type="checkbox" checked={planned} onChange={(e) => setPlanned(e.target.checked)} />
          <span>Still planned</span>
        </label>
        <button
          type="submit"
          className="pw-btn pw-btn-sm pw-btn-primary"
          disabled={busy || !title.trim() || badAmount}
          data-testid="button-quick-add"
        >
          {source?.found ? `Record for this ${source.kind}` : "Record expense"}
        </button>
      </div>
      {badAmount && <p className="pw-error-text">Use a dollar amount like 84.17.</p>}
      {error && (
        <p className="pw-error-text" role="alert">
          {error}
        </p>
      )}
      {dupId && (
        <div className="ex-dup" role="alert">
          <p>
            <strong>This looks like one you already wrote down.</strong>
            {dup ? (
              <>
                {" "}
                {dup.title} · {dup.vendor || "no vendor"} · {money(dup.amountCents)} ·{" "}
                {dup.date ? fmtDay(dup.date) : "no date"}
              </>
            ) : null}
          </p>
          <div className="ex-dup-acts">
            <button
              type="button"
              className="pw-btn pw-btn-sm pw-btn-primary"
              disabled={busy}
              onClick={reuse}
              data-testid="button-reuse-duplicate"
            >
              {source?.found ? "Use and link that one" : "Open that one"}
            </button>
            <button
              type="button"
              className="pw-btn pw-btn-sm pw-btn-quiet"
              disabled={busy}
              onClick={() => void submit(true)}
              data-testid="button-allow-duplicate"
            >
              No, record a separate one
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
