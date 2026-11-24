"use client";

import type {
  ChecklistItem,
  PersonalNoteView,
  PersonalTaskView,
  PersonalWorkspaceData,
} from "@/modules/personal/types";
import {
  type NoteFields,
  type TaskFields,
  type Draft,
  type SaveState,
  fmtDate,
  fmtStamp,
  PRI_LABEL,
  STATUS_LABEL,
  rid,
  linkedTask,
} from "./shared";
import { SaveBadge } from "./controls";

export function NoteEditor({
  draft,
  note,
  folders,
  tasks,
  saveState,
  saveError,
  busy,
  onEdit,
  onRetry,
  onReload,
  onConvert,
  onLifecycle,
  onOpenTask,
}: {
  draft: Extract<Draft, { kind: "note" }>;
  note: PersonalNoteView;
  folders: PersonalWorkspaceData["folders"];
  tasks: PersonalTaskView[];
  saveState: SaveState;
  saveError: string;
  busy: boolean;
  onEdit: (p: Partial<NoteFields>) => void;
  onRetry: () => void;
  onReload: () => void;
  onConvert: (noteId: string, itemId?: string) => void;
  onLifecycle: (op: "archive" | "unarchive" | "delete" | "restore") => void;
  onOpenTask: (id: string) => void;
}) {
  const f = draft.fields;
  const readOnly = !!note.deletedAt;
  const ids = f.checklist.map((c) => c.id);
  const noteTask = linkedTask(tasks, note.id, undefined, ids);
  const setItem = (id: string, patch: Partial<ChecklistItem>) =>
    onEdit({ checklist: f.checklist.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const addItem = (after?: string) => {
    const item = { id: rid(), text: "", checked: false };
    const list = [...f.checklist];
    const idx = after ? list.findIndex((c) => c.id === after) + 1 : list.length;
    list.splice(idx, 0, item);
    onEdit({ checklist: list });
    setTimeout(() => document.getElementById(`pw-ci-${item.id}`)?.focus(), 20);
  };

  return (
    <article className="pw-editor">
      <div className="pw-toolbar">
        <span className="pw-stamp">Edited {fmtStamp(note.updatedAt)}</span>
        {!readOnly && (
          <SaveBadge state={saveState} error={saveError} onRetry={onRetry} onReload={onReload} />
        )}
        <div className="pw-toolbar-actions">
          {readOnly ? (
            <button
              type="button"
              className="pw-btn pw-btn-sm pw-btn-primary"
              disabled={busy}
              onClick={() => onLifecycle("restore")}
            >
              Restore note
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`pw-btn pw-btn-sm pw-btn-quiet ${f.pinned ? "is-on" : ""}`}
                aria-pressed={f.pinned}
                onClick={() => onEdit({ pinned: !f.pinned })}
              >
                {f.pinned ? "Pinned" : "Pin"}
              </button>
              <select
                className="pw-select"
                aria-label="Folder"
                value={f.folderId ?? ""}
                onChange={(e) => onEdit({ folderId: e.target.value || null })}
              >
                <option value="">No folder</option>
                {folders.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              {noteTask ? (
                <button
                  type="button"
                  className="pw-btn pw-btn-sm pw-btn-quiet"
                  onClick={() => onOpenTask(noteTask.id)}
                >
                  View task
                </button>
              ) : (
                <button
                  type="button"
                  className="pw-btn pw-btn-sm pw-btn-quiet"
                  disabled={busy}
                  onClick={() => onConvert(note.id)}
                >
                  Make task
                </button>
              )}
              <button
                type="button"
                className="pw-btn pw-btn-sm pw-btn-quiet"
                disabled={busy}
                onClick={() => onLifecycle(note.archivedAt ? "unarchive" : "archive")}
              >
                {note.archivedAt ? "Unarchive" : "Archive"}
              </button>
              <button
                type="button"
                className="pw-btn pw-btn-sm pw-btn-danger"
                disabled={busy}
                onClick={() => onLifecycle("delete")}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {readOnly && (
        <p className="pw-banner">This note is in Recently Deleted. Restore it to edit.</p>
      )}
      {note.archivedAt && !readOnly && (
        <p className="pw-banner">
          Archived {fmtDate(note.archivedAt)}. It stays searchable under Archived.
        </p>
      )}

      <div className="pw-paper">
        <input
          id="pw-note-title"
          className="pw-title-input"
          placeholder="Title"
          value={f.title}
          readOnly={readOnly}
          maxLength={200}
          onChange={(e) => onEdit({ title: e.target.value })}
          aria-label="Note title"
        />
        <textarea
          className="pw-body-input"
          placeholder="Start writing…"
          value={f.body}
          readOnly={readOnly}
          onChange={(e) => onEdit({ body: e.target.value })}
          aria-label="Note text"
          rows={Math.max(6, f.body.split("\n").length + 1)}
        />

        <div className="pw-checklist">
          {f.checklist.map((c) => {
            const t = linkedTask(tasks, note.id, c.id);
            return (
              <div key={c.id} className="pw-ci">
                <input
                  type="checkbox"
                  className="pw-check"
                  checked={c.checked}
                  disabled={readOnly}
                  aria-label={`Checked: ${c.text || "item"}`}
                  onChange={(e) => setItem(c.id, { checked: e.target.checked })}
                />
                <input
                  id={`pw-ci-${c.id}`}
                  className={`pw-ci-text ${c.checked ? "is-done" : ""}`}
                  value={c.text}
                  readOnly={readOnly}
                  placeholder="List item"
                  aria-label="Checklist item"
                  onChange={(e) => setItem(c.id, { text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addItem(c.id);
                    }
                    if (e.key === "Backspace" && !c.text) {
                      e.preventDefault();
                      onEdit({ checklist: f.checklist.filter((x) => x.id !== c.id) });
                    }
                  }}
                />
                {!readOnly &&
                  (t ? (
                    <button type="button" className="pw-ci-link" onClick={() => onOpenTask(t.id)}>
                      {t.status === "COMPLETED" ? "Task done" : "Task"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="pw-ci-act"
                      disabled={busy || !c.text.trim()}
                      onClick={() => onConvert(note.id, c.id)}
                    >
                      To task
                    </button>
                  ))}
                {!readOnly && (
                  <button
                    type="button"
                    className="pw-ci-act"
                    aria-label="Remove item"
                    onClick={() => onEdit({ checklist: f.checklist.filter((x) => x.id !== c.id) })}
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
          {!readOnly && (
            <button type="button" className="pw-add-ci" onClick={() => addItem()}>
              + Checklist item
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function TaskEditor({
  draft,
  task,
  today,
  note,
  saveState,
  saveError,
  onEdit,
  onRetry,
  onReload,
  onOpenNote,
}: {
  draft: Extract<Draft, { kind: "task" }>;
  task: PersonalTaskView;
  today: string;
  note?: PersonalNoteView;
  saveState: SaveState;
  saveError: string;
  onEdit: (p: Partial<TaskFields>, immediate?: boolean) => void;
  onRetry: () => void;
  onReload: () => void;
  onOpenNote: (id: string) => void;
}) {
  const f = draft.fields;
  const done = f.status === "COMPLETED";
  const due = f.dueDate ?? "";
  return (
    <article className="pw-editor" data-priority={f.priority}>
      <div className="pw-toolbar">
        <span className="pw-stamp">Created {fmtDate(task.createdAt)}</span>
        <SaveBadge state={saveState} error={saveError} onRetry={onRetry} onReload={onReload} />
      </div>
      <div className="pw-paper">
        <div className="pw-task-head">
          <input
            type="checkbox"
            className="pw-check pw-check-lg"
            checked={done}
            aria-label={done ? "Reopen task" : "Mark complete"}
            onChange={() => onEdit({ status: done ? "TODO" : "COMPLETED" }, true)}
          />
          <input
            className={`pw-title-input ${done ? "is-done" : ""}`}
            placeholder="Task"
            value={f.title}
            maxLength={200}
            onChange={(e) => onEdit({ title: e.target.value })}
            aria-label="Task title"
          />
        </div>
        {done && (
          <p className="pw-done-line">
            {task.status === "COMPLETED" && task.completedAt ? (
              <>Completed {fmtDate(task.completedAt)}</>
            ) : (
              <>Recording completion date…</>
            )}
            <button
              type="button"
              className="pw-link"
              onClick={() => onEdit({ status: "TODO" }, true)}
            >
              Reopen
            </button>
          </p>
        )}
        {note && (
          <p className="pw-source">
            From note{" "}
            <button type="button" className="pw-link" onClick={() => onOpenNote(note.id)}>
              {note.title || "Untitled note"}
            </button>
          </p>
        )}

        <div className="pw-fields">
          <fieldset className="pw-seg">
            <legend>Status</legend>
            {(["TODO", "IN_PROGRESS", "COMPLETED"] as const).map((s) => (
              <button
                type="button"
                key={s}
                className={f.status === s ? "is-on" : ""}
                aria-pressed={f.status === s}
                onClick={() => onEdit({ status: s }, true)}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </fieldset>
          <fieldset className="pw-seg">
            <legend>Priority</legend>
            {(["HIGH", "MEDIUM", "LOW"] as const).map((p) => (
              <button
                type="button"
                key={p}
                data-p={p}
                className={f.priority === p ? "is-on" : ""}
                aria-pressed={f.priority === p}
                onClick={() => onEdit({ priority: p }, true)}
              >
                {PRI_LABEL[p]}
              </button>
            ))}
          </fieldset>
          <label className="pw-field">
            <span>
              Due date <em>optional</em>
            </span>
            <div className="pw-date-row">
              <input
                type="date"
                value={due}
                onChange={(e) => onEdit({ dueDate: e.target.value || null })}
              />
              {due && (
                <button type="button" className="pw-link" onClick={() => onEdit({ dueDate: null })}>
                  Clear
                </button>
              )}
              {!done && due && due < today && <span className="pw-overdue">Overdue</span>}
            </div>
          </label>
        </div>

        <label className="pw-field">
          <span>
            Description <em>optional</em>
          </span>
          <textarea
            rows={4}
            value={f.description}
            placeholder="Details, context, links…"
            onChange={(e) => onEdit({ description: e.target.value })}
          />
        </label>
        <label className="pw-field">
          <span>
            What I accomplished <em>optional · appears in summaries</em>
          </span>
          <textarea
            rows={3}
            value={f.completionNote}
            placeholder="Short note on the outcome"
            onChange={(e) => onEdit({ completionNote: e.target.value })}
          />
        </label>
      </div>
    </article>
  );
}
