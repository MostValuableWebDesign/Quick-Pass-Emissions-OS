import { ContactAddressFields } from "./contact-address-fields";
import type { Vendor } from "@prisma/client";
import { businessDate } from "@/lib/time";
import { ActionForm, Field } from "@/components/action-form";
import { ContactPhoneField } from "@/components/contact-phone-field";
import { RecordId, TextField, Reason, ActiveField } from "@/components/phase3";
import { addUnverifiedVendor, saveVendor, saveVendorAddress } from "@/app/phase3-actions";
/** Owner/Admin vendor add and verified-contact edit forms. */
export function VendorForm({ vendor: v }: { vendor?: Vendor }) {
  if (!v) {
    return (
      <ActionForm action={addUnverifiedVendor} submit="Add vendor">
        <TextField name="name" label="Vendor name" />
        <ContactPhoneField label="Phone number" required />
        <TextField name="contact" label="Contact person / department (optional)" required={false} />
        <Field label="Email (optional)">
          <input
            type="email"
            name="email"
            maxLength={254}
            placeholder="name@vendor.com"
            title="Enter a valid email address."
          />
        </Field>
        <TextField
          name="services"
          label="Services provided (optional)"
          required={false}
          area
          wide
        />
        <TextField name="reference" label="Reference (optional)" required={false} />
        <ContactAddressFields />
        <TextField name="notes" label="Notes (optional)" required={false} area wide />
      </ActionForm>
    );
  }

  return (
    <>
      <ActionForm action={saveVendor} submit="Update verified contact">
        <RecordId id={v.id} version={v.version} />
        <TextField name="name" label="Vendor name" value={v.name} />
        <TextField name="contact" label="Verified contact person / department" value={v.contact} />
        <ContactPhoneField label="Verified phone · phone or email required" value={v.phone} />
        <Field label="Verified email · phone or email required">
          <input
            type="email"
            name="email"
            defaultValue={v.email}
            maxLength={254}
            placeholder="name@vendor.com"
            title="Enter a valid email address."
          />
        </Field>
        <TextField name="services" label="Services provided" value={v.services} area />
        <TextField
          name="reference"
          label="Business reference / contact verification evidence"
          value={v.reference}
        />
        <Field label="Contact verification date">
          <input
            type="date"
            name="verifiedDate"
            defaultValue={v.verifiedDate ?? ""}
            max={businessDate()}
            required
          />
        </Field>
        <ActiveField active={v.active} />
        <TextField name="notes" label="Vendor notes" value={v.notes} required={false} area />
        <Reason />
      </ActionForm>
      <h3 className="space-top">Vendor address</h3>
      <ActionForm action={saveVendorAddress} submit="Save vendor address">
        <RecordId id={v.id} version={v.version} />
        <ContactAddressFields value={v} />
      </ActionForm>
    </>
  );
}
