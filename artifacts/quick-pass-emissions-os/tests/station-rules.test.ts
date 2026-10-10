import { describe, expect, it } from "vitest";
import { parseReport, sourceDate, range } from "../src/modules/station/report";
import {
  weekBounds,
  operatingMinutes,
  elapsedMinutes,
  estimateTests,
} from "../src/modules/station/projections";
import { reportFixture, fixtureStation } from "./station-fixtures";
describe("Verified station-report format and conservative dates", () => {
  it("reads observed original metadata and minimizes vehicle fields", () => {
    const parsed = parseReport(reportFixture("2026-10-09"), fixtureStation);
    expect(parsed.start).toBe("2026-10-09");
    expect(parsed.rows[0]).toMatchObject({
      inspector: "Fixture Inspector",
      vehicleSuffix: "0001",
      sourceDate: "10/09/2026 09:00 AM",
    });
    expect(JSON.stringify(parsed)).not.toContain("1SYNTHETIC0000001");
    expect(JSON.stringify(parsed)).not.toContain('SYN000"');
    expect(parsed.rows[0]).not.toHaveProperty("timestamp");
  });
  it("rejects station mismatch, changed headers and fabricated empty output", () => {
    expect(() =>
      parseReport(reportFixture("2026-10-09", undefined, "OTHER"), fixtureStation),
    ).toThrow(/station/);
    expect(() =>
      parseReport(reportFixture("2026-10-09").replace("Issued By", "Inspector ID"), fixtureStation),
    ).toThrow(/columns/);
    expect(() => parseReport(reportFixture("2026-10-09", []), fixtureStation)).toThrow(/No usable/);
    expect(() => parseReport("binary\u0000spreadsheet", fixtureStation)).toThrow();
  });
  it("does not collapse indistinguishable tests or accept incomplete rows", () => {
    const body = reportFixture("2026-10-09");
    const row = body.match(/<tr><td>1SYNTHETIC.*?<\/tr>/)![0];
    expect(() =>
      parseReport(body.replace("</table></body>", `${row}</table></body>`), fixtureStation),
    ).toThrow(/Indistinguishable/);
    expect(() => parseReport(body.replace("1SYNTHETIC0000001", ""), fixtureStation)).toThrow(
      /Missing/,
    );
    expect(() => parseReport("x".repeat(2000001), fixtureStation)).toThrow(/2 MB/);
  });
  it("validates inclusive leap/DST ranges without inventing a portal timezone instant", () => {
    expect(range("2024-02-29", "2024-03-10")).toEqual({ start: "2024-02-29", end: "2024-03-10" });
    expect(() => range("2026-01-02", "2026-01-01")).toThrow();
    expect(() => sourceDate("02/30/2026 09:00 AM")).toThrow();
    expect(sourceDate("11/01/2026 01:30 AM")).toBe("2026-11-01");
    expect(() => sourceDate("10/09/2026 00:00 AM")).toThrow();
  });
});
describe("Confirmed operating history and justified projections", () => {
  const hours = [{ weekday: 7, open: "00:00", close: "23:59" }];
  it("uses the selected week start across month/year boundaries", () => {
    expect(weekBounds("2026-01-01", 7)).toEqual({ start: "2025-12-28", end: "2026-01-03" });
    expect(weekBounds("2026-10-10", 6)).toEqual({ start: "2026-10-10", end: "2026-10-16" });
  });
  it("uses actual Eastern DST operating minutes and closures", () => {
    expect(operatingMinutes("2026-03-08", hours, [])).toBe(1379);
    expect(operatingMinutes("2026-11-01", hours, [])).toBe(1499);
    expect(operatingMinutes("2026-11-01", hours, ["2026-11-01"])).toBe(0);
    expect(elapsedMinutes("2026-11-01", hours, [], new Date("2026-11-02T05:00:00Z"))).toMatchObject(
      { elapsed: 1499, remaining: 0 },
    );
  });
  it("adds only remaining work and refuses missing/current incomplete history", () => {
    const data = {
      historicalTests: 100,
      historicalMinutes: 600,
      usableDays: 5,
      minimumDays: 5,
      performed: 10,
      remainingMinutes: 120,
      currentCoverage: true,
      pending: 0,
    };
    expect(estimateTests(data)).toMatchObject({ projected: 30, additional: 20 });
    for (const bad of [
      { currentCoverage: false },
      { pending: 1 },
      { usableDays: 4 },
      { historicalTests: 0 },
      { historicalMinutes: 0 },
    ])
      expect(estimateTests({ ...data, ...bad }).status).toBe("Insufficient data");
  });
});
