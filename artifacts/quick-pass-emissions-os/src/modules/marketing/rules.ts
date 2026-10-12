import { z } from "zod";
import { addDays } from "@/lib/time";
import { dateString, requiredInteger } from "@/lib/validation";

export const channels = [
  "GOOGLE",
  "SOCIAL",
  "FLYERS",
  "REFERRALS",
  "DEALERSHIPS",
  "OTHER",
] as const;
export const sources = [
  "GOOGLE",
  "DRIVE_BY",
  "REFERRAL",
  "DEALERSHIP",
  "SOCIAL",
  "FLYER",
  "RETURNING",
  "OTHER",
  "UNKNOWN",
] as const;
export const sourceLabels: Record<(typeof sources)[number], string> = {
  GOOGLE: "Google Search / Maps",
  DRIVE_BY: "Drive-by",
  REFERRAL: "Referral",
  DEALERSHIP: "Dealership",
  SOCIAL: "Social media",
  FLYER: "Flyer",
  RETURNING: "Returning customer",
  OTHER: "Other",
  UNKNOWN: "Unknown",
};
export const cents = requiredInteger(0, 2147483647);
export const version = requiredInteger(0, 2147483647).default(0);
export const label = z.string().trim().min(1).max(160);
export const notes = z.string().trim().max(2000).default("");
export function decimalHundredths(value: unknown) {
  const str = z
    .string()
    .trim()
    .regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter a non-negative amount with at most two decimals.")
    .parse(value);
  const [whole, fraction = ""] = str.split(".");
  return cents.parse(Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))));
}
export const optionalId = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => v || undefined);
export const stationList = z
  .array(z.string().min(1).max(100))
  .min(1)
  .max(20)
  .refine((v) => new Set(v).size === v.length, "Choose each station once.");
export const campaignInput = z
  .object({
    id: optionalId,
    version,
    name: label,
    channel: z.enum(channels),
    stationHashes: stationList,
    startDate: dateString,
    endDate: dateString,
    offer: notes,
    budgetCents: cents,
    status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]),
  })
  .refine((v) => v.endDate >= v.startDate, "End date must follow start date.");
export const promoInput = z
  .object({
    id: optionalId,
    version,
    campaignId: z.string().min(1).max(100),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{2,29}$/, "Use 3–30 letters, numbers, hyphens or underscores."),
    kind: z.enum(["FIXED", "PERCENT"]),
    value: requiredInteger(1, 2147483647),
    startDate: dateString,
    endDate: dateString,
    stationHashes: stationList,
    usageLimit: requiredInteger(1, 1000000),
    active: z.boolean().default(true),
  })
  .refine((v) => v.endDate >= v.startDate, "End date must follow start date.")
  .refine(
    (v) => v.kind !== "PERCENT" || v.value <= 10000,
    "Percentage must be at most 100% (10,000 basis points).",
  );

/** All currency arithmetic is integral cents; percentages round half up once. */
export function discountCents(base: number, kind: string, value: number) {
  for (const n of [base, value])
    if (!Number.isSafeInteger(n) || n < 0 || n > 2147483647) throw new Error("Invalid amount.");
  if (!["FIXED", "PERCENT"].includes(kind) || (kind === "PERCENT" && value > 10000))
    throw new Error("Invalid discount.");
  const amount = kind === "FIXED" ? BigInt(value) : (BigInt(base) * BigInt(value) + 5000n) / 10000n;
  return Number(amount > BigInt(base) ? BigInt(base) : amount);
}
export function sumMoney(values: number[]) {
  const total = values.reduce((s, v) => s + BigInt(v), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER))
    throw new Error("Amount exceeds reporting limit.");
  return Number(total);
}
/** Proportional net-of-tax line receipts. Remainders remain unallocated, never duplicated. */
export function lineReceipts(lineCents: number, invoiceTotal: number, netReceived: number) {
  if (!invoiceTotal) return 0;
  const capped = Math.min(invoiceTotal, Math.max(0, netReceived));
  return Number((BigInt(lineCents) * BigInt(capped)) / BigInt(invoiceTotal));
}
export function inspectionKind(
  row: { id: string; date: string; time: string; vin: string; outcome: string },
  history: { id: string; date: string; time: string; vin: string; outcome: string }[],
  completeDates: Set<string>,
) {
  if (!["PASS", "FAIL"].includes(row.outcome.toUpperCase())) return "OTHER";
  if (!row.vin) return "UNKNOWN";
  const ordered = history.filter(
    (r) =>
      r.vin === row.vin &&
      r.id !== row.id &&
      (r.date < row.date ||
        (r.date === row.date && (r.time < row.time || (r.time === row.time && r.id < row.id)))) &&
      r.date >= addDays(row.date, -30),
  );
  if (ordered.length) return "FREE";
  for (let i = 1; i <= 30; i++) if (!completeDates.has(addDays(row.date, -i))) return "UNKNOWN";
  return "PAID";
}
export function promoAllowed(
  promo: {
    active: boolean;
    startDate: string;
    endDate: string;
    stationHashes: unknown;
    usageLimit: number;
  },
  campaign: { status: string; startDate: string; endDate: string; stationHashes: unknown },
  date: string,
  stationHash: string,
  used: number,
) {
  return (
    promo.active &&
    campaign.status === "ACTIVE" &&
    date >= promo.startDate &&
    date <= promo.endDate &&
    date >= campaign.startDate &&
    date <= campaign.endDate &&
    Array.isArray(promo.stationHashes) &&
    promo.stationHashes.includes(stationHash) &&
    Array.isArray(campaign.stationHashes) &&
    campaign.stationHashes.includes(stationHash) &&
    used < promo.usageLimit
  );
}
