import { Temporal } from "@js-temporal/polyfill";

/** Takes an ISO calendar date already normalized to the business timezone. */
export function isEmissionsClosedOn(date: string): boolean {
  return Temporal.PlainDate.from(date).dayOfWeek === 7;
}
