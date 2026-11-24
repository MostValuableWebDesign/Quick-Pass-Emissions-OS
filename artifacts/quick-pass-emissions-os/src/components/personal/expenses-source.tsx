"use client";

import { useState } from "react";
import Link from "next/link";
import type { ExpenseWorkspaceData } from "@/modules/personal/expense-types";
import { money, STATUS_TEXT } from "./expenses-api";
import type { Source } from "./expenses-quick";
import type { Run } from "./expenses-workspace";

export function ExpenseSourcePanel({
  source,
  data,
  busy,
  run,
  notify,
  onOpen,
}: {
  source: NonNullable<Source>;
  data: ExpenseWorkspaceData;
  busy: boolean;
  run: Run;
  notify: (t: "ok" | "err", s: string) => void;
  onOpen: (id: string) => void;
}) {
  const [pick, setPick] = useState("");
  const [q, setQ] = useState("");
  const isLinked = (l: { noteId: string | null; taskId: string | null }) =>
    source.kind === "note" ? l.noteId === source.id : l.taskId === source.id;
  const linked = data.expenses.filter((e) => e.links.some(isLinked));
  const candidates = data.expenses
    .filter((e) => !e.archivedAt && !e.links.some(isLinked))
    .filter((e) => !q.trim() || `${e.title} ${e.vendor}`.toLowerCase().includes(q.toLowerCase()));

  if (!source.found)
    return (
      <div className="pw-banner" role="alert">
        That {source.kind} could not be found. It may have been deleted.{" "}
        <Link href="/notes/expenses" className="pw-link">
          Show all expenses
        </Link>
      </div>
    );

  const link = async () => {
    const e = data.expenses.find((x) => x.id === pick);
    if (!e) return;
    const r = await run(
      {
        op: "expense.link",
        id: e.id,
        version: e.version,
        [source.kind === "note" ? "noteId" : "taskId"]: source.id,
      },
      `Linked to this ${source.kind}.`,
    );
    if (!r.ok) notify("err", r.error);
    else setPick("");
  };

  return (
    <section className="ex-source" aria-label={`Expenses for this ${source.kind}`}>
      <div className="ex-source-head">
        <div>
          <span className="pw-kicker">From {source.kind}</span>
          <strong>{source.title}</strong>
        </div>
        <Link href="/notes" className="pw-btn pw-btn-sm pw-btn-quiet" data-testid="link-return-notes">
          Back to Notes &amp; Tasks
        </Link>
      </div>
      {linked.length ? (
        <ul className="ex-chips">
          {linked.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onOpen(e.id)} data-testid={`chip-linked-${e.id}`}>
                {e.title} <span className="ex-num">{money(e.amountCents)}</span>{" "}
                <em>{STATUS_TEXT[e.totals.status]}</em>
                {e.archivedAt ? <em> · archived</em> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pw-hint">Nothing linked yet. Record a new expense below or link one you already saved.</p>
      )}
      <div className="ex-picker">
        <input
          type="search"
          placeholder="Find a saved expense"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Filter saved expenses"
        />
        <select
          className="pw-select"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          aria-label="Saved expense to link"
          data-testid="select-link-existing"
        >
          <option value="">
            {candidates.length ? "Choose a saved expense" : "No other saved expenses"}
          </option>
          {candidates.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} {e.vendor ? `· ${e.vendor}` : ""} · {money(e.amountCents)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="pw-btn pw-btn-sm pw-btn-quiet"
          disabled={busy || !pick}
          onClick={link}
          data-testid="button-link-existing"
        >
          Link existing
        </button>
      </div>
    </section>
  );
}
