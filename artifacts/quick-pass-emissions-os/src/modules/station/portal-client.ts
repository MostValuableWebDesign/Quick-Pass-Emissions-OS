import { parse, type DefaultTreeAdapterMap } from "parse5";
import { businessDate } from "@/lib/time";
import { BusinessError } from "../phase2";
import { parseReport, parsePerformanceReport } from "./report";
import { reportMinute } from "./inspection-cadence";
import { range } from "./report";
import type { PortalDay, Counts } from "./dashboard-types";

const ORIGIN = "https://gadashboard.com";
export const REPORT_PATH = "/Applications/TestHistoryVirReprint.aspx";
const ALLOWED_PATHS = new Set(["/", "/Login.aspx", "/Default.aspx", REPORT_PATH]);
const LIMIT = 2_000_000;
export class PortalRetryError extends BusinessError {
  constructor(public retryAfterMs: number) {
    super(
      "Station portal is temporarily unavailable or rate limited. Retry after its saved cooldown.",
    );
  }
}
type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
export const portalChildren = (n: Node): Node[] => ("childNodes" in n ? n.childNodes : []);
export function portalElements(n: Node, tag: string): Element[] {
  return [
    ...("tagName" in n && n.tagName === tag ? [n] : []),
    ...portalChildren(n).flatMap((c) => portalElements(c, tag)),
  ];
}
export function portalText(n: Node): string {
  if ("value" in n) return n.value;
  if ("tagName" in n && ["script", "style"].includes(n.tagName)) return "";
  return portalChildren(n).map(portalText).join("");
}
export const portalAttributes = (n: Element) =>
  Object.fromEntries(n.attrs.map((a) => [a.name, a.value]));

export function portalForm(html: string) {
  const document = parse(html);
  const form = portalElements(document, "form")[0];
  if (!form) throw new BusinessError("Station portal form changed. Use a manual report export.");
  const body = new URLSearchParams();
  for (const input of portalElements(form, "input")) {
    const a = portalAttributes(input);
    if (!a.name || "disabled" in a) continue;
    const type = a.type?.toLowerCase() ?? "text";
    if (["submit", "image", "button", "reset", "file"].includes(type)) continue;
    if (["radio", "checkbox"].includes(type) && !("checked" in a)) continue;
    body.set(a.name, a.value ?? (["radio", "checkbox"].includes(type) ? "on" : ""));
  }
  for (const select of portalElements(form, "select")) {
    const a = portalAttributes(select);
    if (!a.name || "disabled" in a) continue;
    const options = portalElements(select, "option");
    const option = options.find((o) => "selected" in portalAttributes(o)) ?? options[0];
    if (option) body.set(a.name, portalAttributes(option).value ?? portalText(option));
  }
  return { document, body, action: portalAttributes(form).action ?? REPORT_PATH };
}

/** Short-lived same-origin session. Cookies/credentials stay server-side; original reports may be retained encrypted for authorized owner review. */
export class PortalSession {
  private cookies = new Map<string, string>();
  private deadline = Date.now() + 60_000;
  private allowedPaths: Set<string>;
  constructor(
    private transport: typeof fetch = fetch,
    allowCertificateReads = false,
    allowCertificateHistory = false,
    private operationSignal?: AbortSignal,
  ) {
    this.allowedPaths = new Set(ALLOWED_PATHS);
    if (allowCertificateReads) {
      this.allowedPaths.add("/Purchasing/Purchasing.aspx");
      this.allowedPaths.add("/Purchasing/Purchasing.aspx/GetUnusedCertsForAnalyzer");
    }
    if (allowCertificateHistory) this.allowedPaths.add("/Purchasing/TAReport.aspx");
  }

