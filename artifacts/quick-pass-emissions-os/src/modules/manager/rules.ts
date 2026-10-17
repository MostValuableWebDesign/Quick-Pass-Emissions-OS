import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { addDays, dueInstant } from "@/lib/time";
import { dateString, timeString, requiredInteger, id, text, note } from "@/lib/validation";
export const areas = [
  "EMISSIONS",
  "TAG_RENEWAL",
  "SELF_SERVICE_WASH",
  "DETAIL_RENTALS",
  "PROPERTY",
  "PAYROLL",
  "BILLING",
  "MARKETING",
  "WEBSITE",
  "GENERAL",
] as const;
export const priorities = ["CRITICAL", "HIGH", "NORMAL", "LOW"] as const;
export const checklistInput = z.array(z.object({ label: text, done: z.boolean() })).max(30);
export const taskInput = z
  .object({
    title: text,
    description: note.default(""),
    employeeId: id,
    oversightId: id,
    area: z.enum(areas),
    station: z.string().trim().max(100).default(""),
    date: dateString,
    time: timeString,
    frequency: z.enum(["ONCE", "DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"]),
    weekdays: z.array(requiredInteger(1, 7)).max(7).default([]),
    priority: z.enum(priorities),
    durationMinutes: requiredInteger(5, 480),
    reviewRequired: z.boolean(),
    checklist: checklistInput.default([]),
    dependencies: z.array(id).max(30).default([]),
  })
  .refine(
    (v) => !["DAILY", "WEEKLY"].includes(v.frequency) || v.weekdays.length > 0,
    "Select at least one weekday.",
  )
  .refine(
    (v) => v.frequency === "ONCE" || !v.dependencies.length,
    "Add occurrence-specific dependencies after generation.",
  );
const interval = z
  .object({ start: timeString, end: timeString })
  .refine((v) => v.start < v.end, "End must follow start; split overnight availability.");
export const availabilityInput = z
  .object({
    version: requiredInteger(0, 2147483647),
    reservePercent: requiredInteger(0, 80),
    days: z
      .array(
        z.object({
          weekday: requiredInteger(1, 7),
          start: timeString,
          end: timeString,
          breaks: z.array(interval).max(6),
        }),
      )
      .max(7),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.days.map((d) => d.weekday)).size !== v.days.length)
      ctx.addIssue({ code: "custom", message: "Choose each working day once." });
    for (const d of v.days) {
      if (d.start >= d.end)
        ctx.addIssue({ code: "custom", message: "Availability must end after it starts." });
      const breaks = [...d.breaks].sort((a, b) => a.start.localeCompare(b.start));
      if (
        breaks.some(
          (b, i) => b.start < d.start || b.end > d.end || (i > 0 && b.start < breaks[i - 1].end),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Breaks must fit availability without overlapping.",
        });
    }
  });
