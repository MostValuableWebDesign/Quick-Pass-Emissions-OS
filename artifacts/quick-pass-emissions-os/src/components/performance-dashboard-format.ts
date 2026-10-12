export const usd = (cents: number | null | undefined, whole = false) =>
  cents === null || cents === undefined
    ? "Unknown"
    : (cents / 100).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: whole ? 0 : 2,
        minimumFractionDigits: whole ? 0 : 2,
      });
export const num = (n: number | null | undefined) =>
  n === null || n === undefined ? "No data" : n.toLocaleString("en-US");
export const inspectionTime = (minutes: number | null) =>
  minutes === null ? "No usable gaps" : `${minutes.toFixed(1)} min`;
export const shortDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
export function excludeSundayTrendDays<T extends { date: string }>(days: readonly T[]): T[] {
  return days.filter(({ date }) => new Date(`${date}T12:00:00Z`).getUTCDay() !== 0);
}
export const longDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
export const instant = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "never";
export const centsToDollars = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));
export const dollarsToCents = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(/[$,]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
