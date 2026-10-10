import { Temporal } from "@js-temporal/polyfill";
import { addDays } from "@/lib/time";
import { CERTIFICATE_ANALYZER, type CertificatePortalStatus } from "./portal-types";
import type { CertificateOrderRecord } from "./order-history-source";

export function certificateOrderInsights(
  orders: CertificateOrderRecord[], portal: CertificatePortalStatus, today: string,
  settings: { windowDays: number | null; leadDays: number | null; reorderPoint: number | null } | null,
) {
  const windowDays = settings?.windowDays ?? 30;
  const start = addDays(today, 1 - windowDays);
  const byDate = new Map<string, number>();
  for (const order of orders) {
    if (order.analyzer !== CERTIFICATE_ANALYZER || order.quantity <= 0 || order.saleDate < start || order.saleDate > today) continue;
    byDate.set(order.saleDate, (byDate.get(order.saleDate) ?? 0) + order.quantity);
  }
  const dates = [...byDate.keys()].sort();
  const first = dates[0];
  const last = dates.at(-1);
  const days = first && last ? Temporal.PlainDate.from(first).until(last).days : 0;
  // Replenishment cadence is a planning proxy, not proof of actual consumption.
  // Exclude the final purchase: there is no following order interval for it yet.
  const quantity = dates.slice(0, -1).reduce((sum, date) => sum + byDate.get(date)!, 0);
  const average = days > 0 ? quantity / days : null;
  const reorderAt = Math.max(portal.threshold, settings?.reorderPoint ?? 0,
    average === null || settings?.leadDays == null ? 0 : Math.ceil(average * settings.leadDays));
  const daysRemaining = average !== null && average > 0 && portal.balance !== null
    ? Math.ceil(portal.balance / average) : null;
  return {
    balance: portal.balance, average, reorderAt, daysRemaining,
    depletionDate: daysRemaining === null ? null : addDays(today, daysRemaining),
    sampleStart: first ?? null, sampleEnd: last ?? null, sampleDays: days, windowDays,
    leadDays: settings?.leadDays ?? null,
  };
}
