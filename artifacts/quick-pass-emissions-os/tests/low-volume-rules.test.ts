import { describe, expect, it } from "vitest";
import {
  lowVolumeCount,
  lowVolumeMessage,
  lowVolumeWindow,
} from "@/modules/automation/low-volume-rules";
import type { DashboardData } from "@/modules/station/dashboard-types";

const business = { configured: true, operatingDays: [1, 2, 3, 4, 5, 6] };
const now = new Date("2026-11-18T19:01:00Z");
function report(paid: number) {
  return {
    query: { start: "2026-11-18", end: "2026-11-18", trendDays: "custom" },
    current: { date: "2026-11-18", retrievedAt: now.toISOString() },
    summary: { cars: paid, revenueCents: paid * 2000, coveredDays: 1 },
    missingDates: [],
    staleDates: [],
    retestMissingDates: [],
    knownIncompleteDates: [],
  } as unknown as DashboardData;
}
describe("2 PM low-volume staffing check", () => {
  it("follows Eastern daylight saving time", () => {
    expect(lowVolumeWindow(new Date("2026-06-17T18:00:00Z"), business, false).eligible).toBe(true);
    expect(lowVolumeWindow(new Date("2026-11-18T19:00:00Z"), business, false).eligible).toBe(true);
    expect(lowVolumeWindow(new Date("2026-11-18T18:59:59Z"), business, false).eligible).toBe(false);
    expect(lowVolumeWindow(new Date("2026-11-18T19:15:00Z"), business, false).eligible).toBe(false);
  });
  it("respects operating days, explicit closures and unconfigured settings", () => {
    expect(lowVolumeWindow(now, business, true).eligible).toBe(false);
    expect(lowVolumeWindow(now, null, false).eligible).toBe(false);
    expect(lowVolumeWindow(now, { ...business, configured: false }, false).eligible).toBe(false);
    expect(lowVolumeWindow(new Date("2026-11-22T19:00:00Z"), business, false).eligible).toBe(false);
  });
  it.each([0, 49, 50, 51])("uses the paid-test revenue basis for %i tests", (count) => {
    const data = report(count);
    data.summary.cars = count + 3; // Do not use raw inspections, including aborts.
    expect(lowVolumeCount(data, now)).toBe(count);
  });
  it("rejects missing, partial, stale, future and pre-2 PM data", () => {
    const missing = report(0);
    missing.missingDates = ["2026-11-18"];
    expect(lowVolumeCount(missing, now)).toBeNull();
    const partial = report(20);
    partial.knownIncompleteDates = ["2026-11-18"];
    expect(lowVolumeCount(partial, now)).toBeNull();
    const retests = report(20);
    retests.retestMissingDates = ["2026-11-01"];
    expect(lowVolumeCount(retests, now)).toBeNull();
    for (const time of ["2026-11-18T18:59:00Z", "2026-11-18T19:02:00Z", "invalid"]) {
      const data = report(0);
      data.current!.retrievedAt = time;
      expect(lowVolumeCount(data, now)).toBeNull();
    }
    expect(lowVolumeCount(report(0), new Date("2026-11-18T19:07:00Z"))).toBeNull();
  });
  it("provides a recommendation with the actual check time", () => {
    expect(lowVolumeMessage(50, now)).toContain("50 paid tests through 2:00 PM");
    expect(lowVolumeMessage(50, now)).toContain("checked 2:01 PM");
    expect(lowVolumeMessage(50, now)).toContain("Consider sending Clinton home");
  });
});
