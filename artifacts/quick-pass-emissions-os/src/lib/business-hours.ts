import { z } from "zod";
import { timeString } from "@/lib/validation";

export const BUSINESS_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const optionalTime = z.union([timeString, z.literal("")]);
const formDayHours = z
  .object({ open: optionalTime, close: optionalTime })
  .refine(({ open, close }) => Boolean(open) === Boolean(close), {
    message: "Enter both opening and closing times for each day.",
  })
  .refine(({ open, close }) => !open || !close || close > open, {
    message: "Closing time must be later than opening time.",
  });
const savedDayHours = z
  .object({ open: timeString, close: timeString })
  .refine(({ open, close }) => close > open, {
    message: "Closing time must be later than opening time.",
  });
const savedHours = z.record(z.string().regex(/^[1-7]$/), savedDayHours);

export type BusinessHours = z.infer<typeof savedHours>;

export function readBusinessHours(value: unknown): BusinessHours {
  return savedHours.parse(value ?? {});
}

export function businessHoursFromForm(form: FormData): BusinessHours {
  const hours: Record<string, { open: string; close: string }> = {};

  BUSINESS_DAYS.forEach((_, index) => {
    const day = index + 1;
    const pair = formDayHours.parse({
      open: optionalTime.parse(form.get(`openTime${day}`) ?? ""),
      close: optionalTime.parse(form.get(`closeTime${day}`) ?? ""),
    });
    if (pair.open && pair.close) hours[String(day)] = pair;
  });

  return savedHours.parse(hours);
}
