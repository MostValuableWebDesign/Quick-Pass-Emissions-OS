import { addDays } from "@/lib/time";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RepeatVehicleAnalysis as RepeatVehicleAnalysisCard } from "../src/components/repeat-vehicle-analysis";
import { analyzeRepeatVehicleHistory } from "../src/modules/station/repeat-vehicle-analysis";
import type { PortalDay } from "../src/modules/station/dashboard-types";

function day(date: string, vins: (string | null)[]): PortalDay {
  const tests = vins.map((vinHash, index) => ({
    inspector: index % 2 ? "Inspector B" : "Inspector A",
    minute: 540 + index * 20,
    ...(vinHash ? { vinHash } : {}),
    recordKey: `record-${date}-${index}`,
    outcome: "passed" as const,
  }));
  return {
    date,
    retrievedAt: `${date}T16:00:00.000Z`,
    total: tests.length,
    rawTotal: tests.length,
    passed: tests.length,
    failed: 0,
    aborted: 0,
    other: 0,
    inspectors: [],
    verifiedEmpty: tests.length === 0,
    testTimes: tests,
    paceTestTimes: tests,
  };
}

describe("All Time repeat-vehicle analysis", () => {
  it("counts distinct returning vehicles and classifies 30-day repeats", () => {
    const days = [
      day("2020-01-01", ["vehicle-a"]),
      day("2020-01-20", ["vehicle-a"]),
      day("2020-01-22", ["vehicle-b"]),
      day("2020-02-21", ["vehicle-a"]),
    ];
    const result = analyzeRepeatVehicleHistory(days, "2020-01-01", "2020-02-21");
    expect(result).toMatchObject({
      identifiedInspections: 4,
      unidentifiedInspections: 0,
      distinctVehicles: 2,
      repeatVehicles: 1,
      repeatVisits: 2,
      freeRetests: 1,
      paidRepeatInspections: 1,
      classificationUnknownDates: 0,
    });
    expect(JSON.stringify(result)).not.toContain("vehicle-a");
  });

  it("excludes history outside the selected All Time source range", () => {
    const result = analyzeRepeatVehicleHistory(
      [day("2020-01-01", ["vehicle-a"]), day("2020-01-04", ["vehicle-a"])],
      "2020-01-02",
      "2020-01-04",
    );
    expect(result).toMatchObject({ identifiedInspections: 1, repeatVehicles: 0 });
  });

  it("counts unknown vehicle IDs separately without falsely merging them", () => {
    const result = analyzeRepeatVehicleHistory(
      [day("2020-01-01", [null])],
      "2020-01-01",
      "2020-01-01",
    );
    expect(result).toMatchObject({
      identifiedInspections: 0,
      unidentifiedInspections: 1,
      distinctVehicles: 0,
      repeatVehicles: 0,
    });
  });

  it("marks a day with ambiguous repeat timing as incomplete", () => {
    const ambiguous = {
      ...day("2020-01-01", ["vehicle-a", "vehicle-a"]),
      retestComplete: false,
    };
    const result = analyzeRepeatVehicleHistory([ambiguous], "2020-01-01", "2020-01-01");
    expect(result.classificationUnknownDates).toBe(1);
  });

  it("excludes missing and ambiguous vehicle evidence from identity matches", () => {
    const incomplete = {
      ...day("2020-01-01", ["vehicle-a"]),
      paceTestTimes: [],
      incompleteRows: { total: 1, vehicle: 1, inspector: 0, outcome: 0 },
      rawTotal: 1,
      total: 1,
    };
    const result = analyzeRepeatVehicleHistory([incomplete], "2020-01-01", "2020-01-01");
    expect(result).toMatchObject({ identifiedInspections: 0, unidentifiedInspections: 2 });
  });

  it("tracks the latest visit, not just the first, for the 30-day rule", () => {
    const start = "2020-03-01";
    const result = analyzeRepeatVehicleHistory(
      [
        day(start, ["vehicle-a"]),
        day(addDays(start, 25), ["vehicle-a"]),
        day(addDays(start, 55), ["vehicle-a"]),
      ],
      start,
      addDays(start, 55),
    );
    expect(result).toMatchObject({ repeatVisits: 2, freeRetests: 2, paidRepeatInspections: 0 });
  });

  it("shows the repeat metrics and makes partial All Time coverage explicit", () => {
    const report = analyzeRepeatVehicleHistory(
      [day("2020-01-01", ["vehicle-a"]), day("2020-01-20", ["vehicle-a"])],
      "2020-01-01",
      "2020-01-20",
    );
    const markup = renderToStaticMarkup(
      createElement(RepeatVehicleAnalysisCard, {
        report,
        pendingDates: 18,
        incompleteDates: 1,
      }),
    );
    expect(markup).toContain("Recorded repeat vehicles · includes retests");
    expect(markup).not.toContain("Free repeats · within 30 days");
    expect(markup).not.toContain("Paid repeats · after 30 days");
    expect(markup).not.toContain("Inspections without a usable VIN");
    expect(markup).toContain(
      "Preliminary · Some source dates or rows are incomplete; totals may change after retrieval.",
    );
    expect(markup).not.toContain("18 source dates pending");
    expect(markup).not.toContain("dates have incomplete source rows");
    expect(markup).not.toContain("vehicle-a");
  });

  it("keeps the empty All Time state distinct from a verified zero-repeat result", () => {
    const report = analyzeRepeatVehicleHistory([], "2020-01-01", "2020-01-31");
    const markup = renderToStaticMarkup(
      createElement(RepeatVehicleAnalysisCard, {
        report,
        pendingDates: 31,
        incompleteDates: 0,
      }),
    );
    expect(markup).toContain("No vehicle history is loaded yet");
    expect(markup).not.toContain("Vehicles tested more than once");
  });
});
