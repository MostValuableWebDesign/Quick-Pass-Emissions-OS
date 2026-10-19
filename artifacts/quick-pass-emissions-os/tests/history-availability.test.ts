import { describe, expect, it } from "vitest";
import { stationHistoryAvailability } from "../src/modules/station/history-availability";

const start = "2019-01-01";
const end = "2019-01-31";
function page(date = "1/2/2019", total = "15,000", station = "SYNTHETIC") {
  const fields = {
    txtStationId: station,
    txtWaiverDateStart: "01/01/2019",
    txtWaiverDateEnd: "01/31/2019",
    txtVin: "",
    txtCertNumber: "",
    txtLicNo: "",
    txtWaiverRecordNumber: "",
  };
  return `<form action="/Applications/TestHistoryVirReprint.aspx">${Object.entries(fields)
    .map(([name, value]) => `<input name="ctl00$MainContent$${name}" value="${value}">`)
    .join(
      "",
    )}<span id="MainContent_gvMain_pgrApplus">Page 1 of 300 (${total} items)</span><table id="MainContent_gvMain"><tr><th>VIN</th><th>License Plate</th><th>Test Date</th><th>Issued By</th></tr><tr><td>SYNTHETICVIN</td><td>PLATE123</td><td>${date}</td><td>SYNTHETIC INSPECTOR</td></tr></table></form>`;
}

describe("Read-only station history availability", () => {
  it("verifies dates per cell even when adjoining plates and names have no text separators", () => {
    expect(stationHistoryAvailability(page(), "SYNTHETIC", start, end)).toEqual({
      traffic: true,
      sourceItems: 15000,
    });
  });
  it("supports padded display dates and times", () => {
    expect(
      stationHistoryAvailability(page("01/02/2019 09:30 AM"), "SYNTHETIC", start, end).traffic,
    ).toBe(true);
  });
  it("rejects a different station or stale filter echo", () => {
    expect(() => stationHistoryAvailability(page(), "OTHER", start, end)).toThrow("did not echo");
    expect(() => stationHistoryAvailability(page(), "SYNTHETIC", "2019-01-02", end)).toThrow(
      "did not echo",
    );
  });
  it("rejects visible dates outside the requested window", () => {
    expect(() => stationHistoryAvailability(page("12/31/2018"), "SYNTHETIC", start, end)).toThrow(
      "traffic dates",
    );
  });
  it("does not infer traffic from a pager without a verified date", () => {
    expect(() => stationHistoryAvailability(page("Pending"), "SYNTHETIC", start, end)).toThrow(
      "traffic dates",
    );
    expect(() => stationHistoryAvailability(page("02/30/2019"), "SYNTHETIC", start, end)).toThrow(
      "traffic dates",
    );
  });
  it("rejects malformed or zero-result pagers rather than assuming empty history", () => {
    expect(() =>
      stationHistoryAvailability(page("01/02/2019", "0"), "SYNTHETIC", start, end),
    ).toThrow("could not be verified");
    expect(() =>
      stationHistoryAvailability(page("01/02/2019", "unknown"), "SYNTHETIC", start, end),
    ).toThrow("could not be verified");
  });
});
