import { describe, expect, it } from "vitest";
import { testExportBatches } from "../src/modules/station/test-export-batches";

describe("small station test export batches", () => {
  it("deduplicates, sorts newest first and isolates today from historical ranges", () => {
    expect(
      testExportBatches(
        ["2026-10-12", "2026-10-11", "2026-10-10", "2026-10-09", "2026-10-08", "2026-10-10"],
        "2026-10-12",
      ),
    ).toEqual([
      { start: "2026-10-12", end: "2026-10-12" },
      { start: "2026-10-11", end: "2026-10-11" },
      { start: "2026-10-08", end: "2026-10-10" },
    ]);
  });
  it("never bridges a missing date or invents a zero-day request", () => {
    expect(testExportBatches(["2026-10-09", "2026-10-11"], "2026-10-12")).toEqual([
      { start: "2026-10-11", end: "2026-10-11" },
      { start: "2026-10-09", end: "2026-10-09" },
    ]);
    expect(testExportBatches([], "2026-10-12")).toEqual([]);
  });
});
