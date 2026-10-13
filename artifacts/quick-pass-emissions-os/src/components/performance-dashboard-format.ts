export const usd = (cents: number | null | undefined, whole = true) =>
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
  minutes === null ? "Pending" : `${Math.round(minutes)} min`;
export const shortDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
export function excludeSundayTrendDays<T extends { date: string }>(days: readonly T[]): T[] {
  return days.filter(({ date }) => new Date(`${date}T12:00:00Z`).getUTCDay() !== 0);
}
export type DailyTrendPoint = { date: string; value: number | null; station: number | null };
export type MonthlyTrendPoint = DailyTrendPoint & {
  label: string;
  monthToDate: boolean;
  status: "complete" | "incomplete" | "upcoming";
};
export function monthlyTrendPoints(
  days: readonly DailyTrendPoint[],
  year: number,
  throughDate: string,
): MonthlyTrendPoint[] {
  const yearEnd = `${year}-12-31`;
  const end = throughDate < yearEnd ? throughDate : yearEnd;
  const byDate = new Map(days.map((day) => [day.date, day]));

  return Array.from({ length: 12 }, (_, month) => {
    const monthNumber = String(month + 1).padStart(2, "0");
    const start = `${year}-${monthNumber}-01`;
    const monthLastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const last = `${year}-${monthNumber}-${String(monthLastDay).padStart(2, "0")}`;
    const segmentEnd = last < end ? last : end;
    const label = new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", {
      month: "short",
      timeZone: "UTC",
    });
    if (start > end)
      return {
        date: start,
        label,
        monthToDate: false,
        value: null,
        station: null,
        status: "upcoming" as const,
      };

    const expected: DailyTrendPoint[] = [];
    for (let date = start; date <= segmentEnd;) {
      if (new Date(`${date}T12:00:00Z`).getUTCDay() !== 0)
        expected.push(byDate.get(date) ?? { date, value: null, station: null });
      const next = new Date(`${date}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      date = next.toISOString().slice(0, 10);
    }
    const complete = expected.length > 0 && expected.every((day) => day.value !== null);
    const stationComplete = expected.length > 0 && expected.every((day) => day.station !== null);
    return {
      date: start,
      label,
      monthToDate: segmentEnd < last,
      value: complete ? expected.reduce((sum, day) => sum + (day.value ?? 0), 0) : null,
      station: stationComplete ? expected.reduce((sum, day) => sum + (day.station ?? 0), 0) : null,
      status: complete ? ("complete" as const) : ("incomplete" as const),
    };
  });
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
