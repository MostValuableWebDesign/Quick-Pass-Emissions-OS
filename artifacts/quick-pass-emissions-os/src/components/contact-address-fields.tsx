import { Field } from "./action-form";
import type { ContactAddress } from "@/lib/contact-address";

export function ContactAddressFields({
  value = {},
  label = "Address",
  requiredStreet = false,
}: {
  value?: ContactAddress;
  label?: string;
  requiredStreet?: boolean;
}) {
  return (
    <fieldset className="contact-address-fields wide">
      <legend>{label}</legend>
      <div className="form-grid">
        <Field label="Street address" wide>
          <textarea name="streetAddress" autoComplete="address-line1" rows={2}
            maxLength={1000} required={requiredStreet} defaultValue={value.streetAddress} />
        </Field>
        <Field label="Apartment, suite or unit (optional)" wide>
          <input name="addressLine2" autoComplete="address-line2" maxLength={160} defaultValue={value.addressLine2} />
        </Field>
        <Field label="City">
          <input name="city" autoComplete="address-level2" maxLength={100} defaultValue={value.city} />
        </Field>
        <Field label="State">
          <input name="state" autoComplete="address-level1" maxLength={100} defaultValue={value.state} />
        </Field>
        <Field label="ZIP / postal code">
          <input name="postalCode" autoComplete="postal-code" maxLength={20} defaultValue={value.postalCode} />
        </Field>
      </div>
    </fieldset>
  );
}
