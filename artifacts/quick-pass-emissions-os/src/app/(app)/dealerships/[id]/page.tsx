import { RecordLink } from "@/components/record-link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/access";
import { businessDate } from "@/lib/time";
import { dealerDetail } from "@/modules/finance/service";
import { receivable } from "@/modules/finance/rules";
import { Empty, PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { DemoNotice, RecordId, TextField, Reason, Money } from "@/components/phase3";
import { DateField, AmountField } from "@/components/finance";
import { DealershipFields } from "@/components/dealership-fields";
import { ContactPhoneField } from "@/components/contact-phone-field";
import { DirectoryAddDialog } from "@/components/directory-add-dialog";
import * as actions from "@/app/phase4-actions";
import { DealerVirUpload } from "@/components/dealer-vir-upload";
import { SelectAllServices } from "@/components/select-all-services";
const sections = [
  { id: "overview", label: "Overview" },
  { id: "contacts", label: "Contacts" },
  { id: "billing", label: "Billing" },
  { id: "vir", label: "VIR uploads" },
  { id: "services", label: "Services & invoices" },
] as const;

export default async function Dealer({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const actor = await currentUser(),
    data = await dealerDetail(actor.id, (await params).id),
    d = data.dealer;
  if (!d) notFound();
  const requestedSection = (await searchParams).section;
  const management = true,
    unbilled = data.unbilled,
    section = sections.find((item) => item.id === requestedSection)?.id ?? "overview",
    asOf = businessDate(),
    latestInvoice = d.invoices[0],
    latestSummary = latestInvoice
      ? receivable(
          { ...latestInvoice, state: latestInvoice.approvedAt ? latestInvoice.state : "DRAFT" },
          latestInvoice.payments,
          asOf,
        )
      : null,
    primaryContact = d.contacts.find((contact) => contact.active) ?? null;
  return (
    <>
      <PageHeader
        title={d.name}
        description={d.active ? "Active dealership partner" : "Archived dealership"}
      >
        {d.active && (
          <>
            <DealerVirUpload dealershipId={d.id} />
            <RecordLink
              className="button button-primary"
              href={`/dealerships/${d.id}?section=services#create-invoice`}
            >
              Create invoice
            </RecordLink>
          </>
        )}
      </PageHeader>
      <DemoNotice demo={data.demo} />
      <div className="dealer-workspace">
        <nav className="dealer-section-nav" aria-label="Dealership sections">
          {sections.map((item) => (
            <RecordLink
              key={item.id}
              className="dealer-section-link"
              href={`/dealerships/${d.id}?section=${item.id}`}
              aria-current={section === item.id ? "page" : undefined}
            >
              {item.label}
              {item.id === "contacts" && <span>{d.contacts.filter((c) => c.active).length}</span>}
              {item.id === "vir" && d.virRecords.length > 0 && <span>{d.virRecords.length}</span>}
              {item.id === "services" && unbilled.length > 0 && <span>{unbilled.length}</span>}
            </RecordLink>
          ))}
        </nav>
        <div className="dealer-workspace-content">
          {section === "overview" && (
            <div className="dealer-overview">
              <section className="dealer-summary-grid" aria-label="Account summary">
                <article className="card dealer-summary-card">
                  <span>Balance due</span>
                  <strong>
                    <Money cents={d.outstandingCents} />
                  </strong>
                  <small>Issued invoices · through {asOf}</small>
                </article>
                <article className="card dealer-summary-card">
                  <span>Latest invoice</span>
                  <strong>{latestSummary?.status ?? "No invoices yet"}</strong>
                  <small>
                    {latestInvoice?.number ?? "Create an invoice when services are ready"}
                  </small>
                </article>
                <article className="card dealer-summary-card">
                  <span>Ready to invoice</span>
                  <strong>{unbilled.length} services</strong>
                  <small>Saved completed services not yet billed</small>
                </article>
              </section>
              <section className="card dealer-overview-card">
                <div className="dealer-section-heading">
                  <div>
                    <h2>Primary contact</h2>
                    <p className="muted">The first active contact on this account</p>
                  </div>
                  <RecordLink
                    className="button button-outline"
                    href={`/dealerships/${d.id}?section=contacts`}
                  >
                    View contacts
                  </RecordLink>
                </div>
                {primaryContact ? (
                  <div className="dealer-primary-contact">
                    <strong>{primaryContact.name}</strong>
                    <span>{primaryContact.purpose}</span>
                    <span>
                      {primaryContact.email ? (
                        <a href={`mailto:${primaryContact.email}`}>{primaryContact.email}</a>
                      ) : (
                        "No email saved"
                      )}
                    </span>
                    <span>
                      {primaryContact.phone ? (
                        <a href={`tel:${primaryContact.phone}`}>{primaryContact.phone}</a>
                      ) : (
                        "No phone saved"
                      )}
                    </span>
                  </div>
                ) : (
                  <p>No active contact is saved for this dealership.</p>
                )}
              </section>
              <section className="card dealer-overview-card">
                <div className="dealer-section-heading">
                  <div>
                    <h2>Account snapshot</h2>
                    <p className="muted">Billing address and account contact information</p>
                  </div>
                  <RecordLink
                    className="button button-outline"
                    href={`/dealerships/${d.id}?section=billing`}
                  >
                    View billing
                  </RecordLink>
                </div>
                <p className="preserve-lines">{d.billingAddress}</p>
                <div className="dealer-contact-actions">
                  {d.phone && <a href={`tel:${d.phone}`}>{d.phone}</a>}
                  {d.email && <a href={`mailto:${d.email}`}>{d.email}</a>}
                </div>
              </section>
            </div>
          )}
          {section === "billing" && (
            <>
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
              <section className="card card-body space-top" id="billing-terms">
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
                  explicitly authorized. Confirm applicable tax with your accountant. New terms
                  affect new drafts; invoice snapshots retain their original terms.
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
            </>
          )}
          {section === "vir" &&
            (d.virRecords.length ? (
              <section className="card space-top">
                <div className="card-heading">
                  <h2>Uploaded VIR inspections</h2>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Certificate / Test ID</th>
                        <th>Result</th>
                        <th>Billing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.virRecords.map((report) => {
                        const service = d.services.find((item) => item.id === report.serviceId);
                        const readyService = data.unbilled.find(
                          (item) => item.id === report.serviceId,
                        );
                        return (
                          <tr key={report.id}>
                            <td>{report.date}</td>
                            <td>
                              {report.certificate || report.testNumber}
                              {report.certificate && report.testNumber && (
                                <small>Test ID {report.testNumber}</small>
                              )}
                            </td>
                            <td>{report.outcome}</td>
                            <td>
                              {report.billing === "FREE" ? (
                                "Free · not invoiced"
                              ) : service?.invoice ? (
                                <RecordLink href={`/invoices/${service.invoice.id}`}>
                                  {service.invoice.number}
                                </RecordLink>
                              ) : readyService ? (
                                <RecordLink
                                  href={`/dealerships/${d.id}?section=services#create-invoice`}
                                >
                                  Ready to invoice · saved report
                                </RecordLink>
                              ) : service?.voidDate ? (
                                "Service voided"
                              ) : (
                                "Saved service"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <Empty
                title="No VIR uploads yet"
                text="Upload dealership inspection reports to review them and prepare billing."
              />
            ))}
          {section === "contacts" && (
            <section className="card card-body dealer-contacts">
              <div className="dealer-section-heading">
                <div>
                  <h2>Contacts</h2>
                  <p className="muted">Billing and service people for this account.</p>
                </div>
                {d.active && (
                  <DirectoryAddDialog title="Add contact">
                    <ActionForm action={actions.saveContact} submit="Add contact">
                      <RecordId />
                      <input type="hidden" name="dealershipId" value={d.id} />
                      <TextField name="name" label="Contact person" />
                      <Field label="Contact email">
                        <input
                          name="email"
                          type="email"
                          autoComplete="email"
                          maxLength={254}
                          placeholder="name@dealership.com"
                        />
                      </Field>
                      <ContactPhoneField label="Contact phone" />
                      <TextField name="purpose" label="Contact responsibility" />
                      <TextField name="source" label="Contact source / checked reference" area />
                    </ActionForm>
                  </DirectoryAddDialog>
                )}
              </div>
              {d.contacts.length ? (
                <div className="dealer-contact-grid">
                  {d.contacts.map((contact) => (
                    <article className="dealer-contact-card" key={contact.id}>
                      <div className="dealer-section-heading">
                        <div>
                          <h3>{contact.name}</h3>
                          <p className="muted">{contact.purpose}</p>
                        </div>
                        <span className={`badge ${contact.active ? "green" : "neutral"}`}>
                          {contact.active ? "Active" : "Archived"}
                        </span>
                      </div>
                      <div className="dealer-contact-links">
                        {contact.email ? (
                          <a href={`mailto:${contact.email}`}>{contact.email}</a>
                        ) : (
                          <span>No email saved</span>
                        )}
                        {contact.phone ? (
                          <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                        ) : (
                          <span>No phone saved</span>
                        )}
                      </div>
                      <details>
                        <summary>Edit contact</summary>
                        <ActionForm action={actions.saveContact} submit="Save contact">
                          <RecordId id={contact.id} version={contact.version} />
                          <input type="hidden" name="dealershipId" value={d.id} />
                          <TextField name="name" label="Contact person" value={contact.name} />
                          <Field label="Contact email">
                            <input
                              name="email"
                              type="email"
                              autoComplete="email"
                              maxLength={254}
                              placeholder="name@dealership.com"
                              defaultValue={contact.email}
                            />
                          </Field>
                          <ContactPhoneField label="Contact phone" value={contact.phone} />
                          <TextField
                            name="purpose"
                            label="Contact responsibility"
                            value={contact.purpose}
                          />
                          <TextField
                            name="source"
                            label="Contact source / checked reference"
                            value={contact.source}
                            area
                          />
                        </ActionForm>
                      </details>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No contacts yet"
                  text="Add a billing or service contact for this account."
                />
              )}
            </section>
          )}
          {section === "services" && (
            <>
              <section className="card space-top">
                <div className="card-heading">
                  <h2>Completed services · latest 100</h2>
                </div>
                {d.services.length ? (
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
                        {d.services.map((service) => (
                          <tr key={service.id}>
                            <td>
                              {service.date}
                              <small>{service.reference}</small>
                            </td>
                            <td>
                              {service.description}
                              <small>{service.evidence}</small>
                            </td>
                            <td>
                              {service.quantity} × <Money cents={service.unitCents} />
                            </td>
                            <td>
                              {service.voidDate ? (
                                `Voided ${service.voidDate}`
                              ) : service.invoice ? (
                                <RecordLink href={`/invoices/${service.invoice.id}`}>
                                  {service.invoice.number}
                                </RecordLink>
                              ) : (
                                <>
                                  Unbilled
                                  {management && (
                                    <details>
                                      <summary>Void incorrect service</summary>
                                      <ActionForm
                                        action={actions.voidService}
                                        submit="Void service"
                                      >
                                        <input type="hidden" name="id" value={service.id} />
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
                ) : (
                  <div className="card-body">
                    <Empty
                      title="No completed services"
                      text="Services will appear here after they are recorded."
                    />
                  </div>
                )}
              </section>
              {d.active && (
                <section className="card card-body space-top" id="create-invoice">
                  <h2>Create invoice from saved services</h2>
                  <p className="muted">
                    Select unbilled services. Previously scanned VIR inspections are already saved;
                    do not upload their PDFs again.
                  </p>
                  <ActionForm action={actions.createInvoice} submit="Create invoice draft">
                    <input type="hidden" name="dealershipId" value={d.id} />
                    <Field label="Invoice number · optional">
                      <input
                        name="number"
                        maxLength={40}
                        placeholder={`QP-${businessDate().slice(0, 4)}-0001`}
                      />
                    </Field>
                    <p className="muted">
                      Leave blank to assign the next QP-year-sequence number automatically.
                    </p>
                    <DateField name="issueDate" label="Invoice issue date" />
                    <TextField name="notes" label="Invoice notes" required={false} area />
                    <fieldset className="field wide dealer-unbilled-list">
                      <legend>Select completed services to invoice</legend>
                      {unbilled.length ? (
                        <SelectAllServices>
                          {unbilled.map((service) => (
                            <div className="dealer-saved-service" key={service.id}>
                              <label className="check-row">
                                <input type="checkbox" name="serviceIds" value={service.id} />
                                {service.date} · {service.description} · {service.quantity} ×{" "}
                                <Money cents={service.unitCents} />
                              </label>
                              {service.virReportCount > 0 && (
                                <small>
                                  {service.virReportCount} saved VIR reports · these are reused, not
                                  counted again
                                </small>
                              )}
                            </div>
                          ))}
                        </SelectAllServices>
                      ) : (
                        <p>No unbilled services recorded.</p>
                      )}
                    </fieldset>
                  </ActionForm>
                </section>
              )}
              <section className="card card-body space-top">
                <h2>Invoice history</h2>
                {d.invoices.length ? (
                  <div className="dealer-invoice-list">
                    {d.invoices.map((invoice) => (
                      <div className="dealer-invoice-row" key={invoice.id}>
                        <div>
                          <RecordLink href={`/invoices/${invoice.id}`}>{invoice.number}</RecordLink>
                          <span>
                            {
                              receivable(
                                {
                                  ...invoice,
                                  state: invoice.approvedAt ? invoice.state : "DRAFT",
                                },
                                invoice.payments,
                                asOf,
                              ).status
                            }
                            {invoice.archivedAt ? " · Archived" : ""}
                          </span>
                        </div>
                        <Money cents={invoice.totalCents} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty title="No invoices yet" text="New invoices will appear here." />
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
