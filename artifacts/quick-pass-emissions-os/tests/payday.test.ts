import { describe, it, expect } from "vitest";
import { paydayCalendar } from "../src/modules/payroll/payday-rules";
describe("Monday payroll calendar", () => {
  it.each([
    ["2026-10-17T16:00:00Z", "yellow", 2, "2026-10-19"],
    ["2026-10-18T16:00:00Z", "orange", 1, "2026-10-19"],
    ["2026-10-19T16:00:00Z", "red", 0, "2026-10-19"],
    ["2026-12-26T16:00:00Z", "yellow", 2, "2026-12-28"],
    ["2027-01-02T16:00:00Z", "yellow", 2, "2027-01-04"],
  ])("maps %s to the correct payday", (instant, tone, daysAway, payDate) =>
    expect(paydayCalendar(new Date(instant)).alert).toMatchObject({ tone, daysAway, payDate }),
  );
  it.each([
    "2026-10-13T16:00:00Z",
    "2026-10-14T16:00:00Z",
    "2026-10-15T16:00:00Z",
    "2026-10-16T16:00:00Z",
  ])("has no alert outside the three-day window: %s", (instant) =>
    expect(paydayCalendar(new Date(instant)).alert).toBeNull(),
  );
  it("changes at Eastern midnight, not UTC midnight", () => {
    expect(paydayCalendar(new Date("2026-10-17T03:59:59Z")).alert).toBeNull();
    expect(paydayCalendar(new Date("2026-10-17T04:00:00Z")).alert?.tone).toBe("yellow");
    expect(paydayCalendar(new Date("2026-10-20T03:59:59Z")).alert?.tone).toBe("red");
    expect(paydayCalendar(new Date("2026-10-20T04:00:00Z")).alert).toBeNull();
  });
  it("uses calendar days across spring and fall DST", () => {
    const spring = paydayCalendar(new Date("2026-03-08T05:00:00Z"));
    expect(spring.alert).toMatchObject({ tone: "orange", payDate: "2026-03-09" });
    expect(spring.nextRefreshAt).toBe("2026-03-09T04:00:00.000Z");
    const fall = paydayCalendar(new Date("2026-11-01T04:00:00Z"));
    expect(fall.alert).toMatchObject({ tone: "orange", payDate: "2026-11-02" });
    expect(fall.nextRefreshAt).toBe("2026-11-02T05:00:00.000Z");
  });
});
