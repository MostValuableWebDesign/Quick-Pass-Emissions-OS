import { describe, expect, it } from "vitest";
import { addDays } from "../src/lib/time";
import {
  decimalHundredths,
  discountCents,
  inspectionKind,
  lineReceipts,
  promoAllowed,
  sumMoney,
} from "../src/modules/marketing/rules";
import { validateMaterialFile } from "../src/modules/marketing/material-storage";

describe("Marketing arithmetic and evidence boundaries", () => {
  it("parses exact cents without floating point or rounding user input", () => {
    expect(decimalHundredths("19.99")).toBe(1999);
    expect(decimalHundredths("0.01")).toBe(1);
    for (const value of ["1.001", "-2", "1e3", "Infinity", "", 214])
      expect(() => decimalHundredths(value)).toThrow();
  });
  it("rounds percentage discounts half up and caps fixed discounts", () => {
    expect(discountCents(299, "PERCENT", 500)).toBe(15);
    expect(discountCents(201, "PERCENT", 5000)).toBe(101);
    expect(discountCents(2000, "FIXED", 3000)).toBe(2000);
    expect(() => discountCents(2000, "PERCENT", 10001)).toThrow();
    expect(() => discountCents(2.5, "FIXED", 1)).toThrow();
  });
  it("uses inclusive promo boundaries, actual station membership and lifetime limits", () => {
    const c = {
      status: "ACTIVE",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      stationHashes: ["station"],
    };
    const p = {
      active: true,
      startDate: c.startDate,
      endDate: c.endDate,
      stationHashes: ["station"],
      usageLimit: 2,
    };
    expect(promoAllowed(p, c, c.startDate, "station", 0)).toBe(true);
    expect(promoAllowed(p, c, c.endDate, "station", 1)).toBe(true);
    expect(promoAllowed(p, c, "2026-11-01", "station", 0)).toBe(false);
    expect(promoAllowed(p, c, c.startDate, "other", 0)).toBe(false);
    expect(promoAllowed(p, c, c.startDate, "station", 2)).toBe(false);
    expect(promoAllowed(p, { ...c, status: "ARCHIVED" }, c.startDate, "station", 0)).toBe(false);
  });
  it("allocates only recorded net receipts, excluding tax and uncollected balances", () => {
    expect(lineReceipts(1800, 3800, 1900)).toBe(900);
    expect(lineReceipts(1800, 3800, 950)).toBe(450);
    expect(lineReceipts(2000, 2100, 2100)).toBe(2000);
    expect(lineReceipts(2000, 2100, -100)).toBe(0);
    expect(lineReceipts(2000, 2100, 3000)).toBe(2000);
    expect(sumMoney([2147483647, 2147483647])).toBe(4294967294);
    expect(() => sumMoney([Number.MAX_SAFE_INTEGER, 1])).toThrow();
  });
  it("does not call missing VIN/lookback evidence paid; day 30 is free and 31 paid", () => {
    const row = { id: "b", date: "2026-10-12", time: "10:00", vin: "hashed-vin", outcome: "PASS" };
    const previous = { ...row, id: "a", date: addDays(row.date, -30) };
    const complete = new Set(Array.from({ length: 30 }, (_, i) => addDays(row.date, -i - 1)));
    expect(inspectionKind(row, [previous, row], new Set())).toBe("FREE");
    expect(
      inspectionKind(row, [{ ...previous, date: addDays(row.date, -31) }, row], complete),
    ).toBe("PAID");
    expect(inspectionKind(row, [row], new Set())).toBe("UNKNOWN");
    expect(inspectionKind({ ...row, vin: "" }, [row], complete)).toBe("UNKNOWN");
    expect(inspectionKind({ ...row, outcome: "ABORT" }, [row], complete)).toBe("OTHER");
  });
  it("uses chronological same-day occurrences without self-matching", () => {
    const first = { id: "a", date: "2026-10-12", time: "09:00", vin: "v", outcome: "FAIL" };
    const second = { ...first, id: "b", time: "10:00", outcome: "PASS" };
    expect(inspectionKind(first, [first, second], new Set())).toBe("UNKNOWN");
    expect(inspectionKind(second, [first, second], new Set())).toBe("FREE");
  });
  it("rejects spoofed/unsupported/oversized materials", () => {
    expect(() => validateMaterialFile(Buffer.from("<svg>"), "image/svg+xml", "x.svg")).toThrow();
    expect(() => validateMaterialFile(Buffer.from("script"), "image/png", "x.png")).toThrow();
    expect(() => validateMaterialFile(Buffer.alloc(2097153), "image/png", "x.png")).toThrow();
    expect(() =>
      validateMaterialFile(Buffer.from("%PDF-1.7\n%%EOF"), "application/pdf", "x.exe"),
    ).toThrow();
  });
});
