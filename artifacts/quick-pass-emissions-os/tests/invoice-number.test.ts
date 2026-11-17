import { describe, expect, it } from "vitest";
import {
  formatInvoiceNumber,
  isInvoiceNumberForYear,
  nextInvoiceSequence,
} from "@/modules/finance/invoice-number";

describe("dealership invoice numbers", () => {
  it("formats a yearly sequence with a four-digit minimum", () => {
    expect(formatInvoiceNumber("2026", 1)).toBe("QP-2026-0001");
    expect(formatInvoiceNumber("2026", 27)).toBe("QP-2026-0027");
    expect(formatInvoiceNumber("2026", 10000)).toBe("QP-2026-10000");
  });

  it("rejects an invalid year or sequence", () => {
    expect(() => formatInvoiceNumber("26", 1)).toThrow();
    expect(() => formatInvoiceNumber("2026", 0)).toThrow();
    expect(() => formatInvoiceNumber("2026", 1.5)).toThrow();
  });

  it("requires the supplied number to match the issue year and pattern", () => {
    expect(isInvoiceNumberForYear("QP-2026-0001", "2026")).toBe(true);
    expect(isInvoiceNumberForYear("QP-2026-10000", "2026")).toBe(true);
    expect(isInvoiceNumberForYear("QP-2025-0001", "2026")).toBe(false);
    expect(isInvoiceNumberForYear("INV-2026-0001", "2026")).toBe(false);
    expect(isInvoiceNumberForYear("QP-2026-1", "2026")).toBe(false);
  });

  it("chooses the next available number for the issue year", () => {
    expect(nextInvoiceSequence("2026", ["QP-2025-0099", "QP-2026-0001", "QP-2026-0012"])).toBe(13);
    expect(nextInvoiceSequence("2026", ["VIR-20260301-ABC", "QP-2026-invalid"])).toBe(1);
  });
});
