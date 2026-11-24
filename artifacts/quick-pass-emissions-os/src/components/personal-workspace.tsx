"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PersonalNoteView,
  PersonalTaskView,
  PersonalWorkspaceData,
} from "@/modules/personal/types";
import { SummaryControls, SummaryDoc } from "./personal/summary";
import { NoteEditor, TaskEditor } from "./personal/editors";
import { PenIcon, NavItem, Empty } from "./personal/controls";
import {
  type Status,
  type View,
  type NoteFields,
  type TaskFields,
  type Draft,
  type SaveState,
  api,
  isConflict,
  noteFields,
  taskFields,
  day,
  fmtDate,
  fmtStamp,
  preview,
  PRI_LABEL,
  rid,
  linkedTask,
} from "./personal/shared";
import "./personal-workspace.css";
export function PersonalWorkspace({ initialData }: { initialData: PersonalWorkspaceData }) {
  const [data, setData] = useState(initialData);
  const [view, setView] = useState<View>({ kind: "notes", folder: "all" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [saveState, setSaveStateValue] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");
  const [flash, setFlash] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [mobilePane, setMobilePane] = useState<"nav" | "list" | "detail">("list");
  const [busy, setBusy] = useState(false);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [quickTask, setQuickTask] = useState("");

  const draftRef = useRef<Draft | null>(null);
  const dirtyRef = useRef(false);
  const inFlightRef = useRef(0);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRef = useRef<() => void>(() => undefined);
  const saveStateRef = useRef<SaveState>("saved");
  const setSaveState = useCallback((state: SaveState) => {
    saveStateRef.current = state;
    setSaveStateValue(state);
  }, []);

  const setDraft = useCallback((d: Draft | null) => {
    draftRef.current = d;
    setDraftState(d);
  }, []);

  const notify = useCallback((tone: "ok" | "err", text: string) => {
    setFlash({ tone, text });
    setTimeout(() => setFlash((f) => (f?.text === text ? null : f)), tone === "ok" ? 2600 : 6000);
  }, []);

  /** Serialize every mutation so each request uses the newest known version. */
  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = queueRef.current
      .catch(() => undefined)
      .then(async () => {
        inFlightRef.current++;
        try {
          return await fn();
        } finally {
          inFlightRef.current--;
        }
      });
    queueRef.current = run;
    return run;
  }, []);

  const saveDraftNow = useCallback((): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return enqueue(async () => {
      const d = draftRef.current;
      if (!d || !dirtyRef.current) return true;
      if (saveStateRef.current === "conflict") return false;
      const sent = JSON.stringify(d.fields);
      setSaveState("saving");
      const payload =
        d.kind === "note"
          ? { op: "note.save", id: d.id, version: d.version, ...d.fields }
          : {
              op: "task.save",
              id: d.id,
              version: d.version,
              ...d.fields,
              dueDate: d.fields.dueDate || null,
            };
      try {
        const next = await api(payload);
        setData(next);
        const cur = draftRef.current;
        const server =
          d.kind === "note"
            ? next.notes.find((n) => n.id === d.id)
            : next.tasks.find((t) => t.id === d.id);
        if (cur && cur.id === d.id && server) {
          const updated = { ...cur, version: server.version } as Draft;
          const unchanged = JSON.stringify(cur.fields) === sent;
          if (unchanged && cur.kind === "task") {
            // adopt server-set completion values without overriding user edits
            (updated as Extract<Draft, { kind: "task" }>).fields = taskFields(
              server as PersonalTaskView,
            );
          }
          setDraft(updated);
          dirtyRef.current = !unchanged;
          setSaveState(unchanged ? "saved" : "dirty");
        } else {
          dirtyRef.current = false;
          setSaveState("saved");
        }
        setSaveError("");
        return true;
      } catch (e) {
        setSaveState(isConflict(e) ? "conflict" : "error");
        setSaveError(e instanceof Error ? e.message : "Save failed.");
        return false;
      }
    }).then((ok) => {
      if (ok && dirtyRef.current) scheduleRef.current();
      return ok;
    });
  }, [enqueue, setDraft, setSaveState]);

  useEffect(() => {
    scheduleRef.current = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void saveDraftNow(), 750);
    };
  }, [saveDraftNow]);

  const editNote = useCallback(
    (patch: Partial<NoteFields>) => {
      const d = draftRef.current;
      if (!d || d.kind !== "note") return;
      setDraft({ ...d, fields: { ...d.fields, ...patch } });
      dirtyRef.current = true;
      if (saveStateRef.current !== "conflict") {
        setSaveState("dirty");
        scheduleRef.current();
      }
    },
    [setDraft, setSaveState],
  );

  const editTask = useCallback(
    (patch: Partial<TaskFields>, immediate = false) => {
      const d = draftRef.current;
      if (!d || d.kind !== "task") return;
      setDraft({ ...d, fields: { ...d.fields, ...patch } });
      dirtyRef.current = true;
      if (saveStateRef.current !== "conflict") {
        setSaveState("dirty");
        if (immediate) void saveDraftNow();
        else scheduleRef.current();
      }
    },
    [setDraft, saveDraftNow, setSaveState],
  );

  /** Make sure pending edits are stored before leaving or acting on the item. */
  const flush = useCallback(async () => {
    if (!dirtyRef.current && inFlightRef.current === 0) return true;
    const ok = await saveDraftNow();
    await queueRef.current.catch(() => undefined);
    if (!ok || dirtyRef.current) {
      notify(
        "err",
        "Your current edits are not saved yet. Resolve the save issue before moving on.",
      );
      return false;
    }
    return true;
  }, [saveDraftNow, notify]);

  const openItem = useCallback(
    async (kind: "note" | "task" | "summary", id: string | null, src?: PersonalWorkspaceData) => {
      if (draftRef.current && draftRef.current.id !== id && !(await flush())) return false;
      const source = src ?? data;
      setSelectedId(id);
      dirtyRef.current = false;
      setSaveState("saved");
      setSaveError("");
      if (kind === "note" && id) {
        const n = source.notes.find((x) => x.id === id);
        setDraft(n ? { kind: "note", id, version: n.version, fields: noteFields(n) } : null);
      } else if (kind === "task" && id) {
        const t = source.tasks.find((x) => x.id === id);
        setDraft(t ? { kind: "task", id, version: t.version, fields: taskFields(t) } : null);
      } else setDraft(null);
      if (id) setMobilePane("detail");
      return true;
    },
    [data, flush, setDraft, setSaveState],
  );

  const changeView = async (v: View) => {
    if (!(await flush())) return;
    setView(v);
    setSearch("");
    setSelectedId(null);
    setDraft(null);
    setMobilePane("list");
  };

  // Refresh on focus without clobbering local edits
  useEffect(() => {
    const onFocus = async () => {
      if (inFlightRef.current > 0) return;
      try {
        const next = await api();
        if (inFlightRef.current > 0) return;
        setData(next);
        const d = draftRef.current;
        if (d && !dirtyRef.current && saveStateRef.current === "saved") {
          if (d.kind === "note") {
            const n = next.notes.find((x) => x.id === d.id);
            if (n && n.version !== d.version)
              setDraft({ kind: "note", id: d.id, version: n.version, fields: noteFields(n) });
          } else {
            const t = next.tasks.find((x) => x.id === d.id);
            if (t && t.version !== d.version)
              setDraft({ kind: "task", id: d.id, version: t.version, fields: taskFields(t) });
          }
        }
      } catch {
        /* silent: next action will surface errors */
      }
    };
    window.addEventListener("focus", onFocus);
    const onBefore = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || inFlightRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBefore);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeunload", onBefore);
    };
  }, [setDraft]);

  const retryConflict = async () => {
    // Keep local edits, rebase onto latest server version, then save.
    try {
      const next = await api();
      setData(next);
      const d = draftRef.current;
      if (!d) return;
      const server =
        d.kind === "note"
          ? next.notes.find((n) => n.id === d.id)
          : next.tasks.find((t) => t.id === d.id);
      if (!server) {
        setSaveError("This item no longer exists on the server.");
        return;
      }
      setDraft({ ...d, version: server.version } as Draft);
      dirtyRef.current = true;
      setSaveState("dirty");
      await saveDraftNow();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Retry failed.");
    }
  };
  const reloadServer = async () => {
    try {
      const next = await api();
      setData(next);
      const d = draftRef.current;
      dirtyRef.current = false;
      setSaveState("saved");
      setSaveError("");
      if (d?.kind === "note") {
        const n = next.notes.find((x) => x.id === d.id);
        setDraft(n ? { kind: "note", id: n.id, version: n.version, fields: noteFields(n) } : null);
      } else if (d?.kind === "task") {
        const t = next.tasks.find((x) => x.id === d.id);
        setDraft(t ? { kind: "task", id: t.id, version: t.version, fields: taskFields(t) } : null);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Reload failed.");
    }
  };

  /** Run a non-draft mutation through the queue. */
  const mutate = useCallback(
    async (body: Record<string, unknown>, okText?: string) => {
      setBusy(true);
      try {
        const next = await enqueue(() => api(body));
        setData(next);
        if (okText) notify("ok", okText);
        return next;
      } catch (e) {
        notify("err", e instanceof Error ? e.message : "Something went wrong.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [enqueue, notify],
  );

  // ---------- actions ----------
  const newNote = async () => {
    if (!(await flush())) return;
    const id = rid();
    const next = await mutate({ op: "note.create", id });
    if (!next) return;
    const folder =
      view.kind === "notes" && !["all", "archived", "deleted"].includes(view.folder)
        ? view.folder
        : null;
    setView(folder ? { kind: "notes", folder } : { kind: "notes", folder: "all" });
    setSearch("");
    await openItem("note", id, next);
    if (folder) editNote({ folderId: folder });
    setTimeout(() => document.getElementById("pw-note-title")?.focus(), 30);
  };

  const createTask = async (title: string) => {
    if (!title.trim()) return;
    if (!(await flush())) return;
    const id = rid();
    const next = await mutate({
      op: "task.create",
      id,
      title: title.trim(),
      priority: "MEDIUM",
      dueDate: view.kind === "tasks" && view.filter === "today" ? data.today : null,
    });
    if (!next) return;
    setQuickTask("");
    if (view.kind !== "tasks" || view.filter === "completed")
      setView({ kind: "tasks", filter: "all" });
    await openItem("task", id, next);
  };

  const convert = async (noteId: string, itemId?: string) => {
    if (!(await flush())) return;
    const d = draftRef.current;
    const ids = d?.kind === "note" ? d.fields.checklist.map((c) => c.id) : [];
    const existing = linkedTask(data.tasks, noteId, itemId, ids);
    const next = await mutate({ op: "task.convert", noteId, ...(itemId ? { itemId } : {}) });
    if (!next) return;
    const t = linkedTask(next.tasks, noteId, itemId, ids);
    notify(
      "ok",
      existing
        ? "Already a task. Linked to the existing one."
        : `Task created${t ? `: ${t.title}` : ""}.`,
    );
  };

  const noteLifecycle = async (
    op: "archive" | "unarchive" | "delete" | "restore",
    note: PersonalNoteView,
  ) => {
    if (!(await flush())) return;
    const version =
      draftRef.current?.id === note.id
        ? draftRef.current.version
        : (data.notes.find((n) => n.id === note.id)?.version ?? note.version);
    const body =
      op === "archive"
        ? { op: "note.archive", id: note.id, version, archived: true }
        : op === "unarchive"
          ? { op: "note.archive", id: note.id, version, archived: false }
          : op === "delete"
            ? { op: "note.delete", id: note.id, version }
            : { op: "note.restore", id: note.id, version };
    const labels = {
      archive: "Note archived.",
      unarchive: "Note moved back to notes.",
      delete: "Moved to Recently Deleted.",
      restore: "Note restored.",
    };
    const next = await mutate(body, labels[op]);
    if (next) {
      setSelectedId(null);
      setDraft(null);
      setMobilePane("list");
    }
  };

  const toggleTaskDone = async (t: PersonalTaskView) => {
    const status: Status = t.status === "COMPLETED" ? "TODO" : "COMPLETED";
    if (draftRef.current?.id === t.id) {
      editTask({ status }, true);
      return;
    }
    if (!(await flush())) return;
    const latest = data.tasks.find((x) => x.id === t.id) ?? t;
    await mutate(
      { op: "task.save", id: t.id, version: latest.version, ...taskFields(latest), status },
      status === "COMPLETED" ? "Completed. Date recorded." : "Task reopened.",
    );
  };

  const createFolder = async () => {
    const name = (newFolder ?? "").trim();
    if (!name) {
      setNewFolder(null);
      return;
    }
    const next = await mutate({ op: "folder.create", name }, "Folder created.");
    if (next) {
      setNewFolder(null);
      const f = next.folders.find((x) => x.name === name);
      if (f) void changeView({ kind: "notes", folder: f.id });
    }
  };

  // ---------- derived ----------
  const q = search.trim().toLowerCase();
  const liveNotes = data.notes.filter((n) => !n.deletedAt && !n.archivedAt);
  const noteList = useMemo(() => {
    if (view.kind !== "notes") return [];
    let list = data.notes.filter((n) =>
      view.folder === "deleted"
        ? !!n.deletedAt
        : view.folder === "archived"
          ? !!n.archivedAt && !n.deletedAt
          : !n.deletedAt && !n.archivedAt && (view.folder === "all" || n.folderId === view.folder),
    );
    if (q)
      list = list.filter((n) =>
        `${n.title}\n${n.body}\n${n.checklist.map((c) => c.text).join("\n")}`
          .toLowerCase()
          .includes(q),
      );
    return [...list].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [data.notes, view, q]);

  const taskMatches = useCallback(
    (t: PersonalTaskView, f: string) => {
      const due = day(t.dueDate);
      if (f === "completed") return t.status === "COMPLETED";
      if (f === "all") return true;
      if (t.status === "COMPLETED") return false;
      if (f === "today") return due === data.today;
      if (f === "overdue") return !!due && due < data.today;
      if (f === "high") return t.priority === "HIGH";
      return true;
    },
    [data.today],
  );

  const taskList = useMemo(() => {
    if (view.kind !== "tasks") return [];
    let list = data.tasks.filter((t) => taskMatches(t, view.filter));
    if (q)
      list = list.filter((t) =>
        `${t.title}\n${t.description}\n${t.completionNote}`.toLowerCase().includes(q),
      );
    const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return [...list].sort((a, b) =>
      view.filter === "completed"
        ? (b.completedAt ?? "").localeCompare(a.completedAt ?? "")
        : rank[a.priority] - rank[b.priority] ||
          (day(a.dueDate) || "9999").localeCompare(day(b.dueDate) || "9999"),
    );
  }, [data.tasks, view, q, taskMatches]);

  const summaryList = useMemo(() => {
    let list = [...data.summaries].sort(
      (a, b) => b.endDate.localeCompare(a.endDate) || b.createdAt.localeCompare(a.createdAt),
    );
    if (q) list = list.filter((s) => s.snapshot.text.toLowerCase().includes(q));
    return list;
  }, [data.summaries, q]);

  const counts = {
    all: liveNotes.length,
    archived: data.notes.filter((n) => n.archivedAt && !n.deletedAt).length,
    deleted: data.notes.filter((n) => n.deletedAt).length,
    tasks: Object.fromEntries(
      (["all", "today", "overdue", "high", "completed"] as const).map((f) => [
        f,
        data.tasks.filter((t) => taskMatches(t, f)).length,
      ]),
    ),
  };

  const currentNote =
    draft?.kind === "note" ? data.notes.find((n) => n.id === draft.id) : undefined;
  const currentTask =
    draft?.kind === "task" ? data.tasks.find((t) => t.id === draft.id) : undefined;
  const currentSummary =
    view.kind === "summaries" ? data.summaries.find((s) => s.id === selectedId) : undefined;

  const listTitle =
    view.kind === "notes"
      ? view.folder === "all"
        ? "Notes"
        : view.folder === "archived"
          ? "Archived"
          : view.folder === "deleted"
            ? "Recently Deleted"
            : (data.folders.find((f) => f.id === view.folder)?.name ?? "Folder")
      : view.kind === "tasks"
        ? {
            all: "All Tasks",
            today: "Today",
            overdue: "Overdue",
            high: "High Priority",
            completed: "Completed",
          }[view.filter]
        : "Summaries";

  return (
    <div className="pw" data-pane={mobilePane}>
      <header className="pw-bar">
        <div className="pw-bar-title">
          <span className="pw-kicker">Private to you</span>
          <h1>Notes &amp; Tasks</h1>
        </div>
        <div className="pw-bar-actions">
          <button
            type="button"
            className="pw-btn pw-btn-quiet pw-only-mobile"
            onClick={() => setMobilePane("nav")}
          >
            Folders
          </button>
          <button type="button" className="pw-btn pw-btn-primary" onClick={newNote} disabled={busy}>
            <PenIcon /> New note
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

      <div className="pw-shell">
        {/* ---------- Sidebar ---------- */}
        <nav className="pw-pane pw-nav" aria-label="Personal folders and filters">
          <p className="pw-nav-caption">Notes</p>
          <NavItem
            label="All Notes"
            count={counts.all}
            active={view.kind === "notes" && view.folder === "all"}
            onClick={() => changeView({ kind: "notes", folder: "all" })}
          />
          {data.folders.map((f) => (
            <NavItem
              key={f.id}
              label={f.name}
              indent
              count={liveNotes.filter((n) => n.folderId === f.id).length}
              active={view.kind === "notes" && view.folder === f.id}
              onClick={() => changeView({ kind: "notes", folder: f.id })}
            />
          ))}
          {newFolder === null ? (
            <button type="button" className="pw-nav-add" onClick={() => setNewFolder("")}>
              + New folder
            </button>
          ) : (
            <form
              className="pw-folder-form"
              onSubmit={(e) => {
                e.preventDefault();
                void createFolder();
              }}
            >
              <input
                autoFocus
                aria-label="Folder name"
                placeholder="Folder name"
                maxLength={60}
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setNewFolder(null)}
              />
              <button type="submit" className="pw-btn pw-btn-sm pw-btn-primary" disabled={busy}>
                Add
              </button>
            </form>
          )}
          <NavItem
            label="Archived"
            muted
            count={counts.archived}
            active={view.kind === "notes" && view.folder === "archived"}
            onClick={() => changeView({ kind: "notes", folder: "archived" })}
          />
          <NavItem
            label="Recently Deleted"
            muted
            count={counts.deleted}
            active={view.kind === "notes" && view.folder === "deleted"}
            onClick={() => changeView({ kind: "notes", folder: "deleted" })}
          />

          <p className="pw-nav-caption">Tasks</p>
          {(["all", "today", "overdue", "high", "completed"] as const).map((f) => (
            <NavItem
              key={f}
              label={
                {
                  all: "All Tasks",
                  today: "Today",
                  overdue: "Overdue",
                  high: "High Priority",
                  completed: "Completed",
                }[f]
              }
              count={counts.tasks[f]}
              tone={f === "overdue" && counts.tasks[f] ? "danger" : undefined}
              active={view.kind === "tasks" && view.filter === f}
              onClick={() => changeView({ kind: "tasks", filter: f })}
            />
          ))}

          <p className="pw-nav-caption">Review</p>
          <NavItem
            label="Biweekly Summaries"
            count={data.summaries.length}
            active={view.kind === "summaries"}
            onClick={() => changeView({ kind: "summaries" })}
          />
        </nav>

        {/* ---------- List ---------- */}
        <section className="pw-pane pw-list" aria-label={listTitle}>
          <div className="pw-list-head">
            <div className="pw-list-titlerow">
              <button
                type="button"
                className="pw-back pw-only-mobile"
                onClick={() => setMobilePane("nav")}
                aria-label="Show folders"
              >
                &lsaquo;
              </button>
              <h2>{listTitle}</h2>
              <span className="pw-count">
                {view.kind === "notes"
                  ? noteList.length
                  : view.kind === "tasks"
                    ? taskList.length
                    : summaryList.length}
              </span>
            </div>
            <input
              type="search"
              className="pw-search"
              placeholder={
                view.kind === "summaries"
                  ? "Search summaries"
                  : view.kind === "tasks"
                    ? "Search tasks, including completed"
                    : "Search notes"
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search"
            />
            {view.kind === "tasks" && view.filter !== "completed" && (
              <form
                className="pw-quick-task"
                onSubmit={(e) => {
                  e.preventDefault();
                  void createTask(quickTask);
                }}
              >
                <input
                  placeholder="Add a task and press Enter"
                  value={quickTask}
                  maxLength={200}
                  onChange={(e) => setQuickTask(e.target.value)}
                  aria-label="New task title"
                />
                <button
                  type="submit"
                  className="pw-btn pw-btn-sm pw-btn-primary"
                  disabled={busy || !quickTask.trim()}
                >
                  Add
                </button>
              </form>
            )}
            {view.kind === "notes" && view.folder === "deleted" && (
              <p className="pw-hint">Deleted notes stay here until you restore them.</p>
            )}
          </div>

          <div className="pw-list-body">
            {view.kind === "notes" &&
              (noteList.length ? (
                <ul className="pw-items">
                  {noteList.map((n, i) => {
                    const showPinnedHead = i === 0 && n.pinned && !q;
                    const showNotesHead = !q && !n.pinned && i > 0 && noteList[i - 1].pinned;
                    const title =
                      (draft?.id === n.id && draft.kind === "note"
                        ? draft.fields.title
                        : n.title) || "New note";
                    return (
                      <li key={n.id}>
                        {showPinnedHead && <p className="pw-group">Pinned</p>}
                        {showNotesHead && <p className="pw-group">Notes</p>}
                        <button
                          type="button"
                          className={`pw-item ${selectedId === n.id ? "is-active" : ""}`}
                          onClick={() => openItem("note", n.id)}
                        >
                          <strong>
                            {n.pinned && <span className="pw-pin-dot" aria-label="Pinned" />}
                            {title}
                          </strong>
                          <span className="pw-item-meta">
                            <time>{fmtStamp(n.updatedAt)}</time> {preview(n)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty
                  title={
                    q
                      ? "No matching notes"
                      : view.folder === "deleted"
                        ? "Nothing deleted"
                        : view.folder === "archived"
                          ? "No archived notes"
                          : "A clean page"
                  }
                  text={
                    q
                      ? "Try fewer words. Search covers titles, text, and checklist items."
                      : view.folder === "deleted" || view.folder === "archived"
                        ? "Notes you set aside will wait here."
                        : "Capture an idea before it slips away."
                  }
                  action={
                    !q && view.folder !== "deleted" && view.folder !== "archived"
                      ? { label: "New note", onClick: newNote }
                      : undefined
                  }
                />
              ))}

            {view.kind === "tasks" &&
              (taskList.length ? (
                <ul className="pw-items">
                  {taskList.map((t) => {
                    const due = day(t.dueDate);
                    const overdue = t.status !== "COMPLETED" && due && due < data.today;
                    return (
                      <li
                        key={t.id}
                        className={`pw-task-row ${selectedId === t.id ? "is-active" : ""}`}
                        data-priority={t.priority}
                      >
                        <input
                          type="checkbox"
                          className="pw-check"
                          checked={t.status === "COMPLETED"}
                          disabled={busy}
                          aria-label={
                            t.status === "COMPLETED" ? `Reopen ${t.title}` : `Complete ${t.title}`
                          }
                          onChange={() => toggleTaskDone(t)}
                        />
                        <button
                          type="button"
                          className="pw-task-open"
                          onClick={() => openItem("task", t.id)}
                        >
                          <strong className={t.status === "COMPLETED" ? "is-done" : ""}>
                            {t.title || "Untitled task"}
                          </strong>
                          <span className="pw-item-meta">
                            <span className={`pw-pri pw-pri-${t.priority.toLowerCase()}`}>
                              {PRI_LABEL[t.priority]}
                            </span>
                            {t.status === "IN_PROGRESS" && (
                              <span className="pw-tag">In progress</span>
                            )}
                            {t.status === "COMPLETED" && t.completedAt && (
                              <span>Done {fmtDate(t.completedAt)}</span>
                            )}
                            {t.status !== "COMPLETED" && due && (
                              <span className={overdue ? "pw-overdue" : ""}>
                                {due === data.today ? "Due today" : `Due ${fmtDate(due)}`}
                              </span>
                            )}
                            {t.noteId && <span className="pw-tag">From note</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty
                  title={
                    q
                      ? "No matching tasks"
                      : view.filter === "completed"
                        ? "Nothing completed yet"
                        : view.filter === "overdue"
                          ? "Nothing overdue"
                          : "Clear for now"
                  }
                  text={
                    view.filter === "completed"
                      ? "Checked-off tasks collect here with their completion dates."
                      : "Type above to add a task. Only a title is needed."
                  }
                />
              ))}

            {view.kind === "summaries" && (
              <>
                <SummaryControls
                  data={data}
                  busy={busy}
                  mutate={mutate}
                  onGenerated={(next, s, e) => {
                    const found = next.summaries
                      .filter((x) => x.startDate === s && x.endDate === e)
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
                    if (found) {
                      setSelectedId(found.id);
                      setMobilePane("detail");
                    }
                  }}
                />
                {summaryList.length ? (
                  <ul className="pw-items">
                    {summaryList.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className={`pw-item ${selectedId === s.id ? "is-active" : ""}`}
                          onClick={() => {
                            setSelectedId(s.id);
                            setMobilePane("detail");
                          }}
                        >
                          <strong>
                            {fmtDate(s.startDate)} – {fmtDate(s.endDate)}
                          </strong>
                          <span className="pw-item-meta">
                            {s.snapshot.completed.length} completed · {s.snapshot.unfinished.length}{" "}
                            open priorities
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty
                    title="No summaries saved"
                    text="Generate one for any date range above. Saved summaries stay here for later review."
                  />
                )}
              </>
            )}
          </div>
        </section>

        {/* ---------- Detail ---------- */}
        <section className="pw-pane pw-detail" aria-label="Selected item">
          <button
            type="button"
            className="pw-back-link pw-only-mobile"
            onClick={async () => {
              if (await flush()) setMobilePane("list");
            }}
          >
            &lsaquo; {listTitle}
          </button>

          {draft?.kind === "note" && currentNote && (
            <NoteEditor
              draft={draft}
              note={currentNote}
              folders={data.folders}
              tasks={data.tasks}
              saveState={saveState}
              saveError={saveError}
              busy={busy}
              onEdit={editNote}
              onRetry={saveState === "conflict" ? retryConflict : () => void saveDraftNow()}
              onReload={reloadServer}
              onConvert={convert}
              onLifecycle={(op) => noteLifecycle(op, currentNote)}
              onOpenTask={(id) => {
                setView({
                  kind: "tasks",
                  filter:
                    data.tasks.find((t) => t.id === id)?.status === "COMPLETED"
                      ? "completed"
                      : "all",
                });
                void openItem("task", id);
              }}
            />
          )}
          {draft?.kind === "task" && currentTask && (
            <TaskEditor
              draft={draft}
              task={currentTask}
              today={data.today}
              note={data.notes.find((n) => n.id === currentTask.noteId)}
              saveState={saveState}
              saveError={saveError}
              onEdit={editTask}
              onRetry={saveState === "conflict" ? retryConflict : () => void saveDraftNow()}
              onReload={reloadServer}
              onOpenNote={(id) => {
                setView({ kind: "notes", folder: "all" });
                void openItem("note", id);
              }}
            />
          )}
          {view.kind === "summaries" && currentSummary && (
            <SummaryDoc summary={currentSummary} notify={notify} />
          )}
          {!draft && !currentSummary && (
            <div className="pw-detail-empty">
              <p className="pw-kicker">
                {view.kind === "summaries"
                  ? "Summaries"
                  : view.kind === "tasks"
                    ? "Tasks"
                    : "Notes"}
              </p>
              <p>
                {view.kind === "summaries"
                  ? "Select a saved summary to read, copy, or print it."
                  : view.kind === "tasks"
                    ? "Select a task to add details, a due date, or what you accomplished."
                    : "Select a note, or start a new one."}
              </p>
              {view.kind === "notes" && (
                <button
                  type="button"
                  className="pw-btn pw-btn-primary"
                  onClick={newNote}
                  disabled={busy}
                >
                  <PenIcon /> New note
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <button
        type="button"
        className="pw-fab pw-only-mobile"
        onClick={newNote}
        disabled={busy}
        aria-label="New note"
      >
        <PenIcon />
      </button>
    </div>
  );
}
