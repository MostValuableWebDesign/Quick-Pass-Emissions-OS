import type { Vendor } from "@prisma/client";
import { businessDate } from "@/lib/time";
import { ActionForm, Field } from "@/components/action-form";
import { RecordId, TextField, Reason, ActiveField } from "@/components/phase3";
import { saveVendor } from "@/app/phase3-actions";
/** Legacy verified-contact form (saveVendor). Owner/Admin only; render only for management. */
export function VendorForm({ vendor: v }: { vendor?: Vendor }) {
  return (
    <ActionForm action={saveVendor} submit={v ? "Update verified contact" : "Save verified vendor"}>
      <RecordId id={v?.id} version={v?.version} />
      <TextField name="name" label="Vendor name" value={v?.name} />
      <TextField name="contact" label="Verified contact person / department" value={v?.contact} />
      <TextField
        name="phone"
        label="Verified phone · phone or email required"
        value={v?.phone}
        required={false}
      />
      <Field label="Verified email · phone or email required">
        <input type="email" name="email" defaultValue={v?.email} maxLength={254} />
      </Field>
      <TextField name="services" label="Services provided" value={v?.services} area />
      <TextField
        name="reference"
        label="Business reference / contact verification evidence"
        value={v?.reference}
      />
      <Field label="Contact verification date">
        <input
          type="date"
          name="verifiedDate"
          defaultValue={v?.verifiedDate ?? ""}
          max={businessDate()}
          required
        />
      </Field>
      <ActiveField active={v?.active} />
      <TextField name="notes" label="Vendor notes" value={v?.notes} required={false} area />
      <Reason />
    </ActionForm>
  );
}