  async request(path: string, body?: URLSearchParams | string) {
    let url = new URL(path, ORIGIN);
    for (let redirect = 0; redirect < 6; redirect++) {
      if (url.origin !== ORIGIN || !this.allowedPaths.has(url.pathname))
        throw new BusinessError("Station portal redirected to an unsupported location.");
      const remaining = this.deadline - Date.now();
      if (remaining <= 0) throw new BusinessError("Station portal lookup timed out. Try later.");
      if (this.operationSignal?.aborted)
        throw new BusinessError("Station test export timed out. Try later.");
      const timeout = AbortSignal.timeout(Math.min(15_000, remaining));
      const signal = this.operationSignal
        ? AbortSignal.any([this.operationSignal, timeout])
        : timeout;
      let response: Response;
      try {
        response = await this.transport(url, {
          method: body ? "POST" : "GET",
          body: body?.toString(),
          redirect: "manual",
          cache: "no-store",
          signal,
          headers: {
            ...(body
              ? {
                  "Content-Type":
                    typeof body === "string"
                      ? "application/json; charset=utf-8"
                      : "application/x-www-form-urlencoded",
                }
              : {}),
            ...(this.cookies.size
              ? { Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") }
              : {}),
          },
        });
      } catch {
        throw new BusinessError("Station portal is unavailable or timed out. Try later.");
      }
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(";")[0];
        const split = pair.indexOf("=");
        if (split > 0) this.cookies.set(pair.slice(0, split), pair.slice(split + 1));
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new BusinessError("Station portal returned an invalid redirect.");
        url = new URL(location, url);
        if (![307, 308].includes(response.status)) body = undefined;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 429 || response.status >= 500) {
          const raw = response.headers.get("retry-after");
          const wait =
            raw && /^\d+$/.test(raw) ? Number(raw) * 1000 : raw ? Date.parse(raw) - Date.now() : 0;
          throw new PortalRetryError(
            Number.isFinite(wait) ? Math.max(0, Math.min(wait, 24 * 60 * 60000)) : 0,
          );
        }
        throw new BusinessError(
          "Station portal rejected the request. Try later or sign in manually.",
        );
      }
      const reader = response.body?.getReader();
      if (!reader) throw new BusinessError("Station portal returned no report.");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      const cancel = () => {
        void reader.cancel().catch(() => {});
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        signal.throwIfAborted();
        while (true) {
          const { done, value } = await reader.read();
          signal.throwIfAborted();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > LIMIT) {
            await reader.cancel();
            throw new BusinessError("Station report exceeds the safe 2 MB limit. Export manually.");
          }
          chunks.push(value);
        }
      } catch (error) {
        if (error instanceof BusinessError) throw error;
        throw new BusinessError("Station report could not be read completely. Try again.");
      } finally {
        signal.removeEventListener("abort", cancel);
      }
      const html = Buffer.concat(chunks).toString("utf8");
      if (/captcha|recaptcha|one.time.password|multi.factor/i.test(html))
        throw new BusinessError("Station portal requires a security check. Sign in manually.");
      return { html, url: url.href, contentType: response.headers.get("content-type") ?? "" };
    }
    throw new BusinessError("Station portal redirected too many times. Sign in manually.");
  }

  dispose() {
    this.cookies.clear();
  }
}

export async function portalLogin(
  config: { username: string; password: string; station: string },
  session: PortalSession,
) {
  if (!config.username || !config.password || !/^[A-Za-z0-9_-]{1,40}$/.test(config.station))
    throw new BusinessError("Station portal Secrets are missing or invalid.");
  const login = await session.request("/Login.aspx?ReturnUrl=%2f");
  const form = portalForm(login.html);
  if (!form.body.has("Login1$UserName") || !form.body.has("Login1$Password"))
    throw new BusinessError("Station portal login changed. Sign in manually.");
  form.body.set("Login1$UserName", config.username);
  form.body.set("Login1$Password", config.password);
  form.body.set("Login1$LoginButton", "Log In");
  const signedIn = await session.request(new URL(form.action, login.url).href, form.body);
  if (
    new URL(signedIn.url).pathname === "/Login.aspx" ||
    portalElements(parse(signedIn.html), "input").some(
      (n) => portalAttributes(n).type === "password",
    )
  )
    throw new BusinessError(
      "Unable to sign in to the station portal. Check the portal credentials.",
    );
}

