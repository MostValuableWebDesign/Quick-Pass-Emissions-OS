export type ChecklistItem = { id: string; text: string; checked: boolean };
export type PersonalNoteView = {
  id: string;
  title: string;
  body: string;
  checklist: ChecklistItem[];
  folderId: string | null;
  pinned: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
  version: number;
  updatedAt: string;
  createdAt: string;
};
export type PersonalTaskView = {
  id: string;
  title: string;
  description: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: "TODO" | "IN_PROGRESS" | "COMPLETED";
  dueDate: string | null;
  completedAt: string | null;
  completionNote: string;
  noteId: string | null;
  sourceKey: string;
  version: number;
  updatedAt: string;
  createdAt: string;
};
export type SummarySnapshot = {
  spending?: import("./expense-types").SpendingSnapshot;
  text: string;
  completed: {
    id: string;
    title: string;
    completedDate: string;
    completionNote: string;
    reopened: boolean;
  }[];
  unfinished: {
    id: string;
    title: string;
    priority: string;
    dueDate: string | null;
    status: string;
  }[];
  reopened: { id: string; title: string; reopenedDate: string }[];
};
export type PersonalSummaryView = {
  id: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  snapshot: SummarySnapshot;
};
export type PersonalWorkspaceData = {
  folders: { id: string; name: string }[];
  notes: PersonalNoteView[];
  tasks: PersonalTaskView[];
  summaries: PersonalSummaryView[];
  today: string;
  schedule: {
    firstDate: string;
    nextDate: string;
    enabled: boolean;
    lastRunAt: string | null;
  } | null;
  runner: { lastRunAt: string | null; healthy: boolean };
};
