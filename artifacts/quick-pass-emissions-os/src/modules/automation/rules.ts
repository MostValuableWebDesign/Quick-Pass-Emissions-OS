import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { addDays, dueInstant } from "@/lib/time";
import { id, timeString } from "@/lib/validation";
import { requiredInteger } from "../finance/rules";

export const reminderKinds = ["MAINTENANCE", "CERTIFICATION", "DEALER", "RENTAL"] as const;
export const scheduleInput = z.object({
  key: z.enum(["daily", "weekly"]),
  frequency: z.enum(["DAILY", "WEEKLY"]),
  weekday: requiredInteger(1, 7),
  time: timeString,
  openDaysOnly: z.boolean(),
  active: z.boolean(),
  revision: requiredInteger(0, 1000000),
});
export const policyInput = z
  .object({
    kind: z.enum(reminderKinds),
    active: z.boolean(),
    advanceDays: requiredInteger(0, 365),
    escalationDays: requiredInteger(0, 365),
    recipients: z.array(id).max(100),
    escalationRecipients: z.array(id).max(100),
    revision: requiredInteger(0, 1000000),
  })
  .refine(
    (v) => !v.active || (v.recipients.length > 0 && v.escalationRecipients.length > 0),
    "Enabled policies require advance/overdue and escalation recipients.",
  );
export const forecastInput = z
  .object({
    key: id,
    windowDays: requiredInteger(7, 365),
    minimumDays: requiredInteger(1, 365),
    leadDays: requiredInteger(0, 365),
    threshold: requiredInteger(0, 2000000000),
    revision: requiredInteger(0, 1000000),
  })
  .refine((v) => v.minimumDays <= v.windowDays, "Minimum coverage must fit within the window.");
export function periodFor(day: string, frequency: string) {
  return { start: addDays(day, frequency === "WEEKLY" ? -7 : -1), end: addDays(day, -1) };
}
export function scheduleOccurs(
  s: { frequency: string; weekday: number | null; time: string; openDaysOnly: boolean },
  day: string,
  now: Date,
  operatingDays: number[],
  closed: Set<string>,
) {
  const weekday = Temporal.PlainDate.from(day).dayOfWeek;
  return (
    (s.frequency === "DAILY" || s.weekday === weekday) &&
    (!s.openDaysOnly || (operatingDays.includes(weekday) && !closed.has(day))) &&
    dueInstant(day, s.time) <= now
  );
}
export function reminderStage(
  due: string,
  today: string,
  advanceDays: number,
  escalationDays: number,
) {
  const days = Temporal.PlainDate.from(due).until(today).days;
  return days > escalationDays
    ? "ESCALATED"
    : days > 0
      ? "OVERDUE"
      : days >= -advanceDays
        ? "ADVANCE"
        : null;
}
export function retryAt(now: Date, attempt: number) {
  return new Date(now.getTime() + 60000 * 2 ** (attempt - 1));
}
export function depletion(input: {
  today: string;
  openingDate: string | null;
  balance: number | null;
  windowDays: number;
  minimumDays: number;
  used: number;
  leadDays: number;
  threshold: number;
}) {
  const observationStart = addDays(input.today, 1 - input.windowDays);
  const start = input.openingDate ? [input.openingDate, observationStart].sort().at(-1)! : null;
  const days =
    start && start <= input.today ? Temporal.PlainDate.from(start).until(input.today).days + 1 : 0;
  const average = days ? input.used / days : null;
  const state =
    input.balance === null || !start
      ? "UNKNOWN_STOCK"
      : days < input.minimumDays
        ? "INSUFFICIENT_HISTORY"
        : input.used === 0
          ? "ZERO_USAGE"
          : "ESTIMATE";
  const remaining = state === "ESTIMATE" ? Math.ceil(input.balance! / average!) : null;
  const threshold = Math.max(
    input.threshold,
    state === "ESTIMATE" ? Math.ceil(average! * input.leadDays) : 0,
  );
  return {
    observationStart,
    observationEnd: input.today,
    coverageStart: start,
    coverageDays: days,
    recordedConsumption: input.used,
    averageDailyUsage: average,
    state,
    balance: input.balance,
    depletionDate: remaining === null ? null : addDays(input.today, remaining),
    estimatedDaysRemaining: remaining,
    planningLeadDays: input.leadDays,
    threshold,
    low: input.balance !== null && input.balance <= threshold,
  };
}
