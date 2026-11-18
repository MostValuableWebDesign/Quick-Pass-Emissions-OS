import { describe, expect, it } from "vitest";
import { reportThroughMinute } from "@/modules/station/report-cutoff";
import type { PortalDay } from "@/modules/station/dashboard-types";

describe("staffing report cutoff", () => {
  const day: PortalDay = {
    date: "2026-11-18",
    retrievedAt: "2026-11-18T19:02:00Z",
    total: 3,
    passed: 2,
    failed: 1,
    aborted: 0,
    other: 0,
    verifiedEmpty: false,
    inspectors: [{ inspector: "Inspector", total: 3, passed: 2, failed: 1, aborted: 0, other: 0 }],
    testTimes: [
      { inspector: "Inspector", minute: 839, outcome: "passed" },
      { inspector: "Inspector", minute: 840, outcome: "failed" },
      { inspector: "Inspector", minute: 841, outcome: "passed" },
    ],
  };
  it("counts up to and including 2 PM and does not modify the saved snapshot", () => {
    const result = reportThroughMinute(day, 840);
    expect(result.total).toBe(2);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.inspectors[0].total).toBe(2);
    expect(day.total).toBe(3);
  });
  it("does not guess when source timestamps are missing", () => {
    expect(() => reportThroughMinute({ ...day, testTimes: undefined }, 840)).toThrow();
    expect(() =>
      reportThroughMinute(
        {
          ...day,
          testTimes: day.testTimes!.map((test) => ({ ...test, minute: null })),
        },
        840,
      ),
    ).toThrow();
  });
});
