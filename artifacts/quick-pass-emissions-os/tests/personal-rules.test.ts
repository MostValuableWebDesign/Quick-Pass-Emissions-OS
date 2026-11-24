import { describe, expect, it } from "vitest";
import { buildPersonalSummary, closedSummaryPeriods } from "@/modules/personal/rules";
const event = (kind: string, iso: string, note = "") => ({
  kind,
  occurredAt: new Date(iso),
  title: "Order replacement hoses",
  completionNote: note,
  priority: "HIGH",
  dueDate: "2026-11-24",
  status: kind === "COMPLETED" ? "COMPLETED" : "TODO",
  completedAt: kind === "COMPLETED" ? new Date(iso) : null,
});
const task = (events: ReturnType<typeof event>[]) => ({
  id: "task",
  title: "Order replacement hoses",
  priority: "HIGH",
  dueDate: null,
  status: "TODO",
  createdAt: new Date("2026-10-01T12:00:00Z"),
  events,
});
describe("personal accomplishment reporting", () => {
  it("counts a completed/reopened/completed task once per period and identifies reopening", () => {
    const result = buildPersonalSummary(
      [
        task([
          event("COMPLETED", "2026-11-02T16:00:00Z", "Called supplier"),
          event("REOPENED", "2026-11-03T16:00:00Z"),
          event("COMPLETED", "2026-11-04T16:00:00Z", "Order confirmed"),
        ]),
      ],
      "2026-11-01",
      "2026-11-14",
    );
    expect(result.completed).toHaveLength(1);
    expect(result.completed[0].completionNote).toBe("Order confirmed");
    expect(result.reopened).toHaveLength(1);
    expect(result.unfinished).toHaveLength(0);
  });
  it("reports completed work reopened afterward as unfinished as well", () => {
    const result = buildPersonalSummary(
      [
        task([
          event("COMPLETED", "2026-11-02T16:00:00Z"),
          event("REOPENED", "2026-11-03T16:00:00Z"),
        ]),
      ],
      "2026-11-01",
      "2026-11-14",
    );
    expect(result.completed[0].reopened).toBe(true);
    expect(result.unfinished).toHaveLength(1);
  });
  it("uses Eastern calendar dates at midnight and DST, not UTC dates", () => {
    const result = buildPersonalSummary(
      [task([event("COMPLETED", "2026-11-02T04:30:00Z")])],
      "2026-11-01",
      "2026-11-01",
    );
    expect(result.completed[0].completedDate).toBe("2026-11-01");
  });
  it("does not leak future task states or tasks into historical periods", () => {
    const prior = task([
      event("TODO", "2026-11-01T15:00:00Z"),
      event("COMPLETED", "2026-11-20T15:00:00Z"),
    ]);
    const future = { ...task([]), id: "future", createdAt: new Date("2026-11-20T12:00:00Z") };
    const result = buildPersonalSummary([prior, future], "2026-11-01", "2026-11-14");
    expect(result.completed).toHaveLength(0);
    expect(result.unfinished.map((t) => t.id)).toEqual(["task"]);
  });
  it("includes completion-note corrections without inventing a new completion date", () => {
    const original = event("COMPLETED", "2026-11-02T16:00:00Z");
    const annotation = {
      ...original,
      kind: "UPDATED",
      occurredAt: new Date("2026-11-03T16:00:00Z"),
      completionNote: "Delivered",
    };
    const result = buildPersonalSummary([task([original, annotation])], "2026-11-01", "2026-11-14");
    expect(result.completed[0]).toMatchObject({
      completedDate: "2026-11-02",
      completionNote: "Delivered",
    });
    expect(result.unfinished).toHaveLength(0);
  });
  it("keeps 14-day periods inclusive and only generates fully closed windows", () => {
    expect(closedSummaryPeriods("2026-11-01", "2026-11-14").periods).toEqual([]);
    expect(closedSummaryPeriods("2026-11-01", "2026-11-29")).toEqual({
      periods: [
        { startDate: "2026-11-01", endDate: "2026-11-14" },
        { startDate: "2026-11-15", endDate: "2026-11-28" },
      ],
      nextDate: "2026-11-29",
    });
  });
});
