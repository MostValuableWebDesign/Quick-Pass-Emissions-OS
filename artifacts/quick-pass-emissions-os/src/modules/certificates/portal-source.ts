import { BusinessError, requireRule } from "../phase2";
import { PortalSession, portalLogin, portalForm, portalElements, portalAttributes, portalText } from "../station/portal-client";
import { CERTIFICATE_ANALYZER, CERTIFICATE_STATION } from "./portal-types";

const PATH = "/Purchasing/Purchasing.aspx";
export const UNUSED_CERTIFICATES_PATH = `${PATH}/GetUnusedCertsForAnalyzer`;

/** Only exact, uniquely matching choices are accepted. Never substitute another station/analyzer. */
export function certificateChoice(html: string, id: string, label: string) {
  const form = portalForm(html);
  const selects = portalElements(form.document, "select").filter((n) => portalAttributes(n).id === id);
  requireRule(selects.length === 1, "Certificate portal selectors changed. Open the portal manually.");
  const options = portalElements(selects[0], "option").filter((n) => portalText(n).trim() === label);
  requireRule(options.length === 1, "The requested station or analyzer is not uniquely available.");
  const value = portalAttributes(options[0]).value;
  requireRule(value && /^[0-9,]{1,40}$/.test(value), "Certificate portal selector value changed.");
  return { form, value, name: portalAttributes(selects[0]).name };
}

export function parseUnusedCertificates(body: string): number {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new BusinessError("Certificate balance could not be verified."); }
  const value = typeof parsed === "object" && parsed !== null && "d" in parsed ? parsed.d : null;
  requireRule(
    (typeof value === "number" && Number.isSafeInteger(value)) ||
    (typeof value === "string" && /^(0|[1-9]\d{0,9})$/.test(value)),
    "Certificate portal returned an invalid balance.",
  );
  const count = Number(value);
  requireRule(count >= 0 && count <= 2_000_000_000, "Certificate balance is outside the supported range.");
  return count;
}

/** Provider-native read-only station selection + unused-count lookup. No order or payment controls. */
export async function fetchCertificateBalance(
  config: { username: string; password: string },
  session = new PortalSession(fetch, true),
) {
  try {
    await portalLogin({ ...config, station: "GA102539" }, session);
    const page = await session.request(PATH);
    const station = certificateChoice(page.html, "ddlStations", CERTIFICATE_STATION);
    requireRule(station.name === "ctl00$MainContent$ddlStations", "Station selector changed.");
    // Post only WebForms validation/state and this selector. Exclude cart,
    // quantity, order, receipt, customer and payment inputs entirely.
    const body = new URLSearchParams();
    for (const [key, value] of station.form.body)
      if (/^__VIEWSTATE(?:\d+|GENERATOR|FIELDCOUNT)?$/.test(key) || key === "__EVENTVALIDATION")
        body.set(key, value);
    body.set(station.name, station.value);
    body.set("__EVENTTARGET", station.name);
    body.set("__EVENTARGUMENT", "");
    const selected = await session.request(new URL(station.form.action, page.url).href, body);
    const echoed = certificateChoice(selected.html, "ddlStations", CERTIFICATE_STATION);
    requireRule(echoed.form.body.get(station.name) === station.value, "The portal did not confirm the requested station.");
    const analyzer = certificateChoice(selected.html, "ddlAnalyzers", CERTIFICATE_ANALYZER);
    requireRule(analyzer.name === "ctl00$MainContent$ddlAnalyzers", "Analyzer selector changed.");
    const result = await session.request(UNUSED_CERTIFICATES_PATH, JSON.stringify({ analyzer: analyzer.value }));
    return parseUnusedCertificates(result.html);
  } finally { session.dispose(); }
}
