import { describe, expect, it } from "vitest";
import { longDate, shortDate } from "../src/components/performance-dashboard-format";
describe("Performance reporting-date labels", () => {
  it("keeps a selected Sunday labeled as its report-local calendar date", () => {
    expect(longDate("2026-10-11")).toBe("Sun, Oct 11, 2026");
    expect(shortDate("2026-10-11")).toBe("Oct 11");
  });
  it("does not shift calendar dates at DST boundaries", () => {
    expect(longDate("2026-03-08")).toBe("Sun, Mar 8, 2026");
    expect(longDate("2026-11-01")).toBe("Sun, Nov 1, 2026");
  });
});
