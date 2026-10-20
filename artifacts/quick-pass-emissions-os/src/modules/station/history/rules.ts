import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { TIMEZONE, businessDate } from "@/lib/time";
import { dateString, requiredInteger } from "@/lib/validation";
import { digest, sourceDate } from "../report";
import { requireRule } from "../../phase2";
import { reportMinute } from "../inspection-cadence";

export const jobInput = z.object({
  start: dateString,
  end: dateString,
  stations: z.array(z.string().min(1).max(100)).min(1).max(20),
  mode: z.enum(["PORTAL", "FILE"]),
  source: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_-]{1,60}$/)
    .default("GA_DASHBOARD"),
  recordLimit: requiredInteger(25, 200).default(100),
  timezoneConfirmed: z.literal(true),
});
export function historyRange(start: string, end: string, today = businessDate()) {
  dateString.parse(start);
  dateString.parse(end);
  requireRule(
    start >= "2000-01-01" && end >= start && end <= today,
    "Select dates from 2000 onward, ending by today (America/New_York).",
  );
  return { start, end };
}
export function monthWindows(start: string, end: string) {
  const windows: { start: string; end: string }[] = [];
  let cursor = Temporal.PlainDate.from(start);
  while (cursor.toString() <= end) {
    const last = cursor.with({ day: 1 }).add({ months: 1 }).subtract({ days: 1 }).toString();
    windows.push({ start: cursor.toString(), end: last < end ? last : end });
    cursor = Temporal.PlainDate.from(last).add({ days: 1 });
  }
  return windows;
}
export type RawInspection = {
  fields: Record<string, string>;
  fingerprint?: string;
  extraction?: {
    method: "STRUCTURED" | "EMBEDDED_TEXT" | "OCR";
    confidence: "CONFIRMED" | "UNCERTAIN";
  };
};
const aliases: Record<string, string> = {
  vin: "vin",
  licenseplate: "plate",
  plate: "plate",
  platenumber: "plate",
  state: "state",
  platestate: "state",
  issuingstate: "state",
  testdate: "date",
  inspectiondate: "date",
  date: "date",
  issuedby: "inspector",
  inspector: "inspector",
  certnumber: "certificate",
  certificatenumber: "certificate",
  result: "outcome",
  outcome: "outcome",
  stationid: "station",
  station: "station",
  inspectionid: "sourceId",
  testid: "sourceId",
  recordid: "sourceId",
  sourceid: "sourceId",
  paymentstatus: "payment",
  payment: "payment",
  reteststatus: "retest",
  retest: "retest",
  status: "completion",
  inspectionstatus: "completion",
  completion: "completion",
};
export function columns(fields: Record<string, string>) {
  const result: Record<string, string> = {};
  for (const [header, value] of Object.entries(fields)) {
    const key = aliases[header.toLowerCase().replace(/[^a-z0-9]/g, "")];
    if (!key) continue;
    requireRule(
      !(key in result),
      "Ambiguous columns: supply only one column for each inspection field.",
    );
    result[key] = value.trim();
  }
  return result;
}
// Local validation only: no VIN is sent to an external lookup service.
export function normalizeVin(raw: string) {
  const vin = raw.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z1-9][A-HJ-NPR-Z0-9]{16}$/.test(vin) || /^([A-Z0-9])\1{16}$/.test(vin))
    return null;
  const alphabet = "ABCDEFGHJKLMNPRSTUVWXYZ";
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 7, 9, 2, 3, 4, 5, 6, 7, 8, 9];
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum = [...vin].reduce(
    (n, c, i) => n + (/[0-9]/.test(c) ? Number(c) : values[alphabet.indexOf(c)]) * weights[i],
    0,
  );
  return vin[8] === (sum % 11 === 10 ? "X" : String(sum % 11)) ? vin : null;
}
const states = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI GU AS MP".split(
    " ",
  ),
);
export function normalizePlate(plate: string, state: string) {
  const p = plate.toUpperCase().replace(/[\s-]/g, ""),
    s = state.trim().toUpperCase();
  return /^[A-Z0-9]{1,12}$/.test(p) && states.has(s) ? `${s}:${p}` : null;
}
export function inspectionDate(raw: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return dateString.parse(raw);
  if (/^\d{4}-.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw))
    return Temporal.Instant.from(raw).toZonedDateTimeISO(TIMEZONE).toPlainDate().toString();
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw))
    return Temporal.PlainDateTime.from(raw).toPlainDate().toString();
  return sourceDate(raw);
}
function supplied(value: string | undefined, allowed: string[], label: string) {
  const status = value?.toUpperCase().replace(/[ -]/g, "_") || "UNKNOWN";
  requireRule(
    allowed.includes(status),
    `Unsupported ${label}; use the documented CSV status values.`,
  );
  return status;
}
export function normalizeInspection(raw: RawInspection, stationHash: string, source: string) {
  const c = columns(raw.fields);
  requireRule(
    !c.sourceId || c.sourceId.length <= 200,
    "Inspection ID exceeds 200 characters; obtain a valid source identifier.",
  );
  requireRule(c.date, "Inspection date is missing.");
  if (c.station)
    requireRule(
      digest(c.station) === stationHash || c.station === stationHash,
      "Row belongs to another station.",
    );
  const date = inspectionDate(c.date),
    vin = normalizeVin(c.vin || ""),
    plate = normalizePlate(c.plate || "", c.state || "");
  const uncertain = raw.extraction?.confidence === "UNCERTAIN";
  const invalidVin = (!!c.vin && !vin) || uncertain;
  const payment = supplied(c.payment, ["UNKNOWN", "PAID", "UNPAID", "REFUNDED"], "payment status");
  const retest = supplied(
    c.retest,
    ["UNKNOWN", "INITIAL", "FREE_RETEST", "PAID_RETEST"],
    "retest status",
  );
  const completion = supplied(
    c.completion || (["PASS", "FAIL"].includes(c.outcome?.toUpperCase()) ? "COMPLETED" : undefined),
    ["UNKNOWN", "COMPLETED", "VOIDED", "CANCELLED", "INCOMPLETE"],
    "completion status",
  );
  const legacyFields = [
    c.vin || "",
    c.plate || "",
    c.date,
    c.inspector || "",
    c.certificate || "",
    c.outcome || "",
  ];
  const fingerprint = raw.fingerprint || digest(JSON.stringify(legacyFields));
  const identifying = !!vin || (!!plate && !invalidVin);
  const precise = /\d{1,2}:\d{2}/.test(c.date);
  return {
    fingerprint,
    sourceId: c.sourceId || null,
    source,
    stationHash,
    businessDate: date,
    signature: digest(
      JSON.stringify(Object.entries(raw.fields).sort(([a], [b]) => a.localeCompare(b))),
    ),
    sourceDate: c.date,
    inspector: c.inspector || "",
    outcome: c.outcome || "",
    certificate: c.certificate || "",
    vinHash: vin && !uncertain ? digest(vin) : null,
    plateHash: plate && !uncertain ? digest(plate) : null,
    extractionMethod: raw.extraction?.method || "STRUCTURED",
    identityStatus:
      uncertain || invalidVin || (!vin && !plate)
        ? "NEEDS_REVIEW"
        : vin
          ? "VALID_VIN"
          : "PLATE_STATE",

    invalidVin,
    payment,
    retest,
    completion,
    // Without a stable ID, require identifying, timed evidence before inserting a new canonical row.
    conservativeIdentity: identifying && precise && !!c.outcome,
    normalized: { vin, plate, date },
    original: raw,
  };
}
export function inspectionMatchKey(row: {
  vinHash: string | null;
  plateHash: string | null;
  businessDate: string;
  sourceDate: string;
  inspector: string;
  outcome: string;
  certificate: string;
}) {
  let minute = reportMinute(row.sourceDate);
  if (/^\d{4}-.*T/.test(row.sourceDate)) {
    const time = /(?:Z|[+-]\d{2}:\d{2})$/.test(row.sourceDate)
      ? Temporal.Instant.from(row.sourceDate).toZonedDateTimeISO(TIMEZONE).toPlainTime()
      : Temporal.PlainDateTime.from(row.sourceDate).toPlainTime();
    minute = time.hour * 60 + time.minute;
  }
  return digest(
    JSON.stringify([
      row.vinHash ? `VIN:${row.vinHash}` : `PLATE:${row.plateHash}`,
      row.businessDate,
      minute,
      row.inspector.trim().toUpperCase(),
      row.outcome.trim().toUpperCase(),
      row.certificate.trim().toUpperCase(),
    ]),
  );
}
export function retryDate(attempt: number, now: Date, minimumMs = 0) {
  return new Date(
    now.getTime() +
      Math.max(minimumMs, Math.min(60 * 60_000, 60_000 * 2 ** Math.min(attempt - 1, 6))),
  );
}
