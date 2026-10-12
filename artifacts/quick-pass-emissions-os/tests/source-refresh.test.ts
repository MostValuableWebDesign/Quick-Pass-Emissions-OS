import { describe, expect, it } from "vitest";
import { sourceRefreshLabel } from "../src/lib/source-refresh";

describe("dashboard source refresh labels", () => {
  it("distinguishes saved, live, partial, failed and deferred source results", () => {
    expect(sourceRefreshLabel("cached", "Georgia I/M")).toContain("cached data");
    expect(sourceRefreshLabel("source", "Georgia I/M")).toContain("Updated from Georgia I/M");
    expect(sourceRefreshLabel("partial", "Georgia I/M")).toContain("Partial update");
    expect(sourceRefreshLabel("failed", "Georgia I/M")).toContain("pull failed");
    expect(sourceRefreshLabel("blocked", "Georgia I/M")).toContain("deferred");
  });
});
