import { describe, expect, it, vi } from "vitest";
import {
  PortalSession,
  expectedPortalTotal,
  portalDailyTotal,
  portalSearch,
} from "../src/modules/station/portal-client";

const day = "2026-01-15";
const config = {
  username: "fixture-user",
  password: "fixture-only-password",
  station: "SYNTHETIC",
};
const fields = [
  "txtWaiverDateStart",
  "txtWaiverDateEnd",
  "txtStationId",
  "txtVin",
  "txtCertNumber",
  "txtLicNo",
  "txtWaiverRecordNumber",
];
const controls = fields.map((n) => `<input name="ctl00$MainContent$${n}" value="">`).join("");
const login = `<form action="./Login.aspx"><input name="__VIEWSTATE" type="hidden" value="+opaque/">
  <input name="Login1$UserName"><input type="password" name="Login1$Password"></form>`;
function screen(total = 3) {
  return `<form action="./TestHistoryVirReprint.aspx">${controls}
    <input name="__VIEWSTATE" type="hidden" value="+opaque/">
    <input type="image" alt="Export" name="ctl00$MainContent$gvMain$ctl01$pgrApplus$btnExport">
    <span id="MainContent_gvMain_pgrApplus">Page 1 of 2 (${total} items)</span></form>`;
}
function report(count = 3, station = "SYNTHETIC", date = "01/15/2026") {
  const results = ["Pass", "Fail", "Abort"];
  return `<table><tr><td>Station ID</td><td>${station}</td></tr>
    <tr><td>Waiver Date</td><td>${date} - ${date}</td></tr></table>
    <table id="MainContent_gvMain"><tr>${[
      "VIN",
      "License Plate",
      "Test Date",
      "Issued By",
      "Cert Number",
      "Result",
    ]
      .map((v) => `<th>${v}</th>`)
      .join("")}<th>Print</th></tr>
    ${Array.from(
      { length: count },
      (_, i) => `<tr><td>1HGCM82633A${String(i).padStart(6, "0")}</td>
      <td>FIXTURE</td><td>${date} 09:01 AM</td><td>Fixture inspector</td>
      <td>FIXTURE${i}</td><td>${results[i % 3]}</td><td>Print</td></tr>`,
    ).join("")}</table>`;
}
function fixture(exported = report(), total = 3) {
  const responses = [
    new Response(login),
    new Response(null, {
      status: 303,
      headers: { location: "/", "set-cookie": "session=private-fixture; Secure; HttpOnly" },
    }),
    new Response("<form></form>"),
    new Response(`<form action="./TestHistoryVirReprint.aspx">${controls}</form>`),
    new Response(screen(total)),
    new Response(exported, { headers: { "content-type": "application/ms-excel" } }),
  ];
  const transport = vi.fn(async () => responses.shift()!);
  return { transport, session: new PortalSession(transport as unknown as typeof fetch) };
}

describe("read-only station portal export totals", () => {
  it("counts the complete export, scoped to the configured station and one date", async () => {
    const { transport, session } = fixture();
    const total = await portalDailyTotal(day, config, session);
    expect(total).toMatchObject({
      date: day,
      total: 3,
      passed: 1,
      failed: 1,
      aborted: 1,
      other: 0,
    });
    expect(transport).toHaveBeenCalledTimes(6);
    const calls = transport.mock.calls as unknown as [URL, RequestInit][];
    const search = new URLSearchParams(String(calls[4][1].body));
    expect(search.get("ctl00$MainContent$txtStationId")).toBe("SYNTHETIC");
    expect(search.get("ctl00$MainContent$txtWaiverDateStart")).toBe("01/15/2026");
    expect(search.get("ctl00$MainContent$txtWaiverDateEnd")).toBe("01/15/2026");
    for (const name of fields.slice(3)) expect(search.get(`ctl00$MainContent$${name}`)).toBe("");
    const exported = new URLSearchParams(String(calls[5][1].body));
    expect(exported.get("ctl00$MainContent$gvMain$ctl01$pgrApplus$btnExport.x")).toBe("1");
    expect(exported.get("__VIEWSTATE")).toBe("+opaque/");
    expect(exported.has("ctl00$MainContent$btnGetReport")).toBe(false);
    expect(JSON.stringify(total)).not.toMatch(/fixture-user|password|inspector|1HGCM|session/);
    expect(calls.every(([url]) => url.origin === "https://gadashboard.com")).toBe(true);
  });

  it.each([
    ["a partial-page export", report(1), 3],
    ["a different station", report(3, "OTHER"), 3],
    ["a different day", report(3, "SYNTHETIC", "01/16/2026"), 3],
    ["an empty export", report(0), 3],
  ])("rejects %s instead of presenting a misleading daily total", async (_, body, count) => {
    const { session } = fixture(body, count);
    await expect(portalDailyTotal(day, config, session)).rejects.toThrow();
  });

  it("requires the provider's pagination total, not a guessed row count", () => {
    expect(expectedPortalTotal(screen(94))).toBe(94);
    expect(() => expectedPortalTotal("<form></form>")).toThrow();
    expect(() => expectedPortalTotal(screen(0))).toThrow();
    expect(() => expectedPortalTotal(screen(3) + screen(4))).toThrow();
  });

  it("never follows a redirect to another host or a purchasing route", async () => {
    for (const location of ["https://unrelated.example/collect", "/Purchasing/Purchasing.aspx"]) {
      const transport = vi.fn(
        async () => new Response(null, { status: 303, headers: { location } }),
      );
      const session = new PortalSession(transport as unknown as typeof fetch);
      await expect(session.request("/Login.aspx")).rejects.toThrow("unsupported location");
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });

  it("stops at challenges and oversized responses without retries", async () => {
    for (const body of ["<form>CAPTCHA required</form>", "x".repeat(2_000_001)]) {
      const transport = vi.fn(async () => new Response(body));
      const session = new PortalSession(transport as unknown as typeof fetch);
      await expect(session.request("/Login.aspx")).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects missing credentials or an invalid date before external requests", async () => {
    const { session, transport } = fixture();
    await expect(portalSearch("not-a-date", config, session)).rejects.toThrow();
    await expect(portalSearch(day, { ...config, password: "" }, session)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});
