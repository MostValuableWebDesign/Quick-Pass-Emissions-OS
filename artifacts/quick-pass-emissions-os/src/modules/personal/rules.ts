import { addDays, businessDate } from "@/lib/time";
import type { SummarySnapshot } from "./types";

type Event = {
  kind: string;
  title: string;
  completionNote: string;
  occurredAt: Date;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt: Date | null;
};
type Task = {
  approvedWorkSummary?: string;
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
  status: string;
  createdAt: Date;
  events: Event[];
};

/** An inclusive Eastern calendar window, with each completed task counted only once. */
export function buildPersonalSummary(tasks: Task[], start: string, end: string): SummarySnapshot {
  const completed: SummarySnapshot["completed"] = [];
  const unfinished: SummarySnapshot["unfinished"] = [];
  const reopened: SummarySnapshot["reopened"] = [];
  for (const task of tasks) {
    const events = task.events
      .filter((event) => businessDate(event.occurredAt) <= end)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    const inPeriod = events.filter((event) => businessDate(event.occurredAt) >= start);
    const completion = inPeriod.filter((event) => event.kind === "COMPLETED").at(-1);
    const reopening = inPeriod.filter((event) => event.kind === "REOPENED").at(-1);
    const last = events.at(-1);
    const completionDetails =
      (completion &&
        [...events]
          .reverse()
          .find((event) => event.completedAt?.getTime() === completion.completedAt?.getTime())) ||
      completion;
    if (completion)
      completed.push({
        id: task.id,
        title: completion.title,
        completedDate: businessDate(completion.occurredAt),
        completionNote: task.approvedWorkSummary || completionDetails!.completionNote,
        reopened: events.some(
          (event) => event.kind === "REOPENED" && event.occurredAt > completion.occurredAt,
        ),
      });
    if (reopening)
      reopened.push({
        id: task.id,
        title: reopening.title,
        reopenedDate: businessDate(reopening.occurredAt),
      });
    if (businessDate(task.createdAt) <= end && last?.status !== "COMPLETED") {
      unfinished.push({
        id: task.id,
        title: last?.title ?? task.title,
        priority: last?.priority ?? task.priority,
        dueDate: last?.dueDate ?? null,
        status: last?.status ?? "TODO",
      });
    }
  }
  unfinished.sort(
    (a, b) =>
      ["HIGH", "MEDIUM", "LOW"].indexOf(a.priority) - ["HIGH", "MEDIUM", "LOW"].indexOf(b.priority),
  );
  const text = [
    `Personal work summary · ${start} – ${end} · America/New_York`,
    `${completed.length} unique task${completed.length === 1 ? "" : "s"} completed in this period. ${unfinished.length} unfinished as of ${end}.`,
    "",
    "Completed",
    ...completed.map(
      (t) =>
        `• ${t.completedDate} — ${t.title}${t.reopened ? " (reopened after completion)" : ""}${t.completionNote ? `\n  ${t.completionNote}` : ""}`,
    ),
    ...(completed.length ? [] : ["No completions recorded."]),
    "",
    "Unfinished priorities",
    ...unfinished.map(
      (t) => `• ${t.priority} — ${t.title}${t.dueDate ? ` · Due ${t.dueDate}` : ""}`,
    ),
    ...(unfinished.length ? [] : ["No unfinished tasks recorded."]),
    "",
    "Reopened in this period",
    ...reopened.map((t) => `• ${t.reopenedDate} — ${t.title}`),
    ...(reopened.length ? [] : ["No reopening recorded."]),
    "",
    "Based only on recorded tasks and activity. No work hours estimated.",
  ].join("\n");
  return { text, completed, unfinished, reopened };
}

export function closedSummaryPeriods(nextDate: string, today: string, max = 26) {
  const periods: { startDate: string; endDate: string }[] = [];
  let next = nextDate;
  while (addDays(next, 14) <= today && periods.length < max) {
    periods.push({ startDate: next, endDate: addDays(next, 13) });
    next = addDays(next, 14);
  }
  return { periods, nextDate: next };
}
