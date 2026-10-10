import { describe, expect, it } from "vitest";
import {
  compareFields,
  matchReference,
  importInput,
  fingerprint,
  type Item,
} from "../src/modules/business-import/rules";
const vendor: Item = {
  entity: "VENDOR",
  key: "supplier",
  section: "Synthetic section",
  values: {
    name: "Fixture Supply",
    contact: "",
    phone: "555-0100",
    email: "",
    reference: "synthetic-account",
    services: "Parts",
    notes: "",
  },
};
describe("controlled business reference matching", () => {
  it("fills blanks, never treating zero or false as missing", () => {
    expect(
      compareFields(
        { amount: 0, active: false, name: "", unit: null },
        { amount: 50, active: true, name: "Fixture", unit: "ML" },
      ),
    ).toEqual({ changes: { name: "Fixture", unit: "ML" }, conflicts: ["amount", "active"] });
  });
  it("requires stable identifiers or explicit mappings for existing vendors", () => {
    expect(
      matchReference(vendor, [{ id: "a", name: "Fixture Supply", phone: "", reference: "" }])
        .conflict,
    ).toBe(true);
    expect(
      matchReference({ ...vendor, recordId: "a" }, [{ id: "a", name: "Fixture Supply" }]).conflict,
    ).toBe(false);
    expect(
      matchReference(vendor, [{ id: "a", name: "Fixture Supply", phone: "555-0100" }]).record?.id,
    ).toBe("a");
  });
  it("rejects duplicate stable identifiers and mismatched explicit targets", () => {
    expect(
      matchReference(vendor, [
        { id: "a", name: "Fixture Supply" },
        { id: "b", phone: "555-0100" },
      ]).conflict,
    ).toBe(true);
    expect(matchReference({ ...vendor, recordId: "missing" }, []).conflict).toBe(true);
  });
  it("never fuzzy-matches names", () => {
    expect(matchReference(vendor, [{ id: "a", name: "Fixture" }]).record).toBe(null);
  });
  it("rejects financial/history/login values and duplicate item keys", () => {
    const input = {
      sourceName: "Synthetic source",
      sourceFingerprint: "a".repeat(64),
      items: [vendor],
    };
    expect(importInput.safeParse(input).success).toBe(true);
    expect(
      importInput.safeParse({
        ...input,
        items: [{ ...vendor, values: { ...vendor.values, password: "not allowed" } }],
      }).success,
    ).toBe(false);
    expect(importInput.safeParse({ ...input, items: [vendor, vendor] }).success).toBe(false);
    expect(
      importInput.safeParse({
        ...input,
        items: [{ entity: "PAYROLL", key: "pay", section: "fixture", values: {} }],
      }).success,
    ).toBe(false);
  });
  it("fingerprints object order and date round trips consistently", () => {
    expect(fingerprint({ b: 2, a: 1 })).toBe(fingerprint({ a: 1, b: 2 }));
    const date = new Date("2026-01-01T00:00:00Z");
    expect(fingerprint({ date })).toBe(fingerprint({ date: date.toISOString() }));
  });
});
