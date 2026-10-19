import { describe, expect, it } from "vitest";
import { emptyHistoryCovers, historyStartSchema } from "../src/modules/station/history-boundary";

const empty = (start: string, end: string) => ({ start, end, traffic: false, metadataOnly: true });

describe("Station history boundary evidence", () => {
  it("requires affirmative verification and a valid supported source date", () => {
    expect(
      historyStartSchema.safeParse({
        earliestDate: "2012-06-18",
        scannedFrom: "2000-01-01",
        verified: true,
      }).success,
    ).toBe(true);
    expect(
      historyStartSchema.safeParse({
        earliestDate: "2012-06-18",
        scannedFrom: "2000-01-01",
        verified: false,
      }).success,
    ).toBe(false);
    expect(
      historyStartSchema.safeParse({
        earliestDate: "1999-12-31",
        scannedFrom: "2000-01-01",
        verified: true,
      }).success,
    ).toBe(false);
  });

  it("combines unordered, overlapping verified empty windows", () => {
    expect(
      emptyHistoryCovers(
        [empty("2001-01-01", "2002-12-31"), empty("2000-01-01", "2001-06-30")],
        "2003-01-01",
      ),
    ).toBe(true);
  });

  it("rejects coverage with an unchecked gap", () => {
    expect(
      emptyHistoryCovers(
        [empty("2000-01-01", "2000-12-31"), empty("2002-01-01", "2002-12-31")],
        "2003-01-01",
      ),
    ).toBe(false);
  });

  it("does not treat nonempty, malformed or unverified results as empty history", () => {
    expect(
      emptyHistoryCovers(
        [
          { ...empty("2000-01-01", "2001-12-31"), traffic: true },
          { start: "2000-01-01", end: "2001-12-31", traffic: false },
          empty("bad", "2001-12-31"),
        ],
        "2002-01-01",
      ),
    ).toBe(false);
  });

  it("needs no earlier query when traffic starts at the supported boundary itself", () => {
    expect(emptyHistoryCovers([], "2000-01-01")).toBe(true);
    expect(emptyHistoryCovers([], "invalid")).toBe(false);
  });
});
