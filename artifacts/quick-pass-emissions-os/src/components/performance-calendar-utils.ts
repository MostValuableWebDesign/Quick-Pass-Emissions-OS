export type CalMode = "single" | "range";
export type CalSel = { start: string; end: string | null };

export const modeForDates = (start: string, end: string): CalMode =>
  start === end ? "single" : "range";

export function selectStartDate(mode: CalMode, selection: CalSel, start: string): CalSel {
  if (mode === "single") return { start, end: start };
  return { start, end: selection.end && selection.end >= start ? selection.end : null };
}

export const shouldAutoSearchSingleDay = (mode: CalMode, selection: CalSel) =>
  mode === "single" && selection.start === selection.end;

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
export const parseIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m - 1, d };
};
export const isIso = (s: string | null | undefined): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Shift a {y,m} month by delta months. */
export function shiftMonth(y: number, m: number, delta: number) {
  const t = y * 12 + m + delta;
  return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
}

/** Returns 6x7 grid of ISO dates (null for padding), weeks starting Sunday. */
export function monthGrid(y: number, m: number): (string | null)[] {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(iso(y, m, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** Apply a click to the current selection. ISO strings compare lexically. */
export function pickDay(mode: CalMode, sel: CalSel, day: string, max: string): CalSel {
  if (day > max) return sel;
  if (mode === "single") return { start: day, end: day };
  if (sel.end !== null || !sel.start) return { start: day, end: null };
  return day < sel.start ? { start: day, end: sel.start } : { start: sel.start, end: day };
}

export function dayState(day: string, sel: CalSel, hover: string | null) {
  const end = sel.end ?? (hover && sel.start ? hover : sel.start);
  const lo = sel.start && end && end < sel.start ? end : sel.start;
  const hi = sel.start && end && end < sel.start ? sel.start : end;
  return {
    start: day === lo,
    end: day === hi,
    inRange: !!lo && !!hi && day > lo && day < hi,
  };
}

/** Final query values; incomplete range collapses to a single day. */
export function finalize(sel: CalSel) {
  return { start: sel.start, end: sel.end ?? sel.start };
}
