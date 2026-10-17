import { describe, it, expect } from "vitest";
import {
  availabilityInput,
  proposeSchedule,
  taskInput,
  taskReady,
  type PlannedTask,
} from "../src/modules/manager/rules";
import { dueInstant } from "../src/lib/time";
import { starterDuties } from "../src/modules/manager/starter";
const start = "2026-10-19",
  now = new Date("2026-10-18T12:00:00Z");
const availability = availabilityInput.parse({
  version: 0,
  reservePercent: 20,
  days: [{ weekday: 1, start: "09:00", end: "17:00", breaks: [{ start: "12:00", end: "13:00" }] }],
});
const task = (id: string, extra: Partial<PlannedTask> = {}): PlannedTask => ({
  id,
  version: 0,
  title: id,
  dueAt: dueInstant(start, "17:00"),
  priority: "NORMAL",
  durationMinutes: 60,
  dependencies: [],
  ...extra,
});
describe("Manager schedule rules", () => {
  it("leaves everything in a draft until personal availability is configured", () => {
    const p = proposeSchedule(start, null, [task("a")], [], now);
    expect(p.slots).toHaveLength(0);
    expect(p.unscheduled[0].reason).toMatch(/Draft/);
    expect(p.configured).toBe(false);
  });
  it("separates breaks and reserves interruption capacity", () => {
    const p = proposeSchedule(
      start,
      availability,
      Array.from({ length: 8 }, (_, i) => task(String(i))),
      [],
      now,
    );
    expect(p.slots).toHaveLength(5);
    expect(p.unscheduled).toHaveLength(3);
    for (const s of p.slots) {
      expect(s.end <= "12:00" || s.start >= "13:00").toBe(true);
      expect(s.end <= "15:36").toBe(true);
    }
  });
  it("prioritizes critical equipment before routine work", () => {
    const p = proposeSchedule(
      start,
      availability,
      [task("routine"), task("equipment", { priority: "CRITICAL" })],
      [],
      now,
    );
    expect(p.slots[0].taskId).toBe("equipment");
  });
  it("never overbooks fixed commitments and flags conflicts", () => {
    const cs = [
      { id: "a", title: "Meeting", date: start, startTime: "09:00", endTime: "10:00" },
      { id: "b", title: "Outside", date: start, startTime: "08:00", endTime: "09:30" },
    ];
    const p = proposeSchedule(start, availability, [task("work")], cs, now);
    expect(p.conflicts).toHaveLength(2);
    expect(p.slots[0].start).toBe("10:00");
  });
  it("flags commitments on nonworking days", () => {
    const p = proposeSchedule(
      start,
      availability,
      [],
      [{ id: "b", title: "Sunday", date: "2026-10-25", startTime: "10:00", endTime: "11:00" }],
      now,
    );
    expect(p.conflicts[0]).toMatch(/outside configured/);
  });
  it("keeps overdue work unscheduled instead of silently moving its deadline", () => {
    const p = proposeSchedule(
      start,
      availability,
      [task("late", { dueAt: dueInstant(start, "08:00") })],
      [],
      now,
    );
    expect(p.slots).toHaveLength(0);
    expect(p.unscheduled).toHaveLength(1);
  });
  it("schedules prerequisites first even if the dependent has higher priority", () => {
    const p = proposeSchedule(
      start,
      availability,
      [task("b", { priority: "CRITICAL", dependencies: ["a"] }), task("a")],
      [],
      now,
    );
    expect(p.slots.map((s) => s.taskId)).toEqual(["a", "b"]);
  });
  it("does not schedule dependents of unresolved or unreviewed external work", () => {
    expect(
      proposeSchedule(start, availability, [task("b", { dependencies: ["missing"] })], [], now)
        .unscheduled[0].reason,
    ).toMatch(/prerequisite/);
    expect(taskReady("COMPLETED", true, null)).toBe(false);
    expect(taskReady("COMPLETED", true, now)).toBe(true);
  });
  it.each(["2026-03-08", "2026-11-01"])(
    "uses Eastern wall-clock availability through DST on %s",
    (date) => {
      const a = availabilityInput.parse({
        version: 0,
        reservePercent: 0,
        days: [{ weekday: 7, start: "09:00", end: "12:00", breaks: [] }],
      });
      const p = proposeSchedule(
        date,
        a,
        [task("a", { dueAt: dueInstant(date, "12:00") })],
        [],
        new Date("2026-01-01T00:00:00Z"),
      );
      expect(p.slots[0]).toMatchObject({ date, start: "09:00", end: "10:00" });
    },
  );
  it("rejects duplicate days and overlapping/outside breaks", () => {
    expect(() =>
      availabilityInput.parse({
        ...availability,
        days: [availability.days[0], availability.days[0]],
      }),
    ).toThrow();
    expect(() =>
      availabilityInput.parse({
        ...availability,
        days: [
          { weekday: 1, start: "09:00", end: "17:00", breaks: [{ start: "08:00", end: "09:30" }] },
        ],
      }),
    ).toThrow();
  });
  it("rejects overnight shifts and missing numeric values", () => {
    expect(() =>
      availabilityInput.parse({
        ...availability,
        days: [{ weekday: 1, start: "17:00", end: "09:00", breaks: [] }],
      }),
    ).toThrow();
    for (const value of ["", null, false])
      expect(() => availabilityInput.parse({ ...availability, reservePercent: value })).toThrow();
  });
  it("does not create training or licensing duties", () => {
    expect(starterDuties.some((d) => /training|licens/i.test(d.title))).toBe(false);
    expect(starterDuties.filter((d) => d.area === "PAYROLL").length).toBeGreaterThanOrEqual(4);
  });
  it("requires explicit recurring weekdays and occurrence-specific dependencies", () => {
    const values = {
      title: "Work",
      employeeId: "x",
      oversightId: "y",
      area: "GENERAL",
      date: start,
      time: "17:00",
      frequency: "WEEKLY",
      priority: "NORMAL",
      durationMinutes: 30,
      reviewRequired: true,
    };
    expect(() => taskInput.parse(values)).toThrow();
    expect(() => taskInput.parse({ ...values, frequency: "DAILY" })).toThrow();
    expect(() => taskInput.parse({ ...values, weekdays: [1], dependencies: ["other"] })).toThrow();
  });
});
