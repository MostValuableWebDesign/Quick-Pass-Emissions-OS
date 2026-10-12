import { describe, expect, it } from "vitest";
import { paceSettingsSchema } from "../src/modules/station/pace-settings";

describe("owner pace threshold validation", () => {
  it("accepts an explicit no-limit choice and bounded whole minutes", () => {
    for (const longGapMinutes of [null, 1, 30, 1439])
      expect(paceSettingsSchema.safeParse({ revision: 0, longGapMinutes }).success).toBe(true);
  });
  it("rejects blank, boolean, string, fractional and out-of-range values without coercion", () => {
    for (const longGapMinutes of [
      undefined,
      "",
      "30",
      false,
      true,
      0,
      -1,
      1.5,
      1440,
      Infinity,
      NaN,
    ])
      expect(paceSettingsSchema.safeParse({ revision: 0, longGapMinutes }).success).toBe(false);
    expect(paceSettingsSchema.safeParse({ revision: -1, longGapMinutes: 30 }).success).toBe(false);
  });
});
