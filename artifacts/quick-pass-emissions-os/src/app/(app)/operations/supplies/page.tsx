import Link from "next/link";
import { currentUser } from "@/lib/access";
import { supplyRegister } from "@/modules/manager/registers";
import { managerAction } from "@/app/manager-actions";
import { ActionForm, Field } from "@/components/action-form";
import { PageHeader } from "@/components/shared";
import { WorkspaceTabs, Command } from "@/components/manager-workspace";
import "../workspace.css";
export default async function Supplies({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = Math.max(1, Math.min(10000, Math.floor(Number((await searchParams).page)) || 1));
  const actor = await currentUser(),
    supplies = await supplyRegister(actor.id, page);
  return (
    <>
      <PageHeader
        title="Weekly supplies"
        description="Recorded counts, configurable thresholds and external purchase evidence"
      />
      <WorkspaceTabs active="supplies" />
      <div className="notice">
        Walmart: copy paper, soap, tissue paper, paper towels. Amazon: receipt paper, plastic tag
        scrapers. Printer/ink: OPUS, Best Buy or your existing family contact. Preferred vendors are
        suggestions; confirm units and reorder levels. Use <Link href="/chemicals">Chemicals</Link>{" "}
        for foam soap, tire cleaner, high-pressure soap and clear wax, and{" "}
        <Link href="/certificates">Certificates</Link> for ACH orders of at least 300.
      </div>
      {supplies.map((s) => (
        <section className="card card-body" key={s.id}>
          <h2>{s.name}</h2>
          <p>
            {s.balance === null ? "Missing stock count" : `${s.balance} ${s.unit}`} ·{" "}
            {s.reorderLevel === null
              ? "Reorder threshold unconfigured"
              : `Reorder at ${s.reorderLevel} ${s.unit}`}
            {s.balance !== null && s.reorderLevel !== null && s.balance <= s.reorderLevel
              ? " · Low supplies"
              : ""}{" "}
            · {s.preferredVendor || "Vendor unconfigured"}
          </p>
          <details>
            <summary>Count / configure supplies</summary>
            <ActionForm action={managerAction} submit="Save supply count">
              <Command name="SUPPLY" />
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="version" value={s.version} />
              <Field label="Supply name">
                <input
                  name="name"
                  defaultValue={s.name}
                  readOnly={actor.role !== "OWNER"}
                  required
                />
              </Field>
              <Field label="Stock unit">
                <input
                  name="unit"
                  defaultValue={s.unit}
                  readOnly={actor.role !== "OWNER"}
                  required
                />
              </Field>
              <Field label="Physical stock count · blank means missing">
                <input
                  type="number"
                  name="balance"
                  min={0}
                  max={2000000000}
                  defaultValue={s.balance ?? ""}
                />
              </Field>
              <Field label="Reorder threshold · blank means unconfigured">
                <input
                  type="number"
                  name="reorderLevel"
                  min={0}
                  max={2000000000}
                  defaultValue={s.reorderLevel ?? ""}
                  readOnly={actor.role !== "OWNER"}
                />
              </Field>
              <Field label="Preferred vendor">
                <input
                  name="preferredVendor"
                  maxLength={160}
                  defaultValue={s.preferredVendor}
                  readOnly={actor.role !== "OWNER"}
                />
              </Field>
            </ActionForm>
          </details>
          <details>
            <summary>Prepare a purchase record</summary>
            <ActionForm action={managerAction} submit="Prepare purchase record">
              <Command name="PREPARE_PURCHASE" />
              <input type="hidden" name="itemId" value={s.id} />
              <Field label={`Quantity · ${s.unit}`}>
                <input type="number" name="quantity" min={1} max={2000000000} required />
              </Field>
              <Field label="Vendor">
                <input name="vendor" defaultValue={s.preferredVendor} required maxLength={160} />
              </Field>
              <Field label="Unique purchase reference">
                <input name="reference" required maxLength={160} />
              </Field>
            </ActionForm>
            <p>This saves preparation only. No order or payment is sent.</p>
          </details>
          <h3>Purchase history · page {page} · 15 per supply type</h3>
          {s.purchases.map((p) => {
            const next = { PREPARED: "SUBMITTED", SUBMITTED: "RECEIVED", RECEIVED: "RECONCILED" }[
              p.status
            ];
            return (
              <div className="manager-schedule-slot" key={p.id}>
                <p>
                  {p.reference} · {p.quantity} {s.unit} · {p.vendor} · {p.status}
                </p>
                {next && (
                  <ActionForm action={managerAction} submit={`Record ${next.toLowerCase()}`}>
                    <Command name="ADVANCE_PURCHASE" />
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="version" value={p.version} />
                    <input type="hidden" name="status" value={next} />
                    <Field label="External evidence / receipt / reconciliation note">
                      <input name="note" required maxLength={160} />
                    </Field>
                  </ActionForm>
                )}
              </div>
            );
          })}
        </section>
      ))}
      <div className="pagination">
        {page > 1 && <Link href={`/operations/supplies?page=${page - 1}`}>← Previous orders</Link>}
        <span>Page {page}</span>
        {supplies.some((s) => s._count.purchases > page * 15) && (
          <Link href={`/operations/supplies?page=${page + 1}`}>Older orders →</Link>
        )}
      </div>
      {actor.role === "OWNER" && (
        <section className="card card-body">
          <h2>Add a supply type</h2>
          <ActionForm action={managerAction} submit="Add supply">
            <Command name="SUPPLY" />
            <input type="hidden" name="version" value="0" />
            <Field label="Supply name">
              <input name="name" required maxLength={160} />
            </Field>
            <Field label="Stock unit">
              <input
                name="unit"
                required
                maxLength={160}
                placeholder="e.g. rolls, packs or bottles"
              />
            </Field>
            <Field label="Physical stock count · optional">
              <input type="number" name="balance" min={0} max={2000000000} />
            </Field>
            <Field label="Reorder threshold · optional">
              <input type="number" name="reorderLevel" min={0} max={2000000000} />
            </Field>
            <Field label="Preferred vendor">
              <input name="preferredVendor" maxLength={160} />
            </Field>
          </ActionForm>
        </section>
      )}
    </>
  );
}
