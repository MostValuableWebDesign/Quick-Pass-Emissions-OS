import { createHash } from "node:crypto";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { Temporal } from "@js-temporal/polyfill";
import { dateString } from "@/lib/validation";
import { requireRule } from "../phase2";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
const children = (n: Node): Node[] => ("childNodes" in n ? n.childNodes : []);
function elements(n: Node, tag: string): Element[] {
  return [
    ...("tagName" in n && n.tagName === tag ? [n] : []),
    ...children(n).flatMap((c) => elements(c, tag)),
  ];
}
function text(n: Node): string {
  if ("value" in n) return n.value;
  if ("tagName" in n && ["script", "style"].includes(n.tagName)) return "";
  return children(n).map(text).join("");
}
export const digest = (v: string) => createHash("sha256").update(v).digest("hex");
export type ReportRow = {
  fingerprint: string;
  sourceDate: string;
  businessDate: string;
  inspector: string;
  outcome: string;
  certificate: string;
  vehicleSuffix: string;
  vehicleHash: string;
};
export function sourceDate(value: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}) (AM|PM))?$/.exec(value);
  requireRule(m, "Unsupported report date format. Use the original portal report.");
  const date = dateString.parse(`${m[3]}-${m[1]}-${m[2]}`);
  if (m[4]) {
    const hour = Number(m[4]);
    requireRule(hour >= 1 && hour <= 12 && Number(m[5]) <= 59, "Invalid report time.");
  }
  return date;
}
export function range(start: string, end: string) {
  dateString.parse(start);
  dateString.parse(end);
  requireRule(
    end >= start && Temporal.PlainDate.from(start).until(end).days <= 366,
    "Choose an inclusive range of at most 367 days.",
  );
  return { start, end };
}
/** Parses the observed HTML-as-XLS report without executing markup or retaining its bytes. */
function parseOriginalReport(
  body: string,
  configuredStation: string,
  allowIncompleteEvidence = false,
) {
  requireRule(
    Buffer.byteLength(body, "utf8") <= 2_000_000,
    "Report limit is 2 MB. Split the date range.",
  );
  requireRule(
    body.includes("<") && !body.includes("\u0000"),
    "Use the original HTML-based .xls export; binary spreadsheets are unsupported.",
  );
  const doc = parse(body);
  const allRows = elements(doc, "tr").map((r) =>
    children(r)
      .filter((c): c is Element => "tagName" in c && ["td", "th"].includes(c.tagName))
      .map((c) => text(c).trim()),
  );
  const stationRow = allRows.find((r) => r.length === 2 && r[0] === "Station ID");
  const dates = allRows.find((r) => r.length === 2 && r[0] === "Waiver Date");
  requireRule(
    stationRow?.[1] === configuredStation,
    "Report station does not match the configured station.",
  );
  requireRule(dates, "Missing portal date-range metadata.");
  const parts = dates[1].split(" - ");
  requireRule(parts.length === 2, "Unsupported report date range.");
  const bounds = range(sourceDate(parts[0]), sourceDate(parts[1]));
  const grid = elements(doc, "table").find((t) =>
    t.attrs.some((a) => a.name === "id" && a.value === "MainContent_gvMain"),
  );
  requireRule(grid, "Missing verified test-history report table.");
  const rows = elements(grid, "tr").map((r) =>
    children(r)
      .filter((c): c is Element => "tagName" in c && ["td", "th"].includes(c.tagName))
      .map((c) => text(c).trim()),
  );
  const header = rows.findIndex(
    (r) => r.slice(0, 6).join("|") === "VIN|License Plate|Test Date|Issued By|Cert Number|Result",
  );
  requireRule(header >= 0, "Report columns changed. Re-verify the provider format.");
  const data = rows.slice(header + 1).filter((r) => r.length === 7 && r[2] !== "Test Date");
  // Empty output is not evidence of zero tests: the provider's no-results export remains unverified.
  requireRule(
    data.length > 0 && data.length <= 10000,
    "No usable test rows, or report exceeds 10,000 rows. Empty reports require provider verification.",
  );
  const incompleteRows: {
    businessDate: string;
    vehicle: boolean;
    inspector: boolean;
    outcome: boolean;
  }[] = [];
  const fingerprints = new Set<string>();
  const parsed: ReportRow[] = [];
  for (const r of data) {
    requireRule(
      r.every((v) => v.length <= 160),
      "Unsupported report field length.",
    );
    const date = sourceDate(r[2]);
    requireRule(
      date >= bounds.start && date <= bounds.end,
      "Test date is outside report metadata.",
    );
    const fingerprint = digest(JSON.stringify(r.slice(0, 6)));
    requireRule(
      !fingerprints.has(fingerprint),
      "Indistinguishable duplicate report rows. Obtain record-ID evidence before importing; do not guess their identity.",
    );
    fingerprints.add(fingerprint);
    const issue = {
      businessDate: date,
      vehicle: !/^[A-Za-z0-9]{17}$/.test(r[0]),
      inspector: !r[3],
      outcome: !r[5],
    };
    if (issue.vehicle || issue.inspector || issue.outcome) {
      requireRule(allowIncompleteEvidence, "Missing vehicle, inspector or outcome evidence.");
      incompleteRows.push(issue);
      continue;
    }
    parsed.push({
      fingerprint,
      sourceDate: r[2],
      businessDate: date,
      inspector: r[3],
      outcome: r[5],
      certificate: r[4],
      vehicleSuffix: r[0].slice(-4),
      vehicleHash: digest(r[0].toUpperCase()),
    });
  }
  return { ...bounds, rows: parsed, incompleteRows, digest: digest(body) };
}

/** Reviewed imports still require complete evidence for every source row. */
export function parseReport(body: string, configuredStation: string) {
  const report = parseOriginalReport(body, configuredStation);
  return { start: report.start, end: report.end, rows: report.rows, digest: report.digest };
}

/** Performance may retain a verified raw row count without inventing missing test evidence. */
export function parsePerformanceReport(body: string, configuredStation: string) {
  return parseOriginalReport(body, configuredStation, true);
}
