import { describe, it, expect } from "vitest";
import {
  hourlyCents,
  commissionCents,
  sumCents,
  csvCell,
  formatMoney,
} from "../src/modules/payroll/calculations";
import { certificateForecast } from "../src/modules/certificates/forecast";
import {
  periodInput,
  policyInput,
  emissionInput,
  arrangementInput,
  payrollInput,
} from "../src/modules/payroll/service";
describe("Phase 2 exact calculations", () => {
  it.each(["", "  ", null, undefined, false, true, [], {}, "NaN", "Infinity", -1, 1.5])(
    "rejects missing or invalid payroll numbers: %j",
    (value) => {
      expect(emissionInput.shape.count.safeParse(value).success).toBe(false);
      expect(arrangementInput.shape.amountCents.safeParse(value).success).toBe(false);
      expect(policyInput.shape.threshold.safeParse(value).success).toBe(false);
      expect(policyInput.shape.rateCents.safeParse(value).success).toBe(false);
      expect(payrollInput.shape.minutes.safeParse(value).success).toBe(false);
    },
  );
  it.each([0, "0", " 0 "])("accepts explicit numeric zero: %j", (value) => {
    expect(emissionInput.shape.count.parse(value)).toBe(0);
    expect(arrangementInput.shape.amountCents.parse(value)).toBe(0);
    expect(policyInput.shape.threshold.parse(value)).toBe(0);
  });
  it("applies commission per person/day, above the threshold only", () => {
    expect([0, 49, 50, 51, 65].map((c) => commissionCents(c, 50, 100, true))).toEqual([
      0, 0, 0, 100, 1500,
    ]);
    expect(commissionCents(65, 50, 100, false)).toBe(0);
    expect(sumCents([commissionCents(40, 50, 100, true), commissionCents(40, 50, 100, true)])).toBe(
      0,
    );
  });
  it("rounds approved hourly minutes half up once, in exact cents", () => {
    expect(hourlyCents(1001, 1)).toBe(17);
    expect(hourlyCents(1, 30)).toBe(1);
    expect(hourlyCents(1999, 120)).toBe(3998);
    expect(sumCents([1, 2, 999])).toBe(1002);
    expect(formatMoney(123456)).toBe("$1,234.56");
  });
  it("rejects unsafe input and overflow instead of truncating money", () => {
    expect(() => hourlyCents(1.1, 60)).toThrow();
    expect(() => commissionCents(-1, 50, 100, true)).toThrow();
    expect(() => commissionCents(100000, 0, 2000000000, true)).toThrow();
    expect(() => sumCents([2000000000, 1])).toThrow();
  });
  it("escapes CSV fields and spreadsheet formulas", () => {
    expect(csvCell('Smith, "Jane"')).toBe('"Smith, ""Jane"""');
    expect(csvCell(" =HYPERLINK(1)")).toBe('"\' =HYPERLINK(1)"');
    expect(csvCell(1500)).toBe('"1500"');
  });
  it("rejects invalid periods and station-total attribution", () => {
    expect(
      periodInput.safeParse({ startDate: "2026-02-29", endDate: "2026-03-01", label: "x" }).success,
    ).toBe(false);
    expect(
      periodInput.safeParse({ startDate: "2026-01-01", endDate: "2027-01-02", label: "x" }).success,
    ).toBe(false);
    expect(
      policyInput.safeParse({
        employeeId: "x",
        effectiveDate: "2026-01-01",
        eligible: true,
        threshold: 50,
        rateCents: 100,
        attribution: "STATION_TOTAL",
        reason: "x",
      }).success,
    ).toBe(false);
  });
});
describe("Recorded certificate forecasts", () => {
  const base = {
    balance: 100,
    openingDate: "2026-10-01",
    today: "2026-10-10",
    windowDays: 30,
    used: 200,
    minimumOrder: 300,
    reorderPoint: 50,
    leadDays: 7,
  };
  it("omits an out-of-calendar depletion date for supported large stock and tiny usage", () => {
    const result = certificateForecast({ ...base, balance: 2000000000, used: 1 });
    expect(result.daysRemaining).toBe(20000000000);
    expect(result.depletionDate).toBeNull();
  });
  it("counts calendar days since opening and uses lead-time demand", () => {
    expect(certificateForecast(base)).toMatchObject({
      days: 10,
      averageDailyUsage: 20,
      reorderAt: 140,
      daysRemaining: 5,
      depletionDate: "2026-10-15",
      low: true,
      recommendedQuantity: 640,
    });
  });
  it("has no depletion date with no recorded usage", () => {
    expect(certificateForecast({ ...base, used: 0 })).toMatchObject({
      daysRemaining: null,
      depletionDate: null,
      low: false,
      recommendedQuantity: 0,
    });
  });
  it("keeps recommended orders at the configured minimum and handles zero stock", () => {
    expect(certificateForecast({ ...base, balance: 0, used: 0 })).toMatchObject({
      low: true,
      recommendedQuantity: 300,
    });
    expect(certificateForecast({ ...base, balance: 0, used: 10, windowDays: 7 })).toMatchObject({
      days: 7,
      depletionDate: "2026-10-10",
      recommendedQuantity: 300,
    });
  });
});
