import { describe, it, expect } from "vitest";
import { occursOn, type Rule } from "../src/modules/tasks/recurrence";
import { businessDate, dueInstant } from "../src/lib/time";
import { canAccessTask, canManageRole, canTransition, overdue } from "../src/lib/policy";
import { dateString, shiftInput, templateInput } from "../src/lib/validation";
const days = [1, 2, 3, 4, 5, 6, 7];
const none = new Set<string>();
const rule = (frequency: Rule["frequency"], startDate = "2026-01-31"): Rule => ({
  frequency,
  startDate,
  endDate: null,
  weekdays: [1, 3],
});
describe("Business calendar", () => {
  it("respects closures and operating days", () => {
    expect(occursOn(rule("DAILY"), "2026-02-01", [1, 2, 3, 4, 5], none)).toBe(false);
    expect(occursOn(rule("DAILY"), "2026-02-02", days, new Set(["2026-02-02"]))).toBe(false);
  });
  it("respects start and end boundaries", () => {
    expect(occursOn({ ...rule("DAILY"), endDate: "2026-02-02" }, "2026-02-03", days, none)).toBe(
      false,
    );
    expect(occursOn(rule("DAILY"), "2026-01-30", days, none)).toBe(false);
  });
  it("supports once and selected weekly days", () => {
    expect(occursOn(rule("ONCE"), "2026-01-31", days, none)).toBe(true);
    expect(occursOn(rule("ONCE"), "2026-02-01", days, none)).toBe(false);
    expect(occursOn(rule("WEEKLY"), "2026-02-02", days, none)).toBe(true);
    expect(occursOn(rule("WEEKLY"), "2026-02-03", days, none)).toBe(false);
  });
  it("clamps monthly day 31 without losing its anchor", () => {
    expect(occursOn(rule("MONTHLY"), "2026-02-28", days, none)).toBe(true);
    expect(occursOn(rule("MONTHLY"), "2026-03-31", days, none)).toBe(true);
    expect(occursOn(rule("MONTHLY"), "2026-03-28", days, none)).toBe(false);
  });
  it("supports quarterly and leap-year annual duties", () => {
    expect(occursOn(rule("QUARTERLY"), "2026-04-30", days, none)).toBe(true);
    expect(occursOn(rule("QUARTERLY"), "2026-02-28", days, none)).toBe(false);
    expect(occursOn(rule("ANNUAL", "2024-02-29"), "2025-02-28", days, none)).toBe(true);
    expect(occursOn(rule("ANNUAL", "2024-02-29"), "2028-02-29", days, none)).toBe(true);
  });
  it("applies explicit DST gap and overlap policies", () => {
    expect(dueInstant("2026-03-08", "02:30").toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(dueInstant("2026-11-01", "01:30").toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
  it("computes business day independent of host timezone", () => {
    expect(businessDate(new Date("2026-10-10T02:00:00Z"))).toBe("2026-10-09");
  });
});
describe("Authorization and lifecycle", () => {
  it("employees cannot read peers or privileged tasks", () => {
    expect(canAccessTask("EMPLOYEE", "a", "b")).toBe(false);
    expect(canAccessTask("EMPLOYEE", "a", "a")).toBe(true);
    expect(canAccessTask("BOOKKEEPER", "a", "a")).toBe(false);
    expect(canAccessTask("ADMIN", undefined, "a")).toBe(true);
  });
  it("only owners grant privileged roles", () => {
    expect(canManageRole("ADMIN", "OWNER")).toBe(false);
    expect(canManageRole("ADMIN", "ADMIN")).toBe(false);
    expect(canManageRole("EMPLOYEE", "EMPLOYEE")).toBe(false);
    expect(canManageRole("OWNER", "ADMIN")).toBe(true);
  });
  it("employees cannot reopen terminal work or cancel", () => {
    expect(canTransition("COMPLETED", "IN_PROGRESS", false)).toBe(false);
    expect(canTransition("PENDING", "CANCELLED", false)).toBe(false);
    expect(canTransition("BLOCKED", "COMPLETED", false)).toBe(true);
    expect(canTransition("COMPLETED", "PENDING", true)).toBe(true);
  });
  it("overdue is live and excludes terminal records", () => {
    const past = new Date("2020-01-01");
    expect(overdue("PENDING", past)).toBe(true);
    expect(overdue("BLOCKED", past)).toBe(true);
    expect(overdue("COMPLETED", past)).toBe(false);
    expect(overdue("CANCELLED", past)).toBe(false);
  });
});
describe("Validation", () => {
  it("rejects impossible dates", () => {
    expect(dateString.safeParse("2026-02-30").success).toBe(false);
  });
  it("rejects backward shifts", () => {
    expect(
      shiftInput.safeParse({
        employeeId: "a",
        date: "2026-01-01",
        startTime: "17:00",
        endTime: "08:00",
        duties: "",
      }).success,
    ).toBe(false);
  });
  it("requires selected days for weekly recurrence", () => {
    expect(
      templateInput.safeParse({
        title: "Task",
        description: "",
        frequency: "WEEKLY",
        startDate: "2026-01-01",
        endDate: "",
        dueTime: "09:00",
        employeeId: "a",
        priority: "NORMAL",
        reviewRequired: false,
        escalationHours: 0,
        weekdays: [],
      }).success,
    ).toBe(false);
  });
});
