import { Temporal } from "@js-temporal/polyfill";
import { addDays, forecastDate } from "../../lib/time";
export function certificateForecast(input: {
  balance: number;
  openingDate: string;
  today: string;
  windowDays: number;
  used: number;
  minimumOrder: number;
  reorderPoint: number;
  leadDays: number;
}) {
  const start = [input.openingDate, addDays(input.today, 1 - input.windowDays)].sort().at(-1)!;
  const days = Temporal.PlainDate.from(start).until(input.today).days + 1;
  const averageDailyUsage = input.used / days;
  // Estimates from recorded usage, not a guarantee of live stock or future demand.
  const daysRemaining = averageDailyUsage > 0 ? Math.ceil(input.balance / averageDailyUsage) : null;
  const reorderAt = Math.max(input.reorderPoint, Math.ceil(averageDailyUsage * input.leadDays));
  const low = input.balance <= reorderAt;
  const recommendedQuantity = low
    ? Math.max(
        input.minimumOrder,
        reorderAt + Math.ceil(averageDailyUsage * input.windowDays) - input.balance,
      )
    : 0;
  return {
    start,
    days,
    used: input.used,
    averageDailyUsage,
    daysRemaining,
    depletionDate: forecastDate(input.today, daysRemaining),
    reorderAt,
    low,
    recommendedQuantity,
  };
}
