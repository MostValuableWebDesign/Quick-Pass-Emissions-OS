// Runner-owned synthetic portal transport. Not imported by application code.
import { assertOwnedDatabase } from "./e2e-safety.mjs";
assertOwnedDatabase(process.env);
if (
  process.env.E2E_VIR_FIXTURE !== "1" ||
  process.env.GA_DASHBOARD_PASSWORD !== "synthetic-vir-only"
)
  throw new Error("Owned VIR verification required");
const original = globalThis.fetch;
const fields = [
  "txtWaiverDateStart",
  "txtWaiverDateEnd",
  "txtStationId",
  "txtVin",
  "txtCertNumber",
  "txtLicNo",
  "txtWaiverRecordNumber",
];
const form = (body) =>
  `<form action="/Applications/TestHistoryVirReprint.aspx">${fields.map((n) => `<input name="ctl00$MainContent$${n}" value="${body?.get(`ctl00$MainContent$${n}`) || ""}">`).join("")}`;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  if (url.hostname !== "gadashboard.com") return original(input, init);
  const body = new URLSearchParams(init?.body?.toString());
  if (url.pathname === "/Login.aspx") {
    if (init?.method === "POST")
      return new Response(null, {
        status: 303,
        headers: { location: "/Default.aspx", "set-cookie": "fixture=owned; Secure; HttpOnly" },
      });
    return new Response(
      '<form action="/Login.aspx"><input name="Login1$UserName"><input type="password" name="Login1$Password"></form>',
    );
  }
  if (url.pathname === "/Default.aspx") return new Response("<form></form>");
  if (url.pathname !== "/Applications/TestHistoryVirReprint.aspx")
    throw new Error("Unsupported fixture portal request");
  if (
    !body.has("ctl00$MainContent$btnGetReport") &&
    ![...body.keys()].some((k) => k.endsWith("btnExport.x"))
  )
    return new Response(`${form()}</form>`);
  if (![...body.keys()].some((k) => k.endsWith("btnExport.x")))
    return new Response(
      `${form(body)}<input type="image" alt="Export" name="ctl00$MainContent$gvMain$ctl01$pgrApplus$btnExport"><span id="MainContent_gvMain_pgrApplus">Page 1 of 3 (26 items)</span></form>`,
    );
  const start = body.get("ctl00$MainContent$txtWaiverDateStart"),
    end = body.get("ctl00$MainContent$txtWaiverDateEnd"),
    station = body.get("ctl00$MainContent$txtStationId");
  const headers = [
    "VIN",
    "License Plate",
    "Test Date",
    "Issued By",
    "Cert Number",
    "Result",
    "Print",
    "Inspection ID",
    "Payment Status",
    "Retest Status",
  ];
  return new Response(
    `<table><tr><td>Station ID</td><td>${station}</td></tr><tr><td>Waiver Date</td><td>${start} - ${end}</td></tr></table><table id="MainContent_gvMain"><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>${Array.from({ length: 26 }, (_, i) => `<tr>${[i === 25 ? "UNCERTAIN" : "1HGCM82633A004352", "AAA123", `${start} 10:${String(i).padStart(2, "0")} AM`, "Fixture Inspector", `cert-${i}`, "Pass", "", `fixture-${start}-${i}`, "PAID", "INITIAL"].map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</table>`,
  );
};
