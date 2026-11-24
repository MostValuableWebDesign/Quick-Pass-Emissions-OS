import type {
  ChecklistItem,
  PersonalNoteView,
  PersonalTaskView,
  PersonalWorkspaceData,
} from "@/modules/personal/types";

export type Priority = PersonalTaskView["priority"];
export type Status = PersonalTaskView["status"];
export type View =
  | { kind: "notes"; folder: "all" | "archived" | "deleted" | string }
  | { kind: "tasks"; filter: "all" | "today" | "overdue" | "high" | "completed" }
  | { kind: "summaries" }
  | { kind: "expenses"; source?: { kind: "note" | "task"; id: string } | null };

export type NoteFields = {
  title: string;
  body: string;
  checklist: ChecklistItem[];
  folderId: string | null;
  pinned: boolean;
};
export type TaskFields = {
  title: string;
  description: string;
  dueDate: string | null;
  priority: Priority;
  status: Status;
  completionNote: string;
};
export type Draft =
  | { kind: "note"; id: string; version: number; fields: NoteFields }
  | { kind: "task"; id: string; version: number; fields: TaskFields };
export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api(body?: Record<string, unknown>): Promise<PersonalWorkspaceData> {
  let res: Response;
  try {
    res = await fetch("/api/personal", {
      method: body ? "POST" : "GET",
      credentials: "include",
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection.", 0);
  }
  let json: { data?: PersonalWorkspaceData; error?: string } = {};
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok || !json.data)
    throw new ApiError(json.error || `Request failed (${res.status}).`, res.status);
  return json.data;
}

export const isConflict = (e: unknown) =>
  e instanceof ApiError &&
  (e.status === 409 || /conflict|version|changed elsewhere/i.test(e.message));

export const noteFields = (n: PersonalNoteView): NoteFields => ({
  title: n.title,
  body: n.body,
  checklist: n.checklist.map((c) => ({ ...c })),
  folderId: n.folderId,
  pinned: n.pinned,
});
export const taskFields = (t: PersonalTaskView): TaskFields => ({
  title: t.title,
  description: t.description,
  dueDate: t.dueDate ? t.dueDate.slice(0, 10) : null,
  priority: t.priority,
  status: t.status,
  completionNote: t.completionNote,
});
export const day = (s: string | null) => (s ? s.slice(0, 10) : "");
export function fmtDate(s: string | null) {
  if (!s) return "";
  if (s.includes("T")) {
    return new Date(s).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York",
    });
  }
  const d = s.slice(0, 10);
  const [y, m, dd] = d.split("-").map(Number);
  if (!y) return s;
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
export function fmtStamp(s: string | null) {
  if (!s) return "";
  return new Date(s).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}
export const preview = (n: PersonalNoteView) =>
  (
    n.body.trim().split("\n").find(Boolean) ||
    (n.checklist[0] ? `${n.checklist.length} checklist items` : "No additional text")
  ).slice(0, 90);
export const PRI_LABEL: Record<Priority, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
export const STATUS_LABEL: Record<Status, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
};
export const rid = () => crypto.randomUUID();

export function linkedTask(
  tasks: PersonalTaskView[],
  noteId: string,
  itemId?: string,
  itemIds: string[] = [],
) {
  void itemIds;
  return tasks.find(
    (t) =>
      t.noteId === noteId &&
      t.sourceKey === (itemId ? `item:${noteId}:${itemId}` : `note:${noteId}`),
  );
}
