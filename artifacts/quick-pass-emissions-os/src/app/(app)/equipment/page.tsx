import { currentUser } from "@/lib/access";
import { formatDate } from "@/lib/time";
import { registry } from "@/modules/maintenance/service";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import {
  DemoNotice,
  RecordId,
  TextField,
  Reason,
  SelectField,
  ActiveField,
} from "@/components/phase3";
import { saveEquipment, equipmentDowntime } from "@/app/phase3-actions";
type Data = Awaited<ReturnType<typeof registry>>;
function EquipmentForm({ data, e }: { data: Data; e?: Data["equipment"][number] }) {
  return (
    <ActionForm action={saveEquipment} submit={e ? "Update equipment" : "Register equipment"}>
      <RecordId id={e?.id} version={e?.version} />
      <TextField label="Unique equipment code" name="code" value={e?.code} />
      <TextField label="Equipment name" name="name" value={e?.name} />
      <Field label="Equipment category">
        <select name="category" defaultValue={e?.category}>
          {[
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
          ].map((c) => (
            <option key={c} value={c}>
              {c.toLowerCase().replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </Field>
      <SelectField
        name="bayId"
        label="Equipment location"
        options={data.bays.map((b) => ({ id: b.id, name: b.identifier }))}
        value={e?.bayId}
        empty="Shared / property equipment"
      />
      <SelectField
        name="vendorId"
        label="Service vendor"
        options={data.vendors.filter((v) => v.active)}
        value={e?.vendorId}
      />
      <TextField name="model" label="Model · optional" value={e?.model} required={false} />
      <TextField
        name="serial"
        label="Serial number · optional"
        value={e?.serial}
        required={false}
      />
      <TextField name="notes" label="Equipment notes" value={e?.notes} required={false} area />
      <ActiveField active={e?.active} />
      <Reason />
    </ActionForm>
  );
}
export default async function Equipment() {
  const actor = await currentUser(),
    data = await registry(actor.id);
  return (
    <>
      <PageHeader
        title="Equipment registry"
        description="Bay equipment, analyzer, kiosk, drain pits, and property assets."
      />
      <DemoNotice demo={data.demo} />
      <section className="card card-body">
        <h2>Register an asset</h2>
        <EquipmentForm data={data} />
      </section>
      <div className="two-columns space-top">
        {data.equipment.map((e) => {
          const down = e.downtime.find((d) => !d.endedAt);
          return (
            <section className="card card-body" key={e.id}>
              <h2>
                {e.code} · {e.name}
              </h2>
              <p>
                {e.bay?.identifier ?? "Shared / property"} ·{" "}
                {e.active ? (down ? "Downtime ongoing" : "No open downtime recorded") : "Archived"}
              </p>
              <details>
                <summary>Edit equipment</summary>
                <EquipmentForm data={data} e={e} />
              </details>
              {e.active && (
                <ActionForm
                  action={equipmentDowntime}
                  submit={down ? "End equipment downtime" : "Start equipment downtime"}
                >
                  <RecordId id={e.id} version={e.version} />
                  <input type="hidden" name="decision" value={down ? "END" : "START"} />
                  <Reason label={down ? "Return-to-service verification" : "Outage reason"} />
                </ActionForm>
              )}
              <details className="space-top">
                <summary>Downtime history · latest 20</summary>
                {e.downtime.map((d) => (
                  <p key={d.id}>
                    {formatDate(d.startedAt)} → {d.endedAt ? formatDate(d.endedAt) : "Ongoing"}
                    <br />
                    {d.reason}
                    {d.resolution ? ` · ${d.resolution}` : ""}
                  </p>
                ))}
              </details>
            </section>
          );
        })}
      </div>
    </>
  );
}
