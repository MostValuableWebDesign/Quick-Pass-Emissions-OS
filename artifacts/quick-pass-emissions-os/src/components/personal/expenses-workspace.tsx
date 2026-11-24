"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExpenseWorkspaceData } from "@/modules/personal/expense-types";
import {
  type CommandResult,
  errText,
  expenseCommand,
  expenseLoad,
  fmtDay,
  isStale,
  missingLabel,
  mergeExpenseWorkspace,
  money,
  STATUS_TEXT,
} from "./expenses-api";
import { ExpenseQuickAdd } from "./expenses-quick";
import { ExpenseDetail } from "./expenses-detail";
import { ExpenseReports } from "./expenses-report";
import { ExpenseSourcePanel } from "./expenses-source";
import "../personal-workspace.css";
import "./expenses.css";

export type RunResult =
  { ok: true; res: CommandResult } | { ok: false; error: string; stale: boolean };
export type Run = (body: Record<string, unknown>, okText?: string) => Promise<RunResult>;

type Filter = "open" | "planned" | "paid" | "missing" | "all" | "archived";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "planned", label: "Planned" },
  { id: "paid", label: "Paid" },
  { id: "missing", label: "Missing details" },
  { id: "all", label: "All" },
  { id: "archived", label: "Archived" },
];

export type ExpenseSourceRef = { kind: "note" | "task"; id: string };

