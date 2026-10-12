import type { Dealership } from "@prisma/client";
import { Field } from "./action-form";
import { ContactAddressFields } from "./contact-address-fields";
import { ContactPhoneField } from "./contact-phone-field";

export function DealershipFields({ dealer }: { dealer?: Dealership }) {
  return (
    <>
      <Field label="Dealership name">
        <input
          name="name"
          autoComplete="organization"
          required
          maxLength={160}
          defaultValue={dealer?.name}
        />
      </Field>
      <ContactPhoneField value={dealer?.phone} />
      <Field label="Email">
        <input
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          title="Enter a valid email address."
          defaultValue={dealer?.email}
        />
      </Field>
      <ContactAddressFields
        label="Billing address"
        requiredStreet
        value={
          dealer
            ? { ...dealer, streetAddress: dealer.streetAddress || dealer.billingAddress }
            : undefined
        }
      />
      <Field label="Additonal comments" wide>
        <textarea name="notes" rows={3} maxLength={4000} defaultValue={dealer?.notes} />
      </Field>
    </>
  );
}
