import { currentUser } from "@/lib/access";
import { businessDate, formatDate } from "@/lib/time";
import { approvalRoles } from "@/modules/phase2";
import { certificateOverview } from "@/modules/certificates/service";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import {
  saveInventorySettings,
  reconcileInventory,
  consumeCertificates,
  createPurchaseRequest,
  draftRecommendedPurchase,
  reviewPurchaseRequest,
  recordCertificateOrder,
  receiveCertificatePurchase,
} from "@/app/phase2-actions";
export default async function Certificates() {
  const actor = await currentUser();
  const data = await certificateOverview(actor.id);
  const approver = approvalRoles.includes(actor.role);
  const today = businessDate();
  const estimate = data.estimate;
  return (
    <>
      <PageHeader
        title="Certificate inventory"
        description="Recorded stock, physical reconciliation, and reviewed purchase requests."
      />
      {data.demo && (
        <div className="notice warning">
          DEMONSTRATION WORKSPACE · Illustrative payroll and stock records. These are not actual
          business records.
        </div>
      )}
      <p className="notice">
        Stock reflects entered movements. Verify against the official system and physical count.
        Orders are placed through your approved external channel, then recorded here.
      </p>
      <section className="stats" aria-label="Certificate metrics">
        {[
          {
            label: "Recorded stock",
            value: data.stock?.balance ?? "Not reconciled",
            note: data.stock
              ? `Last physical count: ${data.stock.reconciledDate}`
              : "Opening count required",
          },
          {
            label: "Average daily usage",
            value: estimate ? estimate.averageDailyUsage.toFixed(1) : "Unavailable",
            note: estimate
              ? `${estimate.used} consumed / ${estimate.days} calendar days`
              : "Configure settings and opening stock",
          },
          {
            label: "Estimated depletion",
            value: estimate?.depletionDate ?? "Unknown",
            note: "Estimate from recorded usage, including voids",
          },
          {
            label: "Reorder at",
            value: estimate?.reorderAt ?? "Not configured",
            note: "Higher of configured threshold and estimated lead-time demand",
          },
        ].map((m) => (
          <article className="stat" key={m.label}>
            <div className="stat-top">
              <span>{m.label}</span>
            </div>
            <strong style={{ fontSize: "1.35rem" }}>{m.value}</strong>
            <small>{m.note}</small>
          </article>
        ))}
      </section>
      {estimate?.low && (
        <section className="attention-card has-alert">
          <h2>Certificate reorder needed</h2>
          <p>
            Recorded stock is at or below the reorder threshold. Estimated request:{" "}
            {estimate.recommendedQuantity} certificates. Review open orders and the physical count
            before approval.
          </p>
          <ActionForm action={draftRecommendedPurchase} submit="Draft recommended purchase" />
        </section>
      )}
      <div className="two-columns space-top">
        {approver && (
          <section className="card card-body">
            <h2>{data.stock ? "Reconcile physical stock" : "Record opening physical count"}</h2>
            <p className="muted">
              Reconciliation records an adjustment with a reason. Earlier ledger entries remain
              intact. Refresh and recount if another movement has changed stock.
            </p>
            <ActionForm action={reconcileInventory} submit="Reconcile stock">
              <input name="version" type="hidden" value={data.stock?.version ?? 0} />
              <Field label="Observed physical certificates">
                <input type="number" name="observed" min="0" max="2000000000" required />
              </Field>
              <Field label="Physical count date">
                <input type="date" name="date" defaultValue={today} max={today} required />
              </Field>
              <Field label="Reconciliation reference">
                <input name="reference" required maxLength={160} />
              </Field>
              <Field label="Reconciliation reason">
                <textarea name="reason" required maxLength={2000} />
              </Field>
            </ActionForm>
          </section>
        )}
        {approver && (
          <section className="card card-body">
            <h2>Record certificate consumption</h2>
            <ActionForm action={consumeCertificates} submit="Record consumption">
              <Field label="Consumption type">
                <select name="kind">
                  <option value="USAGE">Used in testing</option>
                  <option value="VOID">Voided / spoiled</option>
                </select>
              </Field>
              <Field label="Certificates consumed">
                <input name="quantity" type="number" min="1" max="1000000" required />
              </Field>
              <Field label="Consumption date">
                <input name="date" type="date" defaultValue={today} max={today} required />
              </Field>
              <Field label="Consumption reference">
                <input name="reference" required maxLength={160} />
              </Field>
              <Field label="Consumption reason" wide>
                <textarea name="reason" required maxLength={2000} />
              </Field>
            </ActionForm>
          </section>
        )}
      </div>
      <div className="two-columns space-top">
        <section className="card card-body">
          <h2>Request a certificate purchase</h2>
          <p className="muted">
            One open request at a time. A second manager or owner must approve. Receipts increase
            stock only after an approved external order is recorded.
          </p>
          <ActionForm action={createPurchaseRequest} submit="Request purchase">
            <Field label="Requested certificates">
              <input
                name="quantity"
                type="number"
                min={data.settings?.minimumOrder ?? 300}
                max="1000000"
                required
              />
            </Field>
            <Field label="Purchase request reason">
              <textarea name="reason" required maxLength={2000} />
            </Field>
          </ActionForm>
        </section>
        {actor.role === "OWNER" && (
          <section className="card card-body">
            <h2>Confirm ordering settings</h2>
            <p className="muted">
              Confirm the minimum order with the owner; supported minimum is at least 300
              certificates. Forecasts use calendar days, including days with zero recorded
              consumption.
            </p>
            <ActionForm action={saveInventorySettings} submit="Save certificate settings">
              <Field label="Minimum order quantity">
                <input
                  name="minimumOrder"
                  type="number"
                  min="300"
                  max="1000000"
                  defaultValue={data.settings?.minimumOrder}
                  required
                />
              </Field>
              <Field label="Configured reorder point">
                <input
                  name="reorderPoint"
                  type="number"
                  min="0"
                  max="1000000"
                  defaultValue={data.settings?.reorderPoint}
                  required
                />
              </Field>
              <Field label="Expected delivery lead days">
                <input
                  name="leadDays"
                  type="number"
                  min="0"
                  max="365"
                  defaultValue={data.settings?.leadDays}
                  required
                />
              </Field>
              <Field label="Usage window · calendar days">
                <input
                  name="windowDays"
                  type="number"
                  min="7"
                  max="90"
                  defaultValue={data.settings?.windowDays}
                  required
                />
              </Field>
              <Field label="Settings authorization reason" wide>
                <textarea name="reason" required maxLength={2000} />
              </Field>
            </ActionForm>
          </section>
        )}
      </div>
      <section className="card card-body space-top">
        <h2>Purchase history · latest 100</h2>
        {!data.purchases.length && <p className="muted">No purchase requests recorded.</p>}
        {data.purchases.map((p) => (
          <article className="card card-body space-top" key={p.id}>
            <h3>
              {p.quantity} certificates · {p.status.toLowerCase()}
            </h3>
            <p>
              {p.received} received · Requested {formatDate(p.createdAt)}
            </p>
            <p className="muted">{p.reason}</p>
            {p.reviewReason && <p>Review: {p.reviewReason}</p>}
            {p.confirmation && (
              <p>
                External order: {p.confirmation} · Payment reference:{" "}
                {p.paymentReference ?? "Not recorded"}
              </p>
            )}
            {approver &&
              p.requestedBy !== actor.id &&
              ["REQUESTED", "APPROVED"].includes(p.status) && (
                <ActionForm action={reviewPurchaseRequest} submit="Submit purchase review">
                  <input name="id" type="hidden" value={p.id} />
                  <Field label="Purchase decision">
                    <select name="decision">
                      {p.status === "REQUESTED" && (
                        <option value="APPROVED">Approve request</option>
                      )}
                      <option value="CANCELLED">Cancel request</option>
                    </select>
                  </Field>
                  <Field label="Purchase review reason">
                    <textarea name="reason" required maxLength={2000} />
                  </Field>
                </ActionForm>
              )}
            {p.status === "APPROVED" && (
              <ActionForm action={recordCertificateOrder} submit="Record external order">
                <input name="id" type="hidden" value={p.id} />
                <Field label="External order confirmation">
                  <input name="confirmation" required maxLength={160} />
                </Field>
                <Field label="Payment reference · optional">
                  <input name="paymentReference" maxLength={160} />
                </Field>
                <Field label="Order record reason" wide>
                  <textarea name="reason" required maxLength={2000} />
                </Field>
              </ActionForm>
            )}
            {approver && p.status === "ORDERED" && (
              <ActionForm action={receiveCertificatePurchase} submit="Confirm certificate receipt">
                <input name="id" type="hidden" value={p.id} />
                <Field label="Certificates received">
                  <input
                    name="quantity"
                    type="number"
                    min="1"
                    max={p.quantity - p.received}
                    required
                  />
                </Field>
                <Field label="Receipt date">
                  <input name="date" type="date" defaultValue={today} max={today} required />
                </Field>
                <Field label="Unique delivery reference">
                  <input name="reference" required maxLength={160} />
                </Field>
                <Field label="Receipt verification reason">
                  <textarea name="reason" required maxLength={2000} />
                </Field>
              </ActionForm>
            )}
          </article>
        ))}
      </section>
      <section className="card space-top">
        <div className="card-heading">
          <h2>Inventory movements · latest 100</h2>
          <span className="muted">In recording order</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Business date</th>
                <th>Movement</th>
                <th>Change</th>
                <th>Balance after entry</th>
                <th>Reference / reason</th>
              </tr>
            </thead>
            <tbody>
              {data.movements.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.date}
                    <small>Recorded {formatDate(m.createdAt)}</small>
                  </td>
                  <td>{m.kind.toLowerCase()}</td>
                  <td>
                    {m.delta > 0 ? "+" : ""}
                    {m.delta}
                  </td>
                  <td>{m.balanceAfter}</td>
                  <td>
                    {m.reference}
                    <small>{m.reason}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.movements.length && (
          <p className="card-body muted">
            Stock is unknown until the opening physical count is recorded.
          </p>
        )}
      </section>
    </>
  );
}
