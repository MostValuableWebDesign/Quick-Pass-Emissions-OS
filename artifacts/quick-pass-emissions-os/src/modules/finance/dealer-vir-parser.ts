import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { dateString } from "@/lib/validation";
import type { DealerVirRow } from "./dealer-vir-types";

export type StoredVirRow = DealerVirRow & {
  vinHash: string | null;
  reportKey: string | null;
  minute: number | null;
  sourceKey: string;
};

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const cleanVirIdentifier = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function virReportKey(certificate: string, testNumber: string) {
  const cert = cleanVirIdentifier(certificate);
  const number = cleanVirIdentifier(testNumber);
  // RETEST is a literal on some free inspection reports, not a unique certificate.
  if (/^[A-Z]{1,4}\d{5,12}$/.test(cert)) return hash(`GCAF:CERT:${cert}`);
  if (/^\d{8,18}$/.test(number)) return hash(`GCAF:TEST:${number}`);
  return null;
}

export const virTestKey = (testNumber: string) => {
  const number = cleanVirIdentifier(testNumber);
  return /^\d{8,18}$/.test(number) ? hash(`GCAF:TEST:${number}`) : null;
};

export function parseVirPage(
  text: string,
  source: string,
  method: "TEXT" | "OCR",
  confidence = 100,
): StoredVirRow {
  // Only parse labelled fields; never retain full report text or a raw VIN.
  const normalized = text.replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  const isVir = /GEORGIA\s+VEHICLE\s+EMISSIONS\s+INSPECTION\s+REPORT/i.test(normalized);
  const certMatch = normalized.match(/CERTIFICATE\s*NUMBER\s*[:#]?\s*([A-Z0-9-]+)/i);
  const testMatch = normalized.match(/\bTest\s*ID\s*[:#]?\s*([\d ]{8,24})/i);
  const dateMatch = normalized.match(
    /Test\s*Date\s*\/?\s*Time\s*[:.]?\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})/i,
  );
  const dateCandidate = dateMatch
    ? `${dateMatch[3]}-${dateMatch[1].padStart(2, "0")}-${dateMatch[2].padStart(2, "0")}`
    : "";
  const date = dateString.safeParse(dateCandidate).success ? dateCandidate : "";
  const time = normalized.match(/Test\s*Date\s*\/?\s*Time.{0,30}[@]\s*(\d{1,2})\s*:\s*(\d{2})/i);
  const minute =
    time && Number(time[1]) < 24 && Number(time[2]) < 60
      ? Number(time[1]) * 60 + Number(time[2])
      : null;
  const outcome = normalized
    .match(/OVERALL\s*TEST\s*RESULT\s*:\s*(PASS|FAIL|ABORT)/i)?.[1]
    .toUpperCase() as DealerVirRow["outcome"] | undefined;
  const testTypeMatch = normalized.match(/Test\s*Type\s*:\s*(Initial|Re[\s-]?test)/i)?.[1];
  const feeMatch = normalized.match(/Test\s*Fee\s*:\s*[$S]?\s*(\d{1,3})[.,](\d{2})/i);
  const feeCents = feeMatch ? Number(feeMatch[1]) * 100 + Number(feeMatch[2]) : null;
  const vin = normalized.match(/\bVIN\s*:\s*([A-Z0-9]{17})\b/i)?.[1].toUpperCase() ?? null;
  const certificate = cleanVirIdentifier(certMatch?.[1] ?? "");
  const testNumber = cleanVirIdentifier(testMatch?.[1] ?? "");
  const testType = testTypeMatch
    ? /initial/i.test(testTypeMatch)
      ? "INITIAL"
      : "RETEST"
    : "UNKNOWN";
  const warnings: string[] = [];
  if (!isVir)
    warnings.push("Georgia VIR heading not verified. Check this page before including it.");
  if (!date) warnings.push("Enter the inspection date from the original report.");
  if (!outcome) warnings.push("Select the result from the original report.");
  if (!virReportKey(certificate, testNumber))
    warnings.push("Enter a readable certificate number or Test ID to prevent duplicate billing.");
  if (!vin)
    warnings.push("VIN could not be read reliably. Verify the free-retest status manually.");
  if (feeCents === null)
    warnings.push("Printed test fee could not be read. Verify the billing choice.");
  if (testType === "UNKNOWN") warnings.push("Verify the test type.");
  if (method === "OCR")
    warnings.push("Scanned report: compare these fields with the original PDF.");
  if (confidence < 80) warnings.push("Low OCR confidence. Carefully verify every included field.");
  return {
    id: randomUUID(),
    source,
    date,
    certificate,
    testNumber,
    outcome: outcome ?? "UNKNOWN",
    testType,
    feeCents,
    confidence: Math.round(confidence),
    method,
    warnings,
    duplicate: false,
    freeRetest: feeCents === 0 || certificate === "RETEST",
    vinHash: vin ? hash(vin) : null,
    reportKey: virReportKey(certificate, testNumber),
    minute,
    sourceKey: hash(`VIR:PAGE:${normalized}`),
  };
}

export const virReviewSchema = z.object({
  uploadId: z.string().min(1).max(64),
  dealershipId: z.string().min(1).max(64),
  createDraft: z.boolean(),
  invoiceNumber: z.string().trim().max(160),
  issueDate: dateString,
  rows: z
    .array(
      z.object({
        id: z.string().uuid(),
        date: z.string().max(10),
        certificate: z.string().trim().max(40),
        testNumber: z.string().trim().max(24),
        outcome: z.enum(["PASS", "FAIL", "ABORT", "UNKNOWN"]),
        testType: z.enum(["INITIAL", "RETEST", "UNKNOWN"]),
        billing: z.enum(["BILL", "FREE", "EXCLUDE"]),
        confirmed: z.boolean(),
      }),
    )
    .min(1)
    .max(40),
});
