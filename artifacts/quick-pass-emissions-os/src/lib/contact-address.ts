import { z } from "zod";
import { optionalDate } from "./validation";
import { isValidContactPhone } from "./contact-phone";

export const contactPhoneInput = z
  .string()
  .trim()
  .max(50)
  .refine(isValidContactPhone, "Enter a valid phone number.");

export const requiredContactPhoneInput = z
  .string()
  .trim()
  .min(1, "Phone number is required.")
  .max(50)
  .refine(isValidContactPhone, "Enter a valid phone number.");

export const addressInputShape = {
  addressProof: z.string().max(5000).optional(),
  streetAddress: z.string().trim().max(1000).optional(),
  addressLine2: z.string().trim().max(160).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
};

export type ContactAddress = {
  addressSource?: string;
  addressProviderId?: string;
  streetAddress?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

export function formatContactAddress(address: ContactAddress) {
  const locality = [address.city, [address.state, address.postalCode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [address.streetAddress, address.addressLine2, locality].filter(Boolean).join("\n");
}

export const contactEmployeeInput = z.object({
  name: z.string().trim().min(1).max(160),
  phone: contactPhoneInput,
  jobRole: z.string().trim().min(1, "Enter the employee's role.").max(160),
  ...addressInputShape,
  certificationExpires: optionalDate.optional(),
});

export const addressKeys = [
  "streetAddress",
  "addressLine2",
  "city",
  "state",
  "postalCode",
] as const;
export const baseAddressKeys = ["streetAddress", "city", "state", "postalCode"] as const;
export const usStates = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["DC", "District of Columbia"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
] as const;
export type AddressSuggestion = {
  id: string;
  label: string;
  address: Required<Pick<ContactAddress, "streetAddress" | "city" | "state" | "postalCode">>;
  proof: string;
};
