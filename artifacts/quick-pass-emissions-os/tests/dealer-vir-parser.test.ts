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
  it("extracts safe billing fields but never retains OCR text or a raw VIN", () => {
    const row = parseVirPage(report(), "PDF 1 · Page 1", "TEXT");
    expect(row).toMatchObject({
      date: "2026-10-01",
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
    expect(JSON.stringify(row)).not.toContain("1M8GDM9AXKP042788");
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
