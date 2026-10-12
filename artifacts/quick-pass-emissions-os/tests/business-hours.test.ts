import { describe, expect, it } from "vitest";
import { businessHoursFromForm, readBusinessHours } from "../src/lib/business-hours";

describe("business operating hours", () => {
  it("parses independent daily hours and ignores days without configured times", () => {
    const form = new FormData();
    form.set("openTime1", "07:30");
    form.set("closeTime1", "18:00");
    form.set("openTime6", "08:00");
    form.set("closeTime6", "14:00");

    expect(businessHoursFromForm(form)).toEqual({
      "1": { open: "07:30", close: "18:00" },
      "6": { open: "08:00", close: "14:00" },
    });
  });

  it("rejects incomplete or reversed daily time ranges", () => {
    const incomplete = new FormData();
    incomplete.set("openTime2", "08:00");
    expect(() => businessHoursFromForm(incomplete)).toThrow(
      "Enter both opening and closing times for each day.",
    );

    const reversed = new FormData();
    reversed.set("openTime4", "18:00");
    reversed.set("closeTime4", "08:00");
    expect(() => businessHoursFromForm(reversed)).toThrow(
      "Closing time must be later than opening time.",
    );
  });

  it("reads existing settings and defaults older records to no configured hours", () => {
    expect(readBusinessHours(null)).toEqual({});
    expect(readBusinessHours({ "7": { open: "09:00", close: "12:00" } })).toEqual({
      "7": { open: "09:00", close: "12:00" },
    });
  });
});
