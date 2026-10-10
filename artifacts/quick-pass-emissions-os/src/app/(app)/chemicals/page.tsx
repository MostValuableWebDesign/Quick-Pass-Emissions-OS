import { currentUser } from "@/lib/access";
import { businessDate, formatDate } from "@/lib/time";
import { chemicalOverview } from "@/modules/chemicals/service";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import {
  DemoNotice,
  MaintenanceNav,
  RecordId,
  TextField,
  Reason,
  SelectField,
  ActiveField,
} from "@/components/phase3";
import { saveChemical, moveChemical } from "@/app/phase3-actions";
type Data = Awaited<ReturnType<typeof chemicalOverview>>;
function ItemForm({ data, item: i }: { data: Data; item?: Data["items"][number] }) {
  return (
    <ActionForm action={saveChemical} submit={i ? "Update chemical item" : "Add chemical item"}>
      <RecordId id={i?.id} version={i?.version} />
      <TextField name="name" label="Chemical / supply name" value={i?.name} />
      <Field label="Stock unit · all quantities use whole units">
        <select name="unit" defaultValue={i?.unit}>
          {[
            ["ML", "Milliliters"],
            ["GRAM", "Grams"],
            ["ITEM", "Individual items"],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Low-stock threshold · chosen units">
        <input
          name="reorderPoint"
          type="number"
          min="0"
          max="2000000000"
          defaultValue={i?.reorderPoint}
          required
        />
      </Field>
      <SelectField
        name="vendorId"
        label="Chemical supplier"
        options={data.vendors}
        value={i?.vendorId}
      />
      <TextField name="notes" label="Supply notes" value={i?.notes} required={false} area />
      <ActiveField active={i?.active} />
      <Reason />
    </ActionForm>
  );
}
export default async function Chemicals() {
  const actor = await currentUser(),
    data = await chemicalOverview(actor.id);
  return (
    <>
      <PageHeader
        title="Carwash chemicals & supplies"
        description="Physical stock, recorded usage, receipts, disposal, and low-stock thresholds."
      />
      <DemoNotice demo={data.demo} />
      <MaintenanceNav />
      <p className="notice">
        Record milliliters, grams, or individual items as whole numbers. Convert packaging
        quantities before entry. Stock stays unknown until physically counted.
      </p>
      <section className="card card-body">
        <h2>Register a chemical or supply</h2>
        <ItemForm data={data} />
      </section>
      <div className="two-columns space-top">
        {data.items.map((i) => (
          <section className="card card-body" key={i.id}>
            <h2>
              {i.name} ·{" "}
              {i.balance === null ? "Unknown stock" : `${i.balance} ${i.unit.toLowerCase()}`}
            </h2>
            {i.active && i.balance !== null && i.balance <= i.reorderPoint && (
              <p className="notice warning">
                Low recorded stock · Reorder threshold: {i.reorderPoint} {i.unit.toLowerCase()}
              </p>
            )}
            <p className="muted">
              {i.active ? "Active" : "Archived"} · {i.vendor?.name ?? "No supplier recorded"}
            </p>
            <details>
              <summary>Edit item settings</summary>
              <ItemForm data={data} item={i} />
            </details>
            {i.active && (
              <ActionForm action={moveChemical} submit="Record chemical movement">
                <RecordId id={i.id} version={i.version} />
                <Field label="Stock movement">
                  <select name="kind">
                    <option value="RECONCILE">Physical count / reconciliation</option>
                    {i.balance !== null && (
                      <>
                        <option value="RECEIPT">Confirmed physical receipt</option>
                        <option value="USAGE">Usage</option>
                        <option value="DISPOSAL">Disposal / spoilage</option>
                      </>
                    )}
                  </select>
                </Field>
                <Field
                  label={`Quantity · ${i.unit.toLowerCase()} (observed total for physical count)`}
                >
                  <input name="quantity" type="number" min="0" max="2000000000" required />
                </Field>
                <Field label="Movement business date">
                  <input
                    name="date"
                    type="date"
                    min={i.lastMovementDate ?? undefined}
                    max={businessDate()}
                    defaultValue={businessDate()}
                    required
                  />
                </Field>
                <TextField name="reference" label="Unique chemical movement reference" />
                <Reason label="Stock movement reason" />
              </ActionForm>
            )}
            <details className="space-top">
              <summary>Movement history · latest 30</summary>
              {i.movements.map((m) => (
                <p key={m.id}>
                  {m.date} · {m.kind.toLowerCase()} · {m.delta > 0 ? "+" : ""}
                  {m.delta} · balance {m.balanceAfter}
                  <br />
                  {m.reference} · {m.reason}
                  <br />
                  <small>Recorded {formatDate(m.createdAt)}</small>
                </p>
              ))}
            </details>
          </section>
        ))}
      </div>
    </>
  );
}
