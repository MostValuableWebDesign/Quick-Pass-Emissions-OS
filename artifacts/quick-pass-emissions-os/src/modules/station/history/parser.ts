import { parse } from "parse5";
import { portalElements, portalText, portalChildren, portalAttributes } from "../portal-client";
import { range, sourceDate, digest } from "../report";
import { columns, type RawInspection } from "./rules";
import { requireRule } from "../../phase2";

export function parseCsv(body: string): RawInspection[] {
  requireRule(
    Buffer.byteLength(body) <= 2_000_000 && !body.includes("\0"),
    "Use a CSV or original HTML .xls export of at most 2 MB.",
  );
  const records: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const pushCell = () => {
    requireRule(cell.length <= 4096, "A source field exceeds 4,096 characters.");
    row.push(cell);
    cell = "";
    closed = false;
  };
  const pushRow = () => {
    pushCell();
    if (row.some((v) => v !== "")) records.push(row);
    row = [];
    requireRule(records.length <= 10001, "Split the file into exports of at most 10,000 rows.");
  };
  const text = body.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === '"') {
      requireRule(!cell && !closed, "Invalid CSV quoting.");
      quoted = true;
    } else if (c === ",") pushCell();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      pushRow();
    } else {
      requireRule(!closed, "Unexpected text after a quoted CSV cell.");
      cell += c;
    }
  }
  requireRule(!quoted, "CSV has an unclosed quoted field.");
  if (cell || row.length || closed) pushRow();
  const headers = records.shift()?.map((h) => h.trim());
  requireRule(
    headers?.length &&
      headers.length <= 64 &&
      headers.every(Boolean) &&
      new Set(headers).size === headers.length,
    "Use unique, nonblank CSV column headers (maximum 64).",
  );
  const shape = columns(Object.fromEntries(headers.map((h) => [h, ""])));
  requireRule("date" in shape, "CSV needs a Test Date column. See the sample header.");
  return records.map((r) => {
    requireRule(r.length === headers.length, "CSV row width differs from its header.");
    return { fields: Object.fromEntries(headers.map((h, i) => [h, r[i]])) };
  });
}

/** Reuses the existing verified portal table and original six-field fingerprint. */
export function parseHistoryExport(body: string, station: string) {
  requireRule(
    Buffer.byteLength(body) <= 2_000_000 && body.includes("<") && !body.includes("\0"),
    "Use the original HTML .xls export, at most 2 MB; binary Excel is unsupported. Save .xlsx as CSV.",
  );
  const doc = parse(body);
  const cells = (node: Parameters<typeof portalChildren>[0]) =>
    portalChildren(node)
      .filter((n) => "tagName" in n && ["td", "th"].includes(n.tagName))
      .map((n) => portalText(n).trim());
  const all = portalElements(doc, "tr").map(cells);
  requireRule(
    all.some(
      (r) =>
        r.length === 2 && r[0] === "Station ID" && (r[1] === station || digest(r[1]) === station),
    ),
    "Export station does not match the selected station.",
  );
  const dates = all.find((r) => r.length === 2 && r[0] === "Waiver Date")?.[1].split(" - ");
  requireRule(dates?.length === 2, "Export date metadata is missing.");
  const bounds = range(sourceDate(dates[0]), sourceDate(dates[1]));
  const grid = portalElements(doc, "table").find(
    (n) => portalAttributes(n).id === "MainContent_gvMain",
  );
  requireRule(grid, "Verified test-history export table is missing.");
  const rows = portalElements(grid, "tr").map(cells);
  const index = rows.findIndex(
    (r) => r.slice(0, 6).join("|") === "VIN|License Plate|Test Date|Issued By|Cert Number|Result",
  );
  requireRule(index >= 0, "Provider export columns changed; use a reviewed CSV export.");
  const header = rows[index];
  const data = rows.slice(index + 1).filter((r) => r.length > 0 && r[2] !== "Test Date");
  requireRule(
    data.every((r) => r.length === header.length),
    "Unexpected export rows or columns; use a complete reviewed CSV export rather than dropping source rows.",
  );
  requireRule(
    data.length > 0 && data.length <= 10000,
    "No usable rows, or more than 10,000 rows; empty exports do not verify zero history.",
  );
  return {
    ...bounds,
    rows: data.map((r) => ({
      fields: Object.fromEntries(
        r.map((value, i) => [header[i] || `Source column ${i + 1}`, value]),
      ),
      fingerprint: digest(JSON.stringify(r.slice(0, 6))),
    })),
  };
}