export function ExpenseWorkspace({
  initialData,
  sourceRef = null,
  embedded = false,
  onDirtyChange,
}: {
  initialData: ExpenseWorkspaceData;
  sourceRef?: ExpenseSourceRef | null;
  embedded?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const noteId = sourceRef?.kind === "note" ? sourceRef.id : null;
  const taskId = sourceRef?.kind === "task" ? sourceRef.id : null;
  const [data, setDataState] = useState(initialData);
  const setData = useCallback((incoming: ExpenseWorkspaceData) => {
    setDataState((previous) => mergeExpenseWorkspace(previous, incoming));
  }, []);
  const [tab, setTab] = useState<"book" | "reports">("book");
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pane, setPane] = useState<"list" | "detail">("list");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const dirtyRef = useRef(false);
  const [hasDirty, setHasDirty] = useState(false);
  const markDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
    setHasDirty(dirty);
  }, []);
  const reportDirty = useCallback(
    (dirty: boolean) => {
      markDirty(dirty);
      onDirtyChange?.(dirty);
    },
    [markDirty, onDirtyChange],
  );

  const source = useMemo(() => {
    if (noteId) {
      const n = data.notes.find((x) => x.id === noteId);
      return { kind: "note" as const, id: noteId, title: n?.title || "Untitled note", found: !!n };
    }
    if (taskId) {
      const t = data.tasks.find((x) => x.id === taskId);
      return { kind: "task" as const, id: taskId, title: t?.title || "Untitled task", found: !!t };
    }
    return null;
  }, [noteId, taskId, data.notes, data.tasks]);

  const notify = useCallback((tone: "ok" | "err", text: string) => {
    setFlash({ tone, text });
    setTimeout(() => setFlash((f) => (f?.text === text ? null : f)), tone === "ok" ? 2600 : 6500);
  }, []);

  const run: Run = useCallback(
    async (body, okText) => {
      setBusy(true);
      try {
        const res = await expenseCommand(body);
        setData(res.data);
        if (okText && !res.duplicateOf) notify("ok", okText);
        return { ok: true, res };
      } catch (e) {
        return { ok: false, error: errText(e), stale: isStale(e) };
      } finally {
        setBusy(false);
      }
    },
    [notify, setData],
  );

  const reload = useCallback(async () => {
    try {
      setData(await expenseLoad());
      setLoadErr("");
      return true;
    } catch (e) {
      setLoadErr(errText(e, "Could not refresh."));
      return false;
    }
  }, [setData]);

  useEffect(() => {
    const onFocus = () => {
      if (!dirtyRef.current) void reload();
    };
    const onBefore = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    const onNavigate = (event: MouseEvent) => {
      if (!dirtyRef.current || !(event.target instanceof Element)) return;
      const anchor = event.target.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.pathname.startsWith("/api/") || anchor.getAttribute("href")?.startsWith("#")) return;
      event.preventDefault();
      event.stopPropagation();
      notify("err", "Save or discard your expense changes before leaving.");
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("beforeunload", onBefore);
    document.addEventListener("click", onNavigate, true);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeunload", onBefore);
      document.removeEventListener("click", onNavigate, true);
    };
  }, [reload, notify]);

  const open = (id: string) => {
    if (dirtyRef.current && id !== selectedId) {
      notify("err", "Save or discard your expense changes before switching expenses.");
      return;
    }
    setSelectedId(id);
    setPane("detail");
    setTab("book");
    if (!data.expenses.find((x) => x.id === id && !x.archivedAt)) return;
    if (filter === "archived") setFilter("all");
  };

  const q = search.trim().toLowerCase();
  const list = useMemo(() => {
    let l = data.expenses.filter((e) => {
      if (filter === "archived") return !!e.archivedAt;
      if (e.archivedAt) return false;
      if (filter === "open") return e.totals.status !== "PAID";
      if (filter === "planned") return e.totals.status === "PLANNED";
      if (filter === "paid") return e.totals.status === "PAID";
      if (filter === "missing") return e.missing.length > 0;
      return true;
    });
    if (q)
      l = l.filter((e) =>
        `${e.title}\n${e.vendor}\n${e.category}\n${e.purpose}`.toLowerCase().includes(q),
      );
    return [...l].sort(
      (a, b) =>
        (b.date || b.createdAt).localeCompare(a.date || a.createdAt) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [data.expenses, filter, q]);

  const live = data.expenses.filter((e) => !e.archivedAt);
  const owed = data.expenses
    .filter((e) => !e.planned)
    .reduce((s, e) => s + (e.totals.balanceCents ?? 0), 0);
  const unknown = data.expenses.filter((e) => !e.planned && e.totals.balanceCents == null).length;
  const personal = data.expenses.reduce((s, e) => s + e.totals.personalOutstandingCents, 0);
  const selected = data.expenses.find((e) => e.id === selectedId);

  return (
    <div className={`pw ex${embedded ? " ex-embedded" : ""}`} data-pane={pane}>
      <header className="pw-bar">
        <div className="pw-bar-title">
          {embedded ? <h2 className="ex-title">Expenses</h2> : <h1>Expenses</h1>}
        </div>
        <div className="ex-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "book"}
            className={tab === "book" ? "is-on" : ""}
            onClick={() => setTab("book")}
            data-testid="tab-book"
          >
            Spending book
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "reports"}
            className={tab === "reports" ? "is-on" : ""}
            onClick={() => {
              if (dirtyRef.current)
                return notify(
                  "err",
                  "Save or discard your expense changes before opening reports.",
                );
              setTab("reports");
            }}
            data-testid="tab-reports"
          >
            Reports
          </button>
        </div>
      </header>

      {flash && (
        <div
          className={`pw-flash pw-flash-${flash.tone}`}
          role={flash.tone === "err" ? "alert" : "status"}
        >
          {flash.text}
        </div>
      )}
      {loadErr && (
        <div className="pw-flash pw-flash-err" role="alert">
          {loadErr}{" "}
          <button type="button" className="pw-link" onClick={() => void reload()}>
            Retry
          </button>
        </div>
      )}

      <dl className="ex-tape" aria-label="At a glance">
        <div>
          <dt>Still owed to vendors</dt>
          <dd data-testid="text-owed">{money(owed)}</dd>
          {unknown > 0 && <small>+ {unknown} without a total yet</small>}
        </div>
        <div>
          <dt>Personally funded, not yet reimbursed</dt>
          <dd data-testid="text-personal">{money(personal)}</dd>
        </div>
        <div>
          <dt>Open items</dt>
          <dd>{live.filter((e) => e.totals.status !== "PAID").length}</dd>
          <small>{live.filter((e) => e.missing.length).length} missing details</small>
        </div>
      </dl>

      {source && (
        <ExpenseSourcePanel
          source={source}
          data={data}
          busy={busy || hasDirty}
          run={run}
          notify={notify}
          onOpen={open}
        />
      )}

      {tab === "reports" ? (
        <ExpenseReports today={data.today} onOpen={open} />
      ) : (
        <div className="ex-shell">
          <section className="pw-pane ex-list" aria-label="Expenses">
            <ExpenseQuickAdd
              key={source ? `${source.kind}-${source.id}` : "plain"}
              data={data}
              busy={busy || hasDirty}
              run={run}
              source={source}
              notify={notify}
              onOpen={open}
            />
            <div className="ex-filters" role="group" aria-label="Filter expenses">
              {FILTERS.map((f) => (
                <button
                  type="button"
                  key={f.id}
                  className={filter === f.id ? "is-on" : ""}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  data-testid={`filter-${f.id}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              type="search"
              className="pw-search"
              placeholder="Search title, vendor, category, purpose"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search expenses"
              data-testid="input-search"
            />
            {list.length ? (
              <ul className="ex-rows">
                {list.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={`ex-row ${selectedId === e.id ? "is-active" : ""}`}
                      onClick={() => open(e.id)}
                      data-testid={`row-expense-${e.id}`}
                    >
                      <span className="ex-row-main">
                        <strong>{e.title || "Untitled expense"}</strong>
                        <span className="ex-row-meta">
                          {e.vendor || "No vendor"} · {e.date ? fmtDay(e.date) : "No date"}
                          {e.category ? ` · ${e.category}` : ""}
                        </span>
                        {e.missing.length > 0 && (
                          <span className="ex-missing">
                            Add {e.missing.slice(0, 3).map(missingLabel).join(", ")}
                            {e.missing.length > 3 ? "…" : ""}
                          </span>
                        )}
                      </span>
                      <span className="ex-row-fig">
                        <span className="ex-num">{money(e.amountCents)}</span>
                        <span className={`ex-status ex-status-${e.totals.status.toLowerCase()}`}>
                          {STATUS_TEXT[e.totals.status]}
                        </span>
                        {e.totals.balanceCents != null &&
                          e.totals.balanceCents > 0 &&
                          e.totals.status !== "PLANNED" && (
                            <small className="ex-num">{money(e.totals.balanceCents)} left</small>
                          )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="pw-empty">
                <div className="pw-empty-lines" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <strong>
                  {q
                    ? "Nothing matches"
                    : data.expenses.length === 0
                      ? "The book is empty"
                      : "Nothing in this view"}
                </strong>
                <p>
                  {q
                    ? "Try a vendor name or a shorter word."
                    : data.expenses.length === 0
                      ? "Jot down the first thing money went to. A title is enough; fill in the rest when the receipt turns up."
                      : "Switch filters to see the rest of your expenses."}
                </p>
              </div>
            )}
          </section>

          <section className="pw-pane ex-detail" aria-label="Selected expense">
            <button
              type="button"
              className="pw-back-link pw-only-mobile"
              onClick={() => setPane("list")}
            >
              &lsaquo; Expenses
            </button>
            {selected ? (
              <ExpenseDetail
                key={selected.id}
                expense={selected}
                data={data}
                busy={busy}
                run={run}
                notify={notify}
                reload={reload}
                setData={setData}
                onDirty={reportDirty}
                onClosed={() => {
                  setSelectedId(null);
                  setPane("list");
                }}
              />
            ) : (
              <div className="pw-detail-empty">
                <p className="pw-kicker">Expenses</p>
                <p>
                  Pick an expense to fill in details, record payments, refunds or reimbursements,
                  and keep the receipt with it.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export function EmbeddedExpenseWorkspace({
  sourceRef,
  onDirtyChange,
}: {
  sourceRef?: ExpenseSourceRef | null;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [data, setData] = useState<ExpenseWorkspaceData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      try {
        const result = await expenseLoad();
        if (active) {
          setData(result);
          setError("");
        }
      } catch (cause) {
        if (active) setError(errText(cause, "Could not load expenses."));
      }
    });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (!data)
    return (
      <div className="ex-embed-loading" role={error ? "alert" : "status"}>
        {error || "Loading expenses…"}
        {error && (
          <button type="button" className="pw-link" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        )}
      </div>
    );
  return (
    <ExpenseWorkspace
      initialData={data}
      sourceRef={sourceRef}
      embedded
      onDirtyChange={onDirtyChange}
    />
  );
}