export async function portalSearch(
  date: string,
  config: { username: string; password: string; station: string },
  session = new PortalSession(),
  end = date,
) {
  range(date, end);
  if (end > businessDate()) throw new BusinessError("Choose today or an earlier business date.");
  await portalLogin(config, session);
  const report = await session.request(REPORT_PATH);
  const search = portalForm(report.html);
  const required = [
    "txtWaiverDateStart",
    "txtWaiverDateEnd",
    "txtStationId",
    "txtVin",
    "txtCertNumber",
    "txtLicNo",
    "txtWaiverRecordNumber",
  ];
  for (const suffix of required)
    if (!search.body.has(`ctl00$MainContent$${suffix}`))
      throw new BusinessError("Station report filters changed. Use a manual export.");
  const [year, month, day] = date.split("-");
  const [endYear, endMonth, endDay] = end.split("-");
  search.body.set("ctl00$MainContent$txtWaiverDateStart", `${month}/${day}/${year}`);
  search.body.set("ctl00$MainContent$txtWaiverDateEnd", `${endMonth}/${endDay}/${endYear}`);
  search.body.set("ctl00$MainContent$txtStationId", config.station);
  for (const suffix of required.slice(3)) search.body.set(`ctl00$MainContent$${suffix}`, "");
  search.body.set("ctl00$MainContent$btnGetReport", "Search");
  return {
    session,
    page: await session.request(new URL(search.action, report.url).href, search.body),
  };
}

const blankCounts = (): Counts => ({ total: 0, passed: 0, failed: 0, aborted: 0, other: 0 });

export type VirExport = {
  rows: import("./history/rules").RawInspection[];
  sourceTotal: number;
  original?: string;
};

/** Owner-triggered historical collection uses the existing authenticated bulk-export path. */
export async function portalHistoryExport(
  start: string,
  end: string,
  config: { username: string; password: string; station: string },
  session = new PortalSession(),
) {
  try {
    const { parseHistoryExport } = await import("./history/parser");
    const { page } = await portalSearch(start, config, session, end);
    if (portalExplicitEmpty(page.html, start, end, config.station))
      return { rows: [], sourceTotal: 0, original: page.html };
    const sourceTotal = expectedPortalTotal(page.html);
    const form = portalForm(page.html);
    const button = portalElements(form.document, "input")
      .map(portalAttributes)
      .find(
        (a) =>
          a.type === "image" &&
          a.alt === "Export" &&
          /^ctl00\$MainContent\$gvMain\$ctl\d+\$pgrApplus\$btnExport$/.test(a.name ?? ""),
      );
    if (!button)
      throw new BusinessError(
        "No verified VIR export is available. Retry a smaller date window or check station portal access.",
      );
    form.body.set(`${button.name}.x`, "1");
    form.body.set(`${button.name}.y`, "1");
    const exported = await session.request(new URL(form.action, page.url).href, form.body);
    const result = parseHistoryExport(exported.html, config.station);
    if (result.start !== start || result.end !== end || result.rows.length !== sourceTotal)
      throw new BusinessError(
        "Historical VIR export does not match the requested dates and all-page source total. Split the window and retry; no complete coverage was recorded.",
      );
    return { rows: result.rows, sourceTotal, original: exported.html };
  } finally {
    session.dispose();
  }
}

