import { z } from "zod";
import { dateString, id } from "@/lib/validation";
import { notes, optionalId, reason, version } from "../maintenance/validation";
export const CATEGORIES = [
  "Analyzer Service & Technical Support",
  "Drain Pit Maintenance",
  "Carwash Equipment Service",
  "Camera & Security Support",
  "Wash Parts Supply",
  "Belt Repair",
] as const;
export const category = z.enum(CATEGORIES);
export function phoneLink(raw: string): string | null {
  if (!/^\+?[\d\s().-]+$/.test(raw.trim())) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `tel:${raw.trim().startsWith("+") ? "+" : ""}${digits}`;
}
export function emailLink(raw: string): string | null {
  return z.email().safeParse(raw).success ? `mailto:${raw}` : null;
}
export function externalLink(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
const phone = z
  .string()
  .trim()
  .max(50)
  .refine((v) => !v || !!phoneLink(v), "Use a phone number without an extension.");
const email = z.union([z.email().max(254), z.literal("")]);
const url = z
  .string()
  .trim()
  .max(500)
  .refine((v) => !v || !!externalLink(v), "Use an HTTP or HTTPS URL without credentials.");
const extension = z.string().trim().max(12).regex(/^\d*$/, "Extension must contain digits only.");
const label = z.string().trim().max(160);
export const directoryFields = z
  .object({
    categories: z
      .array(category)
      .max(CATEGORIES.length)
      .refine((v) => new Set(v).size === v.length),
    extension,
    alternateContact: label,
    alternatePhone: phone,
    alternateExtension: extension,
    alternateEmail: email,
    website: url,
    supportUrl: url,
    hours: notes,
    emergencyDetails: notes,
    emergencyPhone: phone,
    operationalInstructions: notes,
    supportedServices: notes,
    sourceReference: label,
    lastConfirmedDate: dateString.nullable(),
    accountReference: label,
  })
  .strict();
// Import never supplies confirmation, preferences or physical assignments.
export const sourceDirectory = directoryFields.omit({ lastConfirmedDate: true }).partial();
export const saveInput = directoryFields.extend({ id, version, reason }).strict();
export const preferenceInput = z
  .object({ category, vendorId: optionalId, version, reason })
  .strict();
export const associationInput = z
  .object({
    vendorId: id,
    version,
    equipmentId: optionalId,
    bayId: optionalId,
    remove: z.boolean(),
    reason,
  })
  .strict()
  .refine((v) => !!v.equipmentId !== !!v.bayId, "Choose one equipment item or bay.");
export const ticketProviderInput = z.object({ id, version, vendorId: optionalId, reason }).strict();
export const statusInput = z.object({ id, version, active: z.boolean(), reason }).strict();
export const historyInput = z
  .object({
    vendorId: id,
    contactedAt: z.iso.datetime({ offset: true }),
    method: z.enum(["PHONE", "EMAIL", "PORTAL", "IN_PERSON", "OTHER"]),
    equipmentId: optionalId,
    ticketId: optionalId,
    outcome: notes,
    reference: label,
    followUpDate: dateString.nullable(),
  })
  .strict();
