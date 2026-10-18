import { describe, it, expect } from "vitest";
import {
  normalizeVin,
  normalizePlate,
  normalizeInspection,
  qualifies,
  monthWindows,
  historyRange,
  inspectionDate,
  retryDate,
} from "../src/modules/station/history/rules";
import { parseCsv, parseHistoryExport } from "../src/modules/station/history/parser";
import { digest, parseReport } from "../src/modules/station/report";
import { plateBindings, vehicleIdentity } from "../src/modules/station/history/report";
import { seal, unseal } from "../src/modules/station/history/crypto";

describe("historical inspection source and identity rules", () => {
  it("splits inclusive ranges into months across leap years without gaps", () => {
    expect(monthWindows("2024-01-30", "2024-03-02")).toEqual([
      { start: "2024-01-30", end: "2024-01-31" },
      { start: "2024-02-01", end: "2024-02-29" },
      { start: "2024-03-01", end: "2024-03-02" },
    ]);
    expect(historyRange("2024-10-17", "2026-10-17", "2026-10-17")).toBeTruthy();
    expect(historyRange("2020-01-01", "2026-10-17", "2026-10-17")).toBeTruthy();
    expect(() => historyRange("2026-10-18", "2026-10-18", "2026-10-17")).toThrow();
  });
  it("validates VIN characters and check digit and preserves leading zeroes", () => {
    expect(normalizeVin(" 1hgcm82633a004352 ")).toBe("1HGCM82633A004352");
    for (const v of ["1HGCM82633A004353", "1HGCM82633AOO4352", "123", "", "00000000000000000"]) {
      expect(normalizeVin(v)).toBeNull();
    }
    expect(normalizePlate(" abc-012 ", " ga ")).toBe("GA:ABC012");
    expect(normalizePlate("abc", "")).toBeNull();
    expect(normalizePlate("abc", "XX")).toBeNull();
  });
  it("keeps original and normalized values and never infers payment or retest status", () => {
    const raw = {
      fields: {
        VIN: " 1hgcm82633a004352 ",
        "License Plate": "ABC",
        "Plate State": "GA",
        "Test Date": "10/01/2026 10:00 AM",
        Result: "Pass",
        "Vehicle Make": "Honda",
      },
    };
    const row = normalizeInspection(raw, digest("A"), "GA_DASHBOARD");
    expect(row.payment).toBe("UNKNOWN");
    expect(row.retest).toBe("UNKNOWN");
    expect(qualifies(row)).toBe(false);
    expect(row.normalized.vin).toBe("1HGCM82633A004352");
    expect(row.original).toEqual(raw);
    expect(row.conservativeIdentity).toBe(true);
    expect(
      normalizeInspection(
        { fields: { "Test Date": "2026-10-01", Result: "Pass" } },
        digest("A"),
        "CSV",
      ).conservativeIdentity,
    ).toBe(false);
  });
  it("honors Eastern boundaries and DST offsets without inventing an instant for local dates", () => {
    expect(inspectionDate("2026-10-01T01:00:00Z")).toBe("2026-09-30");
    expect(inspectionDate("2026-11-01T01:30:00-04:00")).toBe("2026-11-01");
    expect(inspectionDate("2026-11-01T01:30:00-05:00")).toBe("2026-11-01");
    expect(inspectionDate("2026-03-08T02:30:00")).toBe("2026-03-08");
  });
  it("parses quoted CSV and extra fields without dropping source values", () => {
    const rows = parseCsv(
      '\uFEFFInspection ID,Test Date,Note\r\n001,2026-10-01,"quoted, text\nwith ""quotes"""\r\n',
    );
    expect(rows).toEqual([
      {
        fields: {
          "Inspection ID": "001",
          "Test Date": "2026-10-01",
          Note: 'quoted, text\nwith "quotes"',
        },
      },
    ]);
    for (const body of [
      'Test Date,VIN\n"oops',
      "Test Date,Test Date\na,b",
      "Test Date,VIN\na",
      'Test Date\n"ok"bad',
    ])
      expect(() => parseCsv(body)).toThrow();
  });
  it("retains the exact legacy fingerprint when extending original Excel exports", () => {
    const body =
      '<table><tr><td>Station ID</td><td>A</td></tr><tr><td>Waiver Date</td><td>10/01/2026 - 10/01/2026</td></tr></table><table id="MainContent_gvMain"><tr><th>VIN</th><th>License Plate</th><th>Test Date</th><th>Issued By</th><th>Cert Number</th><th>Result</th><th>Print</th></tr><tr><td>1HGCM82633A004352</td><td>ABC</td><td>10/01/2026 10:00 AM</td><td>Inspector</td><td>Cert</td><td>Pass</td><td></td></tr></table>';
    expect(parseHistoryExport(body, digest("A")).rows[0].fingerprint).toBe(
      parseReport(body, "A").rows[0].fingerprint,
    );
    expect(() => parseHistoryExport(body, digest("B"))).toThrow();
  });
  it("qualifies only explicitly paid completed initial tests", () => {
    const base = { payment: "PAID", completion: "COMPLETED", retest: "INITIAL" };
    expect(qualifies(base)).toBe(true);
    expect(qualifies({ ...base, retest: "PAID_RETEST" })).toBe(false);
    for (const [key, values] of Object.entries({
      payment: ["UNKNOWN", "UNPAID", "REFUNDED"],
      retest: ["UNKNOWN", "FREE_RETEST"],
      completion: ["UNKNOWN", "VOIDED", "CANCELLED", "INCOMPLETE"],
    }))
      for (const value of values) expect(qualifies({ ...base, [key]: value })).toBe(false);
  });
  it("never merges conflicting VINs through a shared plate", () => {
    const bindings = plateBindings([
      { plateHash: "p", vinHash: "a" },
      { plateHash: "p", vinHash: "b" },
    ]);
    expect(vehicleIdentity({ vinHash: "a", plateHash: "p", invalidVin: false }, bindings)).toBe(
      "V:a",
    );
    expect(vehicleIdentity({ vinHash: "b", plateHash: "p", invalidVin: false }, bindings)).toBe(
      "V:b",
    );
    expect(
      vehicleIdentity({ vinHash: null, plateHash: "p", invalidVin: false }, bindings),
    ).toBeNull();
    expect(
      vehicleIdentity({ vinHash: null, plateHash: "unique", invalidVin: true }, bindings),
    ).toBeNull();
    expect(
      vehicleIdentity({ vinHash: null, plateHash: "unique", invalidVin: false }, bindings),
    ).toBe("P:unique");
  });
  it("uses persisted exponential retry due times with a shared-cooldown floor", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    expect(retryDate(1, now, 300000).getTime() - +now).toBe(300000);
    expect(retryDate(5, now).getTime() - +now).toBe(960000);
    expect(retryDate(30, now).getTime() - +now).toBe(3600000);
  });
  it("encrypts original evidence with contextual authentication", () => {
    process.env.BETTER_AUTH_SECRET = "history-test-secret-not-a-real-key-123456789";
    const ciphertext = seal({ VIN: "1HGCM82633A004352" }, "window:1");
    expect(ciphertext).not.toContain("1HGCM82633A004352");
    expect(unseal(ciphertext, "window:1")).toEqual({ VIN: "1HGCM82633A004352" });
    expect(() => unseal(ciphertext, "window:2")).toThrow();
  });
});
