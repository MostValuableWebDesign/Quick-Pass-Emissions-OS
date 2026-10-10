import { currentUser } from "@/lib/access";
import { businessDate } from "@/lib/time";
import { registry } from "@/modules/maintenance/service";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { DemoNotice, RecordId, TextField, Reason, ActiveField } from "@/components/phase3";
import { saveVendor } from "@/app/phase3-actions";
type Vendor = Awaited<ReturnType<typeof registry>>["vendors"][number];
function VendorForm({ vendor: v }: { vendor?: Vendor }) {
  return (
    <ActionForm action={saveVendor} submit={v ? "Update vendor" : "Save verified vendor"}>
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
export default async function Vendors() {
  const actor = await currentUser(),
    data = await registry(actor.id);
  return (
    <>
      <PageHeader
        title="Verified vendors"
        description="Enter contacts checked against business records. Existing assignments retain archived vendor history."
      />
      <DemoNotice demo={data.demo} />
      <section className="card card-body">
        <h2>Add a verified vendor</h2>
        <VendorForm />
      </section>
      <div className="two-columns space-top">
        {data.vendors.map((v) => (
          <section className="card card-body" key={v.id}>
            <h2>
              {v.name} · {v.active ? "active" : "archived"} ·{" "}
              {v.verifiedDate ? "verified" : "verification required"}
            </h2>
            {!v.verifiedDate && (
              <p className="notice">
                Source-provided reference only. Confirm the contact independently before selecting
                this vendor for operational work.
              </p>
            )}
            <details>
              <summary>Edit verified details</summary>
              <VendorForm vendor={v} />
            </details>
          </section>
        ))}
      </div>
    </>
  );
}