export type Availability = z.infer<typeof availabilityInput>;
export type PlannedTask = {
  id: string;
  version: number;
  title: string;
  dueAt: Date;
  priority: string;
  durationMinutes: number;
  dependencies: string[];
};
export type Commitment = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
};
export type Plan = {
  slots: { taskId: string; title: string; date: string; start: string; end: string }[];
  unscheduled: { taskId: string; title: string; reason: string }[];
  conflicts: string[];
  taskVersions: { id: string; version: number }[];
  commitments: Commitment[];
  configured: boolean;
};
export const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const clock = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
function exactWallClock(date: string, time: string) {
  return (
    Temporal.Instant.from(dueInstant(date, time).toISOString())
      .toZonedDateTimeISO("America/New_York")
      .toPlainTime()
      .toString({ smallestUnit: "minute" }) === time
  );
}
/** Deterministic, bounded seven-day proposal. Tasks retain their authoritative due dates. */
export function proposeSchedule(
  start: string,
  availability: Availability | null,
  tasks: PlannedTask[],
  commitments: Commitment[],
  now = new Date(),
): Plan {
  dateString.parse(start);
  const plan: Plan = {
    slots: [],
    unscheduled: [],
    conflicts: [],
    taskVersions: tasks.map((t) => ({ id: t.id, version: t.version })),
    commitments,
    configured: !!availability?.days.length,
  };
  const free: { date: string; start: number; end: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i),
      day = availability?.days.find((d) => d.weekday === Temporal.PlainDate.from(date).dayOfWeek);
    const cs = commitments
      .filter((c) => c.date === date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (!day) {
      for (const c of cs)
        plan.conflicts.push(`${date}: ${c.title} is outside configured availability.`);
      continue;
    }
    for (let j = 0; j < cs.length; j++)
      if (
        cs[j].startTime < day.start ||
        cs[j].endTime > day.end ||
        (j > 0 && cs[j].startTime < cs[j - 1].endTime) ||
        day.breaks.some((b) => b.start < cs[j].endTime && b.end > cs[j].startTime)
      )
        plan.conflicts.push(`${date}: commitment conflict — ${cs[j].title}.`);
    let segments = [{ start: minute(day.start), end: minute(day.end) }];
    for (const b of [...day.breaks, ...cs.map((c) => ({ start: c.startTime, end: c.endTime }))])
      segments = segments.flatMap((s) =>
        minute(b.end) <= s.start || minute(b.start) >= s.end
          ? [s]
          : [
              { start: s.start, end: Math.min(s.end, minute(b.start)) },
              { start: Math.max(s.start, minute(b.end)), end: s.end },
            ].filter((x) => x.end > x.start),
      );
    let reserve = Math.ceil(
      segments.reduce((n, s) => n + s.end - s.start, 0) * (availability!.reservePercent / 100),
    );
    // Keep an explicit buffer at the end of the day, beyond breaks and fixed commitments.
    for (let j = segments.length - 1; j >= 0 && reserve > 0; j--) {
      const used = Math.min(reserve, segments[j].end - segments[j].start);
      segments[j].end -= used;
      reserve -= used;
    }
    for (const s of segments) if (s.end > s.start) free.push({ date, ...s });
  }
  const pending = [...tasks].sort(
    (a, b) =>
      priorities.indexOf(a.priority as (typeof priorities)[number]) -
        priorities.indexOf(b.priority as (typeof priorities)[number]) ||
      +a.dueAt - +b.dueAt ||
      a.id.localeCompare(b.id),
  );
  const allocated = new Map<string, Date>();
  while (pending.length) {
    const index = pending.findIndex((t) => t.dependencies.every((id) => allocated.has(id)));
    if (index < 0) {
      for (const t of pending)
        plan.unscheduled.push({
          taskId: t.id,
          title: t.title,
          reason: "Waiting for a prerequisite or its required review.",
        });
      break;
    }
    const t = pending.splice(index, 1)[0];
    let placed = false;
    for (const s of free) {
      let begin = s.start;
      while (
        begin + t.durationMinutes <= s.end &&
        (dueInstant(s.date, clock(begin)) < now ||
          !exactWallClock(s.date, clock(begin)) ||
          !exactWallClock(s.date, clock(begin + t.durationMinutes)) ||
          +dueInstant(s.date, clock(begin + t.durationMinutes)) -
            +dueInstant(s.date, clock(begin)) !==
            t.durationMinutes * 60000 ||
          t.dependencies.some((id) => allocated.get(id)! > dueInstant(s.date, clock(begin))))
      )
        begin++;
      const end = begin + t.durationMinutes;
      if (end > s.end || dueInstant(s.date, clock(end)) > t.dueAt) continue;
      plan.slots.push({
        taskId: t.id,
        title: t.title,
        date: s.date,
        start: clock(begin),
        end: clock(end),
      });
      s.start = end;
      allocated.set(t.id, dueInstant(s.date, clock(end)));
      placed = true;
      break;
    }
    if (!placed)
      plan.unscheduled.push({
        taskId: t.id,
        title: t.title,
        reason: plan.configured
          ? "No capacity before deadline; review availability, duration or deadline."
          : "Draft: configure personal availability first.",
      });
  }
  return plan;
}
export function taskReady(status: string, reviewRequired: boolean, reviewedAt: Date | null) {
  return status === "COMPLETED" && (!reviewRequired || reviewedAt !== null);
}
