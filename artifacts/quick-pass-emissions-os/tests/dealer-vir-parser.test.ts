import { describe, expect, it } from "vitest";
import {
  parseVirPage,
  virReportKey,
  virReviewSchema,
} from "../src/modules/finance/dealer-vir-parser";

const report = (edits = "") => `GEORGIA VEHICLE EMISSIONS INSPECTION REPORT
REPRINT
OVERALL TEST RESULT: PASS
CERTIFICATE NUMBER: ZZ123456
Test Date/Time: 10/01/2026 @ 11:49 Test Type: Initial Test Fee: $20.00
VIN: 1M8GDM9AXKP042788 Test ID: 91106999999
${edits}`;

describe("dealer VIR parsing", () => {
  it("extracts the labelled VIN and safe billing fields without retaining OCR text", () => {
    const row = parseVirPage(report(), "PDF 1 · Page 1", "TEXT");
    expect(row).toMatchObject({
      date: "2026-10-01",
      vin: "1M8GDM9AXKP042788",
      minute: 709,
      certificate: "ZZ123456",
      testNumber: "91106999999",
      outcome: "PASS",
      testType: "INITIAL",
      feeCents: 2000,
      freeRetest: false,
      duplicate: false,
    });
    expect(row.vinHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.vin).toBe("1M8GDM9AXKP042788");
    expect(JSON.stringify(row)).not.toContain("GEORGIA VEHICLE");
    expect(row.warnings).toEqual([]);
  });

  it("does not confuse a reprint with a retest", () => {
    expect(parseVirPage(report(), "p1", "TEXT").freeRetest).toBe(false);
  });

  it("recognizes a literal RETEST certificate and a zero fee", () => {
    const row = parseVirPage(
      report().replace("ZZ123456", "RETEST").replace("$20.00", "$0.00"),
      "p1",
      "OCR",
      90,
    );
    expect(row.freeRetest).toBe(true);
    expect(row.reportKey).toEqual(virReportKey("RETEST", "91106999999"));
    expect(row.confidence).toBe(90);
  });

  it("requires a real identifier rather than treating RETEST as a unique number", () => {
    expect(virReportKey("RETEST", "")).toBeNull();
    expect(virReportKey("ZZ123456", "")).not.toBeNull();
    expect(virReportKey("", "91106999999")).not.toBeNull();
  });

  it("warns about damaged scan fields rather than inventing a date or result", () => {
    const row = parseVirPage(
      "GEORGIA VEHICLE EMISSIONS INSPECTION REPORT TestDate/Time: 1010112026",
      "p1",
      "OCR",
      55,
    );
    expect(row).toMatchObject({
      date: "",
      certificate: "",
      testNumber: "",
      outcome: "UNKNOWN",
      feeCents: null,
      vinHash: null,
    });
    expect(row.warnings.length).toBeGreaterThan(3);
    expect(row.warnings.join(" ")).toContain("Low OCR confidence");
  });

  it("rejects impossible dates without silently rolling them into another month", () => {
    const row = parseVirPage(report().replace("10/01/2026", "02/31/2026"), "p1", "TEXT");
    expect(row.date).toBe("");
  });

  it("accepts damaged VIN check digits without excluding the provider's inspection", () => {
    const row = parseVirPage(
      report().replace("1M8GDM9AXKP042788", "1M8GDM9A0KP042788"),
      "p1",
      "TEXT",
    );
    expect(row.vinHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.outcome).toBe("PASS");
  });

  it("does not invent a VIN when the report does not contain one", () => {
    const row = parseVirPage(report().replace("VIN: 1M8GDM9AXKP042788", ""), "p1", "TEXT");
    expect(row.vin).toBe("");
    expect(row.vinHash).toBeNull();
  });

  it("keeps a provider-printed nonstandard VIN without check-digit validation", () => {
    const row = parseVirPage(report().replace("1M8GDM9AXKP042788", "BADVIN"), "p1", "TEXT");
    expect(row.vin).toBe("BADVIN");
    expect(row.vinHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.warnings).not.toContain(
      "VIN could not be read reliably. Verify the free-retest status manually.",
    );
  });

  it("requires explicit review input and constrains batch size", () => {
    expect(
      virReviewSchema.safeParse({
        rows: [],
        uploadId: "x",
        dealershipId: "y",
        createDraft: true,
        invoiceNumber: "",
        issueDate: "2026-10-01",
      }).success,
    ).toBe(false);
  });
});