/** Verified read-only provider response observed on a zero-test business date. */
export function portalExplicitEmpty(html: string, start: string, end: string, station: string) {
  const form = portalForm(html);
  const format = (date: string) => {
    const [y, m, d] = date.split("-");
    return `${m}/${d}/${y}`;
  };
  if (
    form.body.get("ctl00$MainContent$txtStationId") !== station ||
    form.body.get("ctl00$MainContent$txtWaiverDateStart") !== format(start) ||
    form.body.get("ctl00$MainContent$txtWaiverDateEnd") !== format(end) ||
    ["txtVin", "txtCertNumber", "txtLicNo", "txtWaiverRecordNumber"].some(
      (field) => form.body.get(`ctl00$MainContent$${field}`) !== "",
    )
  )
    return false;
  const grid = portalElements(form.document, "table").find(
    (n) => portalAttributes(n).id === "MainContent_gvMain",
  );
  if (!grid || portalElements(grid, "tr").length !== 2) return false;
  const cells = portalElements(grid, "td");
  return (
    cells.length === 1 &&
    portalAttributes(cells[0]).colspan === "7" &&
    portalText(cells[0]).replace(/\s+/g, " ").trim() === "No data was found. Clear Search" &&
    !portalElements(form.document, "input").some((n) => portalAttributes(n).alt === "Export")
  );
}

/** Only controlled parser errors may reach the UI; never echo source HTML or row values. */
function parsePortalExport(
  body: string,
  station: string,
  start: string,
  end = start,
  performance = false,
) {
  try {
    return performance
      ? parsePerformanceReport(body, station)
      : { ...parseReport(body, station), incompleteRows: [] };
  } catch (error) {
    const scope = start === end ? start : `${start} to ${end}`;
    const reason =
      error instanceof BusinessError
        ? error.message
        : "The export format or a report date is invalid.";
    throw new BusinessError(`Station export for ${scope} could not be verified. ${reason}`);
  }
}

/** Bounded range export. Cache counts and hashed VIN/record evidence, never full VINs. */
export async function portalRangeDays(
  start: string,
  end: string,
  config: { username: string; password: string; station: string },
  session = new PortalSession(),
  saveHistory?: (report: VirExport) => Promise<void>,
): Promise<PortalDay[]> {
  try {
    const { page } = await portalSearch(start, config, session, end);
    if (portalExplicitEmpty(page.html, start, end, config.station)) {
      await saveHistory?.({ rows: [], sourceTotal: 0, original: page.html });
      return start === end
        ? [
            {
              date: start,
              ...blankCounts(),
              inspectors: [],
              testTimes: [],
              retrievedAt: new Date().toISOString(),
              verifiedEmpty: true,
            },
          ]
        : [];
    }
    const expected = expectedPortalTotal(page.html);
    const form = portalForm(page.html);
    const exportButton = portalElements(form.document, "input")
      .map(portalAttributes)
      .find(
        (a) =>
          a.type === "image" &&
          a.alt === "Export" &&
          /^ctl00\$MainContent\$gvMain\$ctl\d+\$pgrApplus\$btnExport$/.test(a.name ?? ""),
      );
    if (!exportButton) throw new BusinessError("No verified export is available for these dates.");
    form.body.set(`${exportButton.name}.x`, "1");
    form.body.set(`${exportButton.name}.y`, "1");
    const exported = await session.request(new URL(form.action, page.url).href, form.body);
    const report = parsePortalExport(exported.html, config.station, start, end, true);
    if (
      report.start !== start ||
      report.end !== end ||
      report.rows.length + report.incompleteRows.length !== expected
    )
      throw new BusinessError("Station export totals or dates changed. Refresh to try again.");
    if (saveHistory) {
      const { parseHistoryExport } = await import("./history/parser");
      const history = parseHistoryExport(exported.html, config.station);
      await saveHistory({ rows: history.rows, sourceTotal: expected, original: exported.html });
    }
    const days = new Map<string, PortalDay>();
    const retrievedAt = new Date().toISOString();
    const dayFor = (date: string) => {
      let day = days.get(date);
      if (!day) {
        day = {
          date,
          ...blankCounts(),
          inspectors: [],
          testTimes: [],
          retrievedAt,
          verifiedEmpty: false,
        };
        days.set(date, day);
      }
      return day;
    };
    for (const row of report.incompleteRows) {
      const day = dayFor(row.businessDate);
      day.incompleteRows ??= { total: 0, vehicle: 0, inspector: 0, outcome: 0 };
      day.incompleteRows.total++;
      for (const field of ["vehicle", "inspector", "outcome"] as const)
        if (row[field]) day.incompleteRows[field]++;
    }
    for (const row of report.rows) {
      const day = dayFor(row.businessDate);
      let inspector = day.inspectors.find((g) => g.inspector === row.inspector);
      if (!inspector) {
        inspector = { inspector: row.inspector, ...blankCounts() };
        day.inspectors.push(inspector);
      }
      const outcome = row.outcome.toLowerCase();
      const key =
        outcome === "pass"
          ? "passed"
          : outcome === "fail"
            ? "failed"
            : outcome === "abort"
              ? "aborted"
              : "other";
      for (const aggregate of [day, inspector]) {
        aggregate.total++;
        aggregate[key]++;
      }
      day.testTimes!.push({
        inspector: row.inspector,
        minute: reportMinute(row.sourceDate),
        vinHash: row.vehicleHash,
        recordKey: row.fingerprint,
        outcome: key,
      });
    }
    // Missing dates are not invented zeros. Explicit empty-day responses are verified separately.
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  } finally {
    session.dispose();
  }
}

