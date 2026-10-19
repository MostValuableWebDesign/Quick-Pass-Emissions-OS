import { dateString } from "@/lib/validation";
import { requireRule } from "../phase2";
import {
  portalForm,
  portalExplicitEmpty,
  portalElements,
  portalAttributes,
  portalText,
} from "./portal-client";

/** Availability metadata only: never establishes all-page counts, paid tests or daily zeroes. */
export function stationHistoryAvailability(
  html: string,
  station: string,
  start: string,
  end: string,
) {
  const form = portalForm(html);
  const formatted = (date: string) => {
    const [y, m, d] = date.split("-");
    return `${m}/${d}/${y}`;
  };
  requireRule(
    form.body.get("ctl00$MainContent$txtStationId") === station &&
      form.body.get("ctl00$MainContent$txtWaiverDateStart") === formatted(start) &&
      form.body.get("ctl00$MainContent$txtWaiverDateEnd") === formatted(end) &&
      ["txtVin", "txtCertNumber", "txtLicNo", "txtWaiverRecordNumber"].every(
        (field) => form.body.get(`ctl00$MainContent$${field}`) === "",
      ),
    "Source did not echo the requested station and dates.",
  );
  if (portalExplicitEmpty(html, start, end, station)) return { traffic: false, sourceItems: null };
  const totals = portalElements(form.document, "span")
    .filter((node) => portalAttributes(node).id === "MainContent_gvMain_pgrApplus")
    .map((node) => {
      const match = /Page\s+1\s+of\s+([\d,]+)\s+\(([\d,]+)\s+items\)/i.exec(portalText(node));
      return match && Number(match[1].replaceAll(",", "")) >= 1
        ? Number(match[2].replaceAll(",", ""))
        : NaN;
    });
  requireRule(
    totals.length > 0 && totals.every((n) => Number.isSafeInteger(n) && n > 0 && n === totals[0]),
    "Source history activity could not be verified.",
  );
  const grid = portalElements(form.document, "table").find(
    (node) => portalAttributes(node).id === "MainContent_gvMain",
  );
  // Read cells separately: concatenating grid text joins plates/dates/inspector names.
  const dates = grid
    ? portalElements(grid, "td").flatMap((cell) =>
        [...portalText(cell).matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)].map(
          (match) => `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`,
        ),
      )
    : [];
  requireRule(
    dates.length > 0 &&
      dates.every((date) => dateString.safeParse(date).success && date >= start && date <= end),
    "Source traffic dates did not match the requested history window.",
  );
  return { traffic: true, sourceItems: totals[0] };
}
