import { describe, expect, it } from "vitest";
import { dueInstant } from "../src/lib/time";
import {
  depletion,
  periodFor,
  reminderStage,
  retryAt,
  scheduleOccurs,
  scheduleInput,
  policyInput,
  forecastInput,
} from "../src/modules/automation/rules";
import { csv } from "../src/modules/finance/rules";
describe("Phase 5 calendar, estimates and configuration", () => {
  it("uses compatible Eastern gap and overlap resolution exactly once", () => {
    expect(dueInstant("2026-03-08", "02:30").toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(dueInstant("2026-11-01", "01:30").toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(
      scheduleOccurs(
        { frequency: "DAILY", weekday: null, time: "01:30", openDaysOnly: false },
        "2026-11-01",
        new Date("2026-11-01T06:30Z"),
        [],
        new Set(),
      ),
    ).toBe(true);
  });
  it("reports prior local dates across DST, leap and weekly boundaries", () => {
    expect(periodFor("2026-03-09", "DAILY")).toEqual({ start: "2026-03-08", end: "2026-03-08" });
    expect(
      dueInstant("2026-03-09", "00:00").getTime() - dueInstant("2026-03-08", "00:00").getTime(),
    ).toBe(23 * 3600000);
    expect(
      dueInstant("2026-11-02", "00:00").getTime() - dueInstant("2026-11-01", "00:00").getTime(),
    ).toBe(25 * 3600000);
    expect(periodFor("2024-03-01", "WEEKLY")).toEqual({ start: "2024-02-23", end: "2024-02-29" });
  });
  it("does not move closed summary dates and supports explicit all-day financial schedules", () => {
    const s = { frequency: "WEEKLY", weekday: 6, time: "08:00", openDaysOnly: true };
    const now = new Date("2026-10-10T13:00Z");
    expect(scheduleOccurs(s, "2026-10-10", now, [6], new Set(["2026-10-10"]))).toBe(false);
    expect(
      scheduleOccurs({ ...s, openDaysOnly: false }, "2026-10-10", now, [], new Set(["2026-10-10"])),
    ).toBe(true);
    expect(scheduleOccurs({ ...s, weekday: 5 }, "2026-10-10", now, [6], new Set())).toBe(false);
  });
  it("distinguishes advance, overdue and escalation with configured calendar-day timing", () => {
    expect(reminderStage("2026-10-12", "2026-10-10", 2, 3)).toBe("ADVANCE");
    expect(reminderStage("2026-10-13", "2026-10-10", 2, 3)).toBeNull();
    expect(reminderStage("2026-10-09", "2026-10-10", 2, 3)).toBe("OVERDUE");
    expect(reminderStage("2026-10-06", "2026-10-10", 2, 3)).toBe("ESCALATED");
  });
  const base = {
    today: "2026-10-10",
    openingDate: "2026-10-01",
    balance: 100,
    windowDays: 30,
    minimumDays: 7,
    used: 50,
    leadDays: 3,
    threshold: 10,
  };
  it("states unknown, insufficient, zero usage and genuine depletion honestly", () => {
    expect(depletion({ ...base, openingDate: null, balance: null }).state).toBe("UNKNOWN_STOCK");
    expect(depletion({ ...base, openingDate: "2026-10-09" }).state).toBe("INSUFFICIENT_HISTORY");
    expect(depletion({ ...base, used: 0 }).depletionDate).toBeNull();
    expect(depletion({ ...base, used: 0 }).state).toBe("ZERO_USAGE");
    expect(depletion(base)).toMatchObject({
      coverageDays: 10,
      averageDailyUsage: 5,
      depletionDate: "2026-10-30",
      threshold: 15,
      state: "ESTIMATE",
    });
  });
  it("uses bounded exponential retry times and rejects missing business numbers", () => {
    expect(retryAt(new Date(0), 4).getTime()).toBe(480000);
    expect(scheduleInput.safeParse({}).success).toBe(false);
    expect(
      policyInput.safeParse({
        kind: "DEALER",
        advanceDays: "",
        escalationDays: 0,
        active: true,
        recipients: [],
        escalationRecipients: [],
        revision: 0,
      }).success,
    ).toBe(false);
    expect(
      forecastInput.safeParse({
        key: "certificates",
        windowDays: 7,
        minimumDays: 8,
        leadDays: 0,
        threshold: 0,
        revision: 0,
      }).success,
    ).toBe(false);
  });
  it("neutralizes formula text while keeping signed numeric integer quantities/cents", () => {
    const out = csv([[" \t=1+1", "-SUM(A1:A2)", "@foo", "+formula", -1234, 1234]]);
    expect(out).toContain(`"' \t=1+1"`);
    expect(out).toContain(`"'-SUM(A1:A2)"`);
    expect(out).toContain(`"-1234"`);
    expect(out).not.toContain(`"'-1234"`);
  });
});
