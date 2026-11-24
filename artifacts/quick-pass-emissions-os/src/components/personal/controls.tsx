"use client";
import { type SaveState } from "./shared";

export function PenIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function NavItem({
  label,
  count,
  active,
  onClick,
  indent,
  muted,
  tone,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  indent?: boolean;
  muted?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      className={`pw-nav-item ${active ? "is-active" : ""} ${indent ? "is-indent" : ""} ${muted ? "is-muted" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className={`pw-nav-count ${tone === "danger" ? "is-danger" : ""}`}>{count}</span>
      )}
    </button>
  );
}

export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="pw-empty">
      <div className="pw-empty-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <strong>{title}</strong>
      <p>{text}</p>
      {action && (
        <button type="button" className="pw-btn pw-btn-quiet" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

export function SaveBadge({
  state,
  error,
  onRetry,
  onReload,
}: {
  state: SaveState;
  error: string;
  onRetry: () => void;
  onReload: () => void;
}) {
  if (state === "conflict" || state === "error") {
    return (
      <div className="pw-save-alert" role="alert">
        <div>
          <strong>{state === "conflict" ? "Changed somewhere else" : "Not saved"}</strong>
          <span>
            {state === "conflict"
              ? "This item was updated on another device. Your edits are kept here."
              : error || "The last save failed. Your edits are kept here."}
          </span>
        </div>
        <div className="pw-save-actions">
          <button type="button" className="pw-btn pw-btn-sm pw-btn-primary" onClick={onRetry}>
            {state === "conflict" ? "Keep my edits" : "Retry save"}
          </button>
          <button type="button" className="pw-btn pw-btn-sm pw-btn-quiet" onClick={onReload}>
            Load saved version
          </button>
        </div>
      </div>
    );
  }
  const text = state === "saving" ? "Saving…" : state === "dirty" ? "Edited" : "Saved";
  return (
    <span className={`pw-save pw-save-${state}`} role="status" aria-live="polite">
      {text}
    </span>
  );
}
