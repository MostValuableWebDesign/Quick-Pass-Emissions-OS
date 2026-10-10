import { currentUser } from "@/lib/access";
import { businessDate, formatDate } from "@/lib/time";
import { approvalRoles } from "@/modules/phase2";
import { certificateOverview } from "@/modules/certificates/service";
import { PageHeader } from "@/components/shared";
import { CertificatePortalBrowser } from "@/components/certificate-portal-browser";
import { readCertificateInsights } from "@/modules/certificates/order-history";
import { CertificateInsights } from "@/components/certificate-insights";
import { ActionForm, Field } from "@/components/action-form";
import {
  saveInventorySettings,
  createPurchaseRequest,
  reviewPurchaseRequest,
  recordCertificateOrder,
  receiveCertificatePurchase,
} from "@/app/phase2-actions";
export default async function Certificates() {
  const actor = await currentUser();
  const [data, insights] = await Promise.all([
    certificateOverview(actor.id),
    readCertificateInsights(),
  ]);
  const approver = approvalRoles.includes(actor.role);
  const today = businessDate();
  return (
    <>
      <PageHeader
        title="Certificate inventory"
        description="Provider stock, certificate order history and planning estimates. Purchasing stays manual."
      />
      {data.demo && (
        <div className="notice warning">
          DEMONSTRATION WORKSPACE · Illustrative payroll and stock records. These are not actual
          business records.
        </div>
      )}
      <CertificatePortalBrowser initial={insights.portal} canRefresh={approver} />
      <CertificateInsights initial={insights} canRefresh={approver} />
      <details className="card card-body space-top records-section" id="records">
        <summary>Optional records · purchase requests, ordering settings, purchase history</summary>
        <p className="muted">
          Optional internal records. You do not need a request or approval here before buying on the
          portal. Record orders and confirmed receipts here to keep the stock ledger accurate.
        </p>
      <div className="two-columns space-top">
        <section className="card card-body" id="purchase-request">
          <h2>Request a certificate purchase</h2>
          <p className="muted">
            Optional. One open request at a time, reviewed by a different manager or owner.
            Receipts increase stock only after an external order is recorded against a request.
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
                  defaultValue={data.settings?.reorderPoint ?? ""}
                  required
                />
              </Field>
              <Field label="Expected delivery lead days">
                <input
                  name="leadDays"
                  type="number"
                  min="0"
                  max="365"
                  defaultValue={data.settings?.leadDays ?? ""}
                  required
                />
              </Field>
              <Field label="Usage window · calendar days">
                <input
                  name="windowDays"
                  type="number"
                  min="7"
                  max="90"
                  defaultValue={data.settings?.windowDays ?? ""}
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
      <section className="card card-body space-top" id="purchase-history">
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
            {approver && data.stock && p.status === "ORDERED" && (
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
          <h2>Legacy inventory movements · latest 100</h2>
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
            No legacy stock ledger movements are recorded. Current provider stock is shown above.
          </p>
        )}
      </section>
      </details>
    </>
  );
}
