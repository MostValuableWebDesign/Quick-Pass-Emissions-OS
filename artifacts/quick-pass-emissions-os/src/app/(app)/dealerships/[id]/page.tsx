import { RecordLink } from "@/components/record-link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/access";
import { businessDate } from "@/lib/time";
import { dealerDetail } from "@/modules/finance/service";
import { receivable } from "@/modules/finance/rules";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { DemoNotice, RecordId, TextField, Reason, Money } from "@/components/phase3";
import { DateField, AmountField } from "@/components/finance";
import { DealershipFields } from "@/components/dealership-fields";
import { ContactPhoneField } from "@/components/contact-phone-field";
import * as actions from "@/app/phase4-actions";
import { marketingOptions } from "@/modules/marketing/service";
import { ServiceSourceFields } from "@/components/marketing-client";
import { sourceOptions } from "@/components/marketing";
export default async function Dealer({ params }: { params: Promise<{ id: string }> }) {
  const actor = await currentUser(),
    data = await dealerDetail(actor.id, (await params).id),
    d = data.dealer;
  if (!d) notFound();
  const marketing = await marketingOptions(actor.id);
  const management = true,
    unbilled = data.unbilled;
  return (
    <>
      <PageHeader
        title={d.name}
        description={d.active ? "Active dealership partner" : "Archived dealership"}
      />
      <DemoNotice demo={data.demo} />
      <section className="card card-body">
        <h2>Account & billing details</h2>
        <p className="preserve-lines">{d.billingAddress}</p>
        {d.phone && (
          <p>
            <a href={`tel:${d.phone}`}>{d.phone}</a>
          </p>
        )}
        {d.email && (
          <p>
            <a href={`mailto:${d.email}`}>{d.email}</a>
          </p>
        )}
        <p>{d.notes}</p>
        <details>
          <summary>Edit account</summary>
          <ActionForm action={actions.saveDealer} submit="Save dealership">
            <RecordId id={d.id} version={d.version} />
            <DealershipFields dealer={d} />
          </ActionForm>
        </details>
      </section>
      <section className="card card-body space-top">
        <h2>Authorized billing terms</h2>
        <p>
          {d.termsDays === null
            ? "Unconfigured. Owner must confirm terms, rate and tax before drafting invoices."
            : `Net ${d.termsDays} days · Tax ${d.taxBps} basis points (100 = 1%)`}
        </p>
        <p>
          Default service rate: <Money cents={d.defaultRateCents} />
        </p>
        <p>{d.termsReference}</p>
        <p className="muted">
          Tax applies to the invoice subtotal, rounded half up once. A zero tax rate must be
          explicitly authorized. Confirm applicable tax with your accountant. New terms affect new
          drafts; invoice snapshots retain their original terms.
        </p>
        {actor.role === "OWNER" && d.active && (
          <details>
            <summary>Authorize billing terms</summary>
            <ActionForm action={actions.authorizeTerms} submit="Authorize dealership terms">
              <RecordId id={d.id} version={d.version} />
              <AmountField
                label="Payment terms · days after issue"
                name="termsDays"
                min={0}
                max={365}
                value={d.termsDays}
              />
              <AmountField
                label="Default service rate · integer USD cents"
                name="defaultRateCents"
                value={d.defaultRateCents}
              />
              <AmountField
                label="Authorized tax · basis points, 0 explicitly tax-free"
                name="taxBps"
                min={0}
                max={10000}
                value={d.taxBps}
              />
              <TextField
                name="termsReference"
                label="Verified contract / tax authorization source"
                value={d.termsReference ?? ""}
                area
              />
            </ActionForm>
          </details>
        )}
      </section>
      <section className="card card-body space-top">
        <h2>Contacts</h2>
        {[...d.contacts, null].map((c) => (
          <details key={c?.id ?? "new"}>
            <summary>
              {c ? `${c.name} · ${c.purpose} · ${c.active ? "Active" : "Archived"}` : "Add contact"}
            </summary>
            <ActionForm action={actions.saveContact} submit={c ? "Save contact" : "Add contact"}>
              <RecordId id={c?.id} version={c?.version} />
              <input type="hidden" name="dealershipId" value={d.id} />
              <TextField name="name" label="Contact person" value={c?.name} />
              <Field label="Contact email">
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  placeholder="name@dealership.com"
                  defaultValue={c?.email}
                />
              </Field>
              <ContactPhoneField label="Contact phone" value={c?.phone} />
              <TextField name="purpose" label="Contact responsibility" value={c?.purpose} />
              <TextField
                name="source"
                label="Contact source / checked reference"
                value={c?.source}
                area
              />
            </ActionForm>
          </details>
        ))}
      </section>
      {d.active && (
        <section className="card card-body space-top">
          <h2>Record completed service</h2>
          <p className="muted">
            Manual service evidence only. Do not enter vehicle owner personal data. Service amounts
            require review during invoice approval.
          </p>
          <ActionForm action={actions.recordService} submit="Record completed service">
            <input type="hidden" name="dealershipId" value={d.id} />
            <DateField label="Service completion date" />
            <TextField name="description" label="Service description" />
            <AmountField label="Completed quantity · whole units" name="quantity" max={100000} />
            <AmountField
              label="Agreed unit rate · integer USD cents"
              name="unitCents"
              value={d.defaultRateCents}
            />
            <TextField name="reference" label="Unique service source reference" />
            <TextField name="evidence" label="Completion evidence / external record" area />
            <ServiceSourceFields
              sources={sourceOptions}
              campaigns={marketing.campaigns}
              isOwner={actor.role === "OWNER"}
            />
          </ActionForm>
        </section>
      )}
      <section className="card space-top">
        <div className="card-heading">
          <h2>Completed services · latest 100</h2>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date / source</th>
                <th>Service</th>
                <th>Quantity / rate</th>
                <th>Billing</th>
              </tr>
            </thead>
            <tbody>
              {d.services.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.date}
                    <small>{s.reference}</small>
                  </td>
                  <td>
                    {s.description}
                    <small>{s.evidence}</small>
                  </td>
                  <td>
                    {s.quantity} × <Money cents={s.unitCents} />
                  </td>
                  <td>
                    {s.voidDate ? (
                      `Voided ${s.voidDate}`
                    ) : s.invoice ? (
                      <RecordLink href={`/invoices/${s.invoice.id}`}>{s.invoice.number}</RecordLink>
                    ) : (
                      <>
                        Unbilled
                        {management && (
                          <details>
                            <summary>Void incorrect service</summary>
                            <ActionForm action={actions.voidService} submit="Void service">
                              <input type="hidden" name="id" value={s.id} />
                              <Reason label="Reason for voiding service" />
                            </ActionForm>
                          </details>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {d.active && (
        <section className="card card-body space-top" id="create-invoice">
          <h2>Auto dealership invoices</h2>
          <p className="muted">
            Select 1–100 completed services. Totals and due date use authorized terms. A different
            owner or manager must approve. Void and recreate to correct a draft. The oldest 100
            unbilled services are offered first.
          </p>
          <ActionForm action={actions.createInvoice} submit="Create invoice draft">
            <input type="hidden" name="dealershipId" value={d.id} />
            <TextField name="number" label="Unique invoice number" />
            <DateField name="issueDate" label="Invoice issue date" />
            <TextField name="notes" label="Invoice notes" required={false} area />
            <fieldset className="field wide">
              <legend>Unbilled completed services</legend>
              {unbilled.map((s) => (
                <label className="check-row" key={s.id}>
                  <input type="checkbox" name="serviceIds" value={s.id} />
                  {s.date} · {s.description} · {s.quantity} × <Money cents={s.unitCents} />
                </label>
              ))}
              {!unbilled.length && <p>No unbilled services recorded.</p>}
            </fieldset>
          </ActionForm>
        </section>
      )}
      <section className="card card-body space-top">
        <h2>Account invoices · latest 100</h2>
        {d.invoices.map((i) => (
          <p key={i.id}>
            <RecordLink href={`/invoices/${i.id}`}>{i.number}</RecordLink> ·{" "}
            {
              receivable(
                { ...i, state: i.approvedAt ? i.state : "DRAFT" },
                i.payments,
                businessDate(),
              ).status
            }{" "}
            · <Money cents={i.totalCents} />
          </p>
        ))}
      </section>
    </>
  );
}
