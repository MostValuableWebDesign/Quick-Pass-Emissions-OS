import { parse } from "parse5";
import { Temporal } from "@js-temporal/polyfill";
import { BusinessError, requireRule } from "../phase2";
import {
  PortalSession,
  portalLogin,
  portalForm,
  portalElements,
  portalAttributes,
  portalText,
  expectedPortalTotal,
} from "../station/portal-client";

import { CERTIFICATE_HISTORY_PATH } from "./portal-types";
const STATION = "GA102539";
const SELECT = "ctl00$MainContent$ddlStationId";
const FILTERS = [
  "txtCertNumberStart",
  "txtCertNumberEnd",
  "txtAnalyzerId",
  "txtPurchaseStartDate",
  "txtPurchaseEndDate",
];
const HEADERS = [
  "Transaction ID",
  "Analyzer ID",
  "Start E-Cert Number",
  "End E-Cert Number",
  "Quantity",
  "Unit Price",
  "Amount",
  "Sale Date",
  "Payment Type",
  "Purchased By",
  "IP Address",
  "Analyzer Flag",
];
export type CertificateOrderRecord = {
  transactionId: string;
  analyzer: string;
  quantity: number;
  saleDate: string;
  saleTime: string;
  analyzerFlag: string;
};

/** Retain order evidence only; discard purchaser, IP, payment data and certificate ranges. */
export function parseCertificateOrders(html: string, expected: number): CertificateOrderRecord[] {
  const document = parse(html);
  const grids = portalElements(document, "table").filter(
    (n) => portalAttributes(n).id === "MainContent_gvMain",
  );
  requireRule(grids.length === 1, "Certificate order export format changed.");
  const headers = portalElements(grids[0], "th").map((n) =>
    portalText(n).replace(/\s+/g, " ").trim(),
  );
  requireRule(headers.join("|") === HEADERS.join("|"), "Certificate order export columns changed.");
  const orders: CertificateOrderRecord[] = [];
  const ids = new Set<string>();
  for (const row of portalElements(grids[0], "tr")) {
    const cells = portalElements(row, "td").map((n) => portalText(n).replace(/\s+/g, " ").trim());
    if (!cells.length) continue;
    requireRule(cells.length === 12, "Certificate order export contains an incomplete row.");
    const [transactionId, analyzer] = cells;
    const quantity = Number(cells[4].replaceAll(",", ""));
    const date = cells[7].match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i);
    requireRule(
      /^\d{1,20}$/.test(transactionId) && !ids.has(transactionId),
      "Certificate transaction identifiers are missing or duplicated.",
    );
    requireRule(
      /^[A-Za-z0-9_-]{1,40}$/.test(analyzer) &&
        /^-?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(cells[4]) &&
        Number.isSafeInteger(quantity) &&
        Math.abs(quantity) <= 2_000_000_000,
      "Certificate order quantity or analyzer is invalid.",
    );
    requireRule(
      date && Number(date[4]) >= 1 && Number(date[4]) <= 12 && Number(date[5]) < 60,
      "Certificate order date is invalid.",
    );
    const saleDate = `${date[3]}-${date[1].padStart(2, "0")}-${date[2].padStart(2, "0")}`;
    try {
      Temporal.PlainDate.from(saleDate);
    } catch {
      throw new BusinessError("Certificate order calendar date is invalid.");
    }
    requireRule(["Yes", "No"].includes(cells[11]), "Certificate analyzer flag changed.");
    ids.add(transactionId);
    orders.push({
      transactionId,
      analyzer,
      quantity,
      saleDate,
      saleTime: `${date[4].padStart(2, "0")}:${date[5]} ${date[6].toUpperCase()}`,
      analyzerFlag: cells[11],
    });
  }
  requireRule(
    orders.length === expected && expected > 0 && expected <= 10000,
    "Certificate export did not match the complete report total. Saved history is unchanged.",
  );
  return orders.sort(
    (a, b) =>
      b.saleDate.localeCompare(a.saleDate) ||
      b.transactionId.localeCompare(a.transactionId, undefined, { numeric: true }),
  );
}

export async function fetchCertificateOrderHistory(
  config: { username: string; password: string },
  session = new PortalSession(fetch, false, true),
) {
  try {
    await portalLogin({ ...config, station: STATION }, session);
    const page = await session.request(CERTIFICATE_HISTORY_PATH);
    const form = portalForm(page.html);
    const selects = portalElements(form.document, "select").filter(
      (n) => portalAttributes(n).name === SELECT,
    );
    requireRule(selects.length === 1, "Certificate report station selector changed.");
    const options = portalElements(selects[0], "option").filter(
      (n) =>
        /(?:^|\D)(?:GA)?102539(?:\D|$)/i.test(portalText(n)) ||
        [STATION, "102539"].includes(portalAttributes(n).value),
    );
    requireRule(options.length === 1, "The requested station is not uniquely available.");
    const value = portalAttributes(options[0]).value;
    requireRule(
      value && /^[A-Za-z0-9,_-]{1,40}$/.test(value),
      "Certificate station value changed.",
    );
    form.body.set(SELECT, value);
    for (const field of FILTERS) {
      const name = `ctl00$MainContent$${field}`;
      requireRule(form.body.has(name), "Certificate report filters changed.");
      form.body.set(name, "");
    }
    form.body.set("ctl00$MainContent$btnGetReport", "Search");
    const report = await session.request(new URL(form.action, page.url).href, form.body);
    const result = portalForm(report.html);
    requireRule(
      result.body.get(SELECT) === value &&
        FILTERS.every((f) => result.body.get(`ctl00$MainContent$${f}`) === ""),
      "Certificate report station or filters did not match.",
    );
    const expected = expectedPortalTotal(report.html);
    const exportControl = portalElements(result.document, "input")
      .map(portalAttributes)
      .find(
        (a) =>
          a.type === "image" &&
          a.alt === "Export" &&
          /^ctl00\$MainContent\$gvMain\$ctl\d+\$pgrApplus\$btnExport$/.test(a.name ?? ""),
      );
    requireRule(exportControl, "Certificate report export is unavailable.");
    result.body.set(`${exportControl.name}.x`, "1");
    result.body.set(`${exportControl.name}.y`, "1");
    const exported = await session.request(new URL(result.action, report.url).href, result.body);
    return {
      orders: parseCertificateOrders(exported.html, expected),
      checkedAt: new Date().toISOString(),
    };
  } finally {
    session.dispose();
  }
}
