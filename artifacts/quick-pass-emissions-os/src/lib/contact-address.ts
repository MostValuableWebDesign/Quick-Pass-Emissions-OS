import { z } from "zod";
import { optionalDate } from "./validation";

export const addressInputShape = {
  streetAddress: z.string().trim().max(1000).optional(),
  addressLine2: z.string().trim().max(160).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
};

export type ContactAddress = {
  streetAddress?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

export function formatContactAddress(address: ContactAddress) {
  const locality = [
    address.city,
    [address.state, address.postalCode].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
  return [address.streetAddress, address.addressLine2, locality].filter(Boolean).join("\n");
}

export const contactEmployeeInput = z.object({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(50),
  jobRole: z.string().trim().min(1, "Enter the employee's role.").max(160),
  ...addressInputShape,
  certificationExpires: optionalDate.optional(),
});