export type PortalDailyTotal = {
  date: string;
  total: number;
  passed: number;
  failed: number;
  aborted: number;
  other: number;
  retrievedAt: string;
};

export function expectedPortalTotal(html: string) {
  const totals = portalElements(parse(html), "span")
    .filter((n) => portalAttributes(n).id === "MainContent_gvMain_pgrApplus")
    .map((n) => {
      const match = /Page\s+(\d+)\s+of\s+(\d+)\s+\(([\d,]+)\s+items\)/i.exec(portalText(n));
      if (!match || Number(match[1]) !== 1 || Number(match[2]) < 1)
        throw new BusinessError("Portal page totals changed or are unavailable. No total shown.");
      return Number(match[3].replaceAll(",", ""));
    });
  if (
    !totals.length ||
    totals.some((n) => !Number.isSafeInteger(n) || n < 1 || n > 10000 || n !== totals[0])
  )
    throw new BusinessError("Portal report total could not be verified. No total shown.");
  return totals[0];
}

/** Count the requested day's original export, not the first paginated screen. */
export async function portalDailyTotal(
  date: string,
  config: { username: string; password: string; station: string },
  session = new PortalSession(),
): Promise<PortalDailyTotal> {
  try {
    const { page } = await portalSearch(date, config, session);
    const expected = expectedPortalTotal(page.html);
    const form = portalForm(page.html);
    const exportButton = portalElements(form.document, "input")
      .map(portalAttributes)
      .find(
        (a) =>
          a.type === "image" &&
          a.alt === "Export" &&
          /^ctl00\$MainContent\$gvMain\$ctl\d+\$pgrApplus\$btnExport$/.test(a.name ?? ""),
      );
    if (!exportButton)
      throw new BusinessError(
        "The portal returned no usable export for this date. A zero count cannot be verified.",
      );
    form.body.set(`${exportButton.name}.x`, "1");
    form.body.set(`${exportButton.name}.y`, "1");
    const exported = await session.request(new URL(form.action, page.url).href, form.body);
    const report = parsePortalExport(exported.html, config.station, date);
    if (report.start !== date || report.end !== date)
      throw new BusinessError(
        "Portal report dates did not match the requested day. No total shown.",
      );
    if (report.rows.length !== expected)
      throw new BusinessError(
        "Export row count differs from the portal total. Data may have changed; try again.",
      );
    const count = (outcome: string) =>
      report.rows.filter((r) => r.outcome.toLowerCase() === outcome).length;
    const passed = count("pass");
    const failed = count("fail");
    const aborted = count("abort");
    return {
      date,
      total: report.rows.length,
      passed,
      failed,
      aborted,
      other: report.rows.length - passed - failed - aborted,
      retrievedAt: new Date().toISOString(),
    };
  } finally {
    session.dispose();
  }
}
