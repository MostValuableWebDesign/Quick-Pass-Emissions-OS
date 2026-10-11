import { describe, expect, it } from "vitest";
import { isEmissionsClosedOn } from "../src/modules/station/operating-hours";

describe("emissions operating days", () => {
  it.each([
    ["Saturday", "2026-10-10", false],
    ["Sunday", "2026-10-11", true],
    ["Monday", "2026-10-12", false],
  ])("reports the correct state for %s", (_weekday, date, isClosed) => {
    expect(isEmissionsClosedOn(date)).toBe(isClosed);
  });
});
