import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
export function requiredInteger(min: number, max: number) {
  return z
    .union([z.number(), z.string().trim().min(1)])
    .transform((v) => Number(v))
    .pipe(z.number().int().min(min).max(max));
}
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    try {
      Temporal.PlainDate.from(v);
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid date");
export const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const text = z.string().trim().min(1).max(160);
export const note = z.string().trim().max(2000);
export const id = z.string().min(1).max(100);
export const role = z.enum(["OWNER", "ADMIN", "EMPLOYEE", "BOOKKEEPER"]);
export const status = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "BLOCKED", "CANCELLED"]);
export const days = z.array(z.coerce.number().int().min(1).max(7)).max(7);
export const optionalDate = z.union([dateString, z.literal("")]).transform((v) => v || null);
export const employeeInput = z.object({
  name: text,
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  role,
  phone: z.string().trim().max(50),
  startDate: optionalDate,
  duties: note,
  workAreas: note,
  managerNotes: note,
  certificationExpires: optionalDate,
});
export const templateInput = z
  .object({
    title: text,
    description: note,
    frequency: z.enum(["ONCE", "DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"]),
    startDate: dateString,
    endDate: optionalDate,
    dueTime: timeString,
    weekdays: days,
    employeeId: id,
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]),
    reviewRequired: z.boolean(),
    escalationHours: z.coerce.number().int().min(0).max(168),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, "End date must follow start date")
  .refine((v) => v.frequency !== "WEEKLY" || v.weekdays.length > 0, "Select a weekday");
export const shiftInput = z
  .object({
    employeeId: id,
    date: dateString,
    startTime: timeString,
    endTime: timeString,
    duties: note,
  })
  .refine(
    (v) => v.endTime > v.startTime,
    "Shift must end after it starts; split overnight shifts into two dates",
  );
export function fields(form: FormData) {
  return Object.fromEntries(form.entries());
}
