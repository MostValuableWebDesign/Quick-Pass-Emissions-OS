import { Field } from "./action-form";
export function DemoNotice({ demo }: { demo: boolean }) {
  return demo ? (
    <div className="notice warning">
      DEMONSTRATION WORKSPACE · Illustrative records. Confirm actual business information before
      use.
    </div>
  ) : null;
}
export function RecordId({ id, version = 0 }: { id?: string; version?: number }) {
  return (
    <>
      <input name="id" type="hidden" value={id ?? ""} />
      <input name="version" type="hidden" value={version} />
    </>
  );
}
export function TextField({
  label,
  name,
  value = "",
  required = true,
  area = false,
  wide = false,
}: {
  label: string;
  name: string;
  value?: string;
  required?: boolean;
  area?: boolean;
  wide?: boolean;
}) {
  return (
    <Field label={label} wide={wide}>
      {area ? (
        <textarea name={name} defaultValue={value} maxLength={2000} required={required} />
      ) : (
        <input name={name} defaultValue={value} maxLength={160} required={required} />
      )}
    </Field>
  );
}
export function Reason({ label = "Change reason" }: { label?: string }) {
  return <TextField name="reason" label={label} area />;
}
export function SelectField({
  label,
  name,
  options,
  value = "",
  empty = "Not assigned",
}: {
  label: string;
  name: string;
  options: { id: string; name: string }[];
  value?: string | null;
  empty?: string;
}) {
  return (
    <Field label={label}>
      <select name={name} defaultValue={value ?? ""}>
        <option value="">{empty}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function ActiveField({ active = true }: { active?: boolean }) {
  return (
    <Field label="Record status">
      <select name="active" defaultValue={String(active)}>
        <option value="true">Active</option>
        <option value="false">Archived / paused</option>
      </select>
    </Field>
  );
}
export function PriorityField({ value = "NORMAL" }: { value?: string }) {
  return (
    <Field label="Priority">
      <select name="priority" defaultValue={value}>
        {["LOW", "NORMAL", "HIGH", "CRITICAL"].map((v) => (
          <option key={v} value={v}>
            {v.toLowerCase()}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function TargetFields({
  bays,
  equipment,
  bayId,
  equipmentId,
}: {
  bays: { id: string; identifier: string }[];
  equipment: { id: string; name: string }[];
  bayId?: string | null;
  equipmentId?: string | null;
}) {
  return (
    <>
      <SelectField
        name="bayId"
        label="Bay · choose a bay or equipment"
        options={bays.map((b) => ({ id: b.id, name: b.identifier }))}
        value={bayId}
        empty="No bay target"
      />
      <SelectField
        name="equipmentId"
        label="Equipment · choose a bay or equipment"
        options={equipment}
        value={equipmentId}
        empty="No equipment target"
      />
    </>
  );
}
export function Money({ cents }: { cents: number | null }) {
  if (cents === null) return <>Not recorded</>;
  const amount = BigInt(Math.abs(cents));
  return (
    <>{`${cents < 0 ? "-" : ""}$${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")} USD`}</>
  );
}
