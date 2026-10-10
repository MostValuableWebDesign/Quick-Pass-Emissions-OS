export const fixtureStation = "SYNTHETIC";
export function usDate(date: string) {
  const [y, m, d] = date.split("-");
  return `${m}/${d}/${y}`;
}
export function reportFixture(
  date: string,
  rows = [
    {
      vin: "1SYNTHETIC0000001",
      inspector: "Fixture Inspector",
      certificate: "SYN00001",
      result: "Pass",
      time: "09:00 AM",
    },
  ],
  station = fixtureStation,
  end = date,
) {
  const escape = (s: string) =>
    s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<html><body><table><tr><td>Waiver Date</td><td>${usDate(date)} - ${usDate(end)}</td></tr><tr><td>Station ID</td><td>${station}</td></tr></table><table id="MainContent_gvMain"><tr>${["VIN", "License Plate", "Test Date", "Issued By", "Cert Number", "Result", ""].map((h) => `<th>${h}</th>`).join("")}</tr>${rows.map((r) => `<tr>${[r.vin, "SYN000", `${usDate(date)} ${r.time}`, r.inspector, r.certificate, r.result, "Reprint VIR"].map((v) => `<td>${escape(v)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
}
