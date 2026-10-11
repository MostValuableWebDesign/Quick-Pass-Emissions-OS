import { describe, expect, it, vi } from "vitest";
import {
  certificateChoice,
  fetchCertificateBalance,
  parseUnusedCertificates,
  UNUSED_CERTIFICATES_PATH,
} from "../src/modules/certificates/portal-source";
import {
  certificatesLow,
  CERTIFICATE_STATION,
  CERTIFICATE_ANALYZER,
} from "../src/modules/certificates/portal-types";
import { certificateThresholdSchema } from "../src/modules/certificates/portal";
import type { PortalSession } from "../src/modules/station/portal-client";
const form = (analyzer = false, selected = false) => `<form action="/Purchasing/Purchasing.aspx">
  <input name="__VIEWSTATE" value="synthetic-state"><input name="__EVENTVALIDATION" value="synthetic-validation">
  <input name="creditCard" value="must-not-post"><input name="ctl00$MainContent$btnAddToOrder" value="must-not-post">
  <select id="ddlStations" name="ctl00$MainContent$ddlStations">
    <option value="">Select</option><option value="102539,50" ${selected ? "selected" : ""}>${CERTIFICATE_STATION}</option>
  </select>
  <select id="ddlAnalyzers" name="ctl00$MainContent$ddlAnalyzers">
    <option value="">Select</option>${analyzer ? `<option value="111411">${CERTIFICATE_ANALYZER}</option>` : ""}
  </select></form>`;

describe("certificate portal read-only access", () => {
  it("validates exact station/analyzer choices and rejects ambiguous or missing choices", () => {
    expect(certificateChoice(form(), "ddlStations", CERTIFICATE_STATION).value).toBe("102539,50");
    expect(() => certificateChoice(form(), "ddlAnalyzers", CERTIFICATE_ANALYZER)).toThrow();
    expect(() =>
      certificateChoice(
        form().replace(CERTIFICATE_STATION, "Other station"),
        "ddlStations",
        CERTIFICATE_STATION,
      ),
    ).toThrow();
    expect(() =>
      certificateChoice(
        form().replace("</select>", `<option value="123">${CERTIFICATE_STATION}</option></select>`),
        "ddlStations",
        CERTIFICATE_STATION,
      ),
    ).toThrow();
  });
  it.each([0, 29, 30, 167])("accepts a verified unused-certificate balance of %i", (n) => {
    expect(parseUnusedCertificates(JSON.stringify({ d: String(n) }))).toBe(n);
  });
  it.each([
    '{"d":null}',
    '{"d":-1}',
    '{"d":"1.5"}',
    '{"d":"167 certificates"}',
    '{"d":true}',
    '{"d":2000000001}',
    "<html>Login</html>",
  ])("rejects invalid or unverified balance %s", (body) => {
    expect(() => parseUnusedCertificates(body)).toThrow();
  });
  it("posts only station-selection state, verifies its echo, then calls the read-only analyzer count", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        html: '<form action="/Login.aspx"><input name="Login1$UserName"><input name="Login1$Password"></form>',
        url: "https://gadashboard.com/Login.aspx",
      })
      .mockResolvedValueOnce({ html: "<form></form>", url: "https://gadashboard.com/Default.aspx" })
      .mockResolvedValueOnce({
        html: form(),
        url: "https://gadashboard.com/Purchasing/Purchasing.aspx",
      })
      .mockResolvedValueOnce({
        html: form(true, true),
        url: "https://gadashboard.com/Purchasing/Purchasing.aspx",
      })
      .mockResolvedValueOnce({
        html: '{"d":"167"}',
        url: "https://gadashboard.com" + UNUSED_CERTIFICATES_PATH,
      });
    const dispose = vi.fn();
    const result = await fetchCertificateBalance({ username: "synthetic", password: "synthetic" }, {
      request,
      dispose,
    } as unknown as PortalSession);
    expect(result).toBe(167);
    const body = request.mock.calls[3][1] as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({
      __VIEWSTATE: "synthetic-state",
      __EVENTVALIDATION: "synthetic-validation",
      ctl00$MainContent$ddlStations: "102539,50",
      __EVENTTARGET: "ctl00$MainContent$ddlStations",
      __EVENTARGUMENT: "",
    });
    expect(request.mock.calls[4]).toEqual([UNUSED_CERTIFICATES_PATH, '{"analyzer":"111411"}']);
    expect(dispose).toHaveBeenCalledOnce();
  });
  it("alerts strictly below the configurable threshold, never for an unknown balance", () => {
    expect(certificatesLow(29, 30)).toBe(true);
    expect(certificatesLow(30, 30)).toBe(false);
    expect(certificatesLow(null, 30)).toBe(false);
    expect(certificatesLow(0, 0)).toBe(false);
    expect(certificatesLow(39, 40)).toBe(true);
    expect(certificateThresholdSchema.parse("40")).toBe(40);
    expect(certificateThresholdSchema.safeParse("1.5").success).toBe(false);
    expect(certificateThresholdSchema.safeParse("-1").success).toBe(false);
  });
});
