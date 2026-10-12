import { z } from "zod";
import { dateString, timeString, id } from "../../lib/validation";
export const reason = z.string().trim().min(1).max(2000);
export const label = z.string().trim().min(1).max(160);
export const notes = z.string().trim().max(2000).default("");
export const optionalId = z
  .union([id, z.literal("")])
  .nullable()
  .optional()
  .transform((v) => v || null);
export const version = z.coerce.number().int().min(0).max(2000000000);
export const cents = z.coerce.number().int().min(0).max(2000000000);
export const optionalCents = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  cents.nullable(),
);
export const priority = z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]);
export const target = { bayId: optionalId, equipmentId: optionalId };
export const oneTarget = (v: { bayId: string | null; equipmentId: string | null }) =>
  !!v.bayId !== !!v.equipmentId;
export const status = z.enum([
  "OPERATIONAL",
  "MAINTENANCE_REQUIRED",
  "OUT_OF_SERVICE",
  "UNDER_REPAIR",
]);
export const layoutInput = z
  .object({ identifiers: z.array(label).length(6), reason })
  .refine(
    (v) => new Set(v.identifiers.map((i) => i.toLowerCase())).size === 6,
    "Bay identifiers must be distinct.",
  );
export const bayInput = z.object({
  id,
  version,
  status,
  identifier: label.optional(),
  responsibleId: optionalId,
  notes,
  reason,
});
export const vendorReferenceInput = z
  .object({
    id: optionalId,
    version,
    name: label,
    contact: z.string().trim().max(160),
    phone: z.string().trim().max(50),
    email: z.union([z.email().max(254), z.literal("")]),
    services: reason,
    reference: z.string().trim().max(160),
    verifiedDate: dateString.nullable(),
    notes,
    active: z.boolean(),
    reason,
  })
  .refine(
    (v) => !v.verifiedDate || (!!v.contact && !!v.reference && (!!v.phone || !!v.email)),
    "Verified vendors need contact, source reference and phone or email.",
  );
export const vendorInput = vendorReferenceInput.refine(
  (v) => !!v.verifiedDate,
  "Enter a contact verification date.",
);
export const unverifiedVendorInput = z.object({
  name: label,
  phone: z.string().trim().min(1, "Phone number is required.").max(50),
  contact: z.string().trim().max(160).default(""),
  email: z.union([z.email().max(254), z.literal("")]).default(""),
  services: z.string().trim().max(2000).default(""),
  reference: z.string().trim().max(160).default(""),
  notes,
});
export const equipmentInput = z.object({
  id: optionalId,
  version,
  name: label,
  category: z.enum([
    "ANALYZER",
    "KIOSK",
    "PUMP",
    "HOSE",
    "BRUSH",
    "NOZZLE",
    "DISPENSER",
    "DRAIN_PIT",
    "PROPERTY",
    "OTHER",
  ]),
  bayId: optionalId,
  vendorId: optionalId,
  model: z.string().trim().max(160).optional(),
  serial: z.string().trim().max(160).optional(),
  notes,
  active: z.boolean().optional(),
  reason: z.string().trim().max(2000).optional(),
});
export const ticketInput = z
  .object({
    ...target,
    title: label,
    description: reason,
    priority,
    targetDate: dateString,
    assignedId: optionalId,
    vendorId: optionalId,
  })
  .refine(oneTarget, "Choose either a bay or equipment item.");
export const planInput = z
  .object({
    ...target,
    id: optionalId,
    version,
    title: label,
    instructions: reason,
    employeeId: id,
    intervalDays: z.coerce.number().int().min(1).max(3650),
    nextDueDate: dateString,
    dueTime: timeString,
    priority,
    active: z.boolean(),
    reason,
  })
  .refine(oneTarget, "Choose either a bay or equipment item.");
