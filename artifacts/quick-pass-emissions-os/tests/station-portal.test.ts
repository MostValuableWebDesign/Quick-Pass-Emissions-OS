import { describe, expect, it, vi } from "vitest";
import {
  PortalSession,
  expectedPortalTotal,
  portalDailyTotal,
  portalRangeDays,
  portalSearch,
  portalHistoryExport,
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
  it("retrieves the full VIR export across pagination and retains the original structured source", async () => {
    const source = report(26);
    const { session, transport } = fixture(source, 26);
    const result = await portalHistoryExport(day, day, config, session);
    expect(result.sourceTotal).toBe(26);
    expect(result.rows).toHaveLength(26);
    expect(result.original).toBe(source);
    expect(transport).toHaveBeenCalledTimes(6);
    expect(result.rows[25].fields["Cert Number"]).toBe("FIXTURE25");
  });
  it("never accepts first-page or truncated VIR history as the all-page export", async () => {
    await expect(
      portalHistoryExport(day, day, config, fixture(report(3), 26).session),
    ).rejects.toThrow(/all-page source total/);
  });
  it("normal refresh captures every original VIR row, including incomplete Performance identities", async () => {
    const source = report().replace("1HGCM82633A000000", "UNREADABLE");
    const save = vi.fn(async () => {});
    const days = await portalRangeDays(day, day, config, fixture(source).session, save);
    expect(days[0].total).toBe(2);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceTotal: 3,
        original: source,
        rows: expect.arrayContaining([
          expect.objectContaining({ fields: expect.objectContaining({ VIN: "UNREADABLE" }) }),
        ]),
      }),
    );
  });

  it("accepts a verified single-date Performance export", async () => {
    const { session } = fixture();
    const days = await portalRangeDays(day, day, config, session);
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ date: day, total: 3, passed: 1, failed: 1, aborted: 1 });
  });

  it.each([
    ["station metadata", report(3, "OTHER"), "Report station does not match"],
    ["column layout", report().replace("Issued By", "Inspector ID"), "Report columns changed"],
  ])("explains a single-day %s failure without blaming the range", async (_, body, reason) => {
    for (const pull of [
      (session: PortalSession) => portalRangeDays(day, day, config, session),
      (session: PortalSession) => portalDailyTotal(day, config, session),
    ]) {
      const { session, transport } = fixture(body);
      const error = await pull(session).catch((cause: Error) => cause);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(`Station export for ${day}`);
      expect((error as Error).message).toContain(reason);
      expect((error as Error).message).not.toMatch(
        /smaller date range|fixture-user|fixture-only-password|1HGCM|OTHER|<table|private-fixture/,
      );
      expect(transport).toHaveBeenCalledTimes(6);
    }
  });

  it.each([
    ["a short VIN", report().replace("1HGCM82633A000000", "1HGCM82633A00000"), "vehicle"],
    ["a missing VIN", report().replace("1HGCM82633A000000", ""), "vehicle"],
    ["a missing inspector", report().replace("Fixture inspector", ""), "inspector"],
    ["a missing outcome", report().replace(">Pass<", "><"), "outcome"],
  ])(
    "loads partial Performance evidence for %s without inventing paid records",
    async (_, body, issue) => {
      const days = await portalRangeDays(day, day, config, fixture(body).session);
      expect(days).toHaveLength(1);
      expect(days[0].total).toBe(2);
      expect(days[0].testTimes).toHaveLength(2);
      expect(days[0].incompleteRows).toEqual({
        total: 1,
        vehicle: issue === "vehicle" ? 1 : 0,
        inspector: issue === "inspector" ? 1 : 0,
        outcome: issue === "outcome" ? 1 : 0,
      });
      expect(days[0].total + days[0].incompleteRows!.total).toBe(3);
      expect(JSON.stringify(days)).not.toContain("1HGCM");
      await expect(portalDailyTotal(day, config, fixture(body).session)).rejects.toThrow(
        "Missing vehicle, inspector or outcome evidence",
      );
    },
  );

  it("still rejects a partial report if its complete-plus-incomplete row total does not match the pager", async () => {
    const { session } = fixture(report().replace("1HGCM82633A000000", ""), 4);
    await expect(portalRangeDays(day, day, config, session)).rejects.toThrow(
      "Station export totals or dates changed",
    );
  });

  it("includes the actual background range when a supporting history export fails", async () => {
    const { session } = fixture(report(3, "OTHER"));
    await expect(portalRangeDays(day, "2026-01-16", config, session)).rejects.toThrow(
      "Station export for 2026-01-15 to 2026-01-16 could not be verified. Report station does not match the configured station.",
    );
  });

  it("keeps unexpected parser details private", async () => {
    const body = report().replaceAll("01/15/2026 09:01 AM", "01/32/2026 09:01 AM");
    const { session } = fixture(body);
    await expect(portalRangeDays(day, day, config, session)).rejects.toThrow(
      `Station export for ${day} could not be verified. The export format or a report date is invalid.`,
    );
  });

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
  it("does not begin another request after the shared operation deadline", async () => {
    const controller = new AbortController();
    controller.abort();
    const transport = vi.fn();
    const session = new PortalSession(transport as typeof fetch, false, false, controller.signal);
    await expect(session.request("/Login.aspx")).rejects.toThrow("timed out");
    expect(transport).not.toHaveBeenCalled();
  });
  it("propagates operation cancellation to a pending fetch without retrying", async () => {
    const controller = new AbortController();
    const transport = vi.fn(
      (_url: unknown, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal!.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );
    const session = new PortalSession(transport as typeof fetch, false, false, controller.signal);
    const pending = session.request("/Login.aspx");
    const rejection = expect(pending).rejects.toThrow("timed out");
    controller.abort();
    await rejection;
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("cancels an unfinished response body at the operation deadline", async () => {
    const controller = new AbortController();
    let opened!: () => void;
    const ready = new Promise<void>((resolve) => {
      opened = resolve;
    });
    const cancel = vi.fn();
    const transport = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            pull() {
              opened();
            },
            cancel,
          }),
        ),
    );
    const session = new PortalSession(transport as typeof fetch, false, false, controller.signal);
    const pending = session.request("/Login.aspx");
    const rejection = expect(pending).rejects.toThrow("read completely");
    await ready;
    controller.abort();
    await rejection;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
