import { CONTACT_PHONE_PATTERN, CONTACT_PHONE_TITLE } from "@/lib/contact-phone";
import { Field } from "./action-form";

export function ContactPhoneField({
  label = "Phone",
  value = "",
  required = false,
}: {
  label?: string;
  value?: string | null;
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        maxLength={50}
        placeholder="(404) 555-0123"
        pattern={CONTACT_PHONE_PATTERN}
        title={CONTACT_PHONE_TITLE}
        required={required}
        defaultValue={value ?? ""}
      />
    </Field>
  );
}
