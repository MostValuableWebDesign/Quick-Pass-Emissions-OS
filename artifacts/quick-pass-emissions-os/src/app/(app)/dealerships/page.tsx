import { RecordLink } from "@/components/record-link";
import { currentUser } from "@/lib/access";
import { dealerOverview } from "@/modules/finance/service";
import { PageHeader, Empty } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { DirectoryAddDialog } from "@/components/directory-add-dialog";
import { DemoNotice, Money, RecordId } from "@/components/phase3";
import { DealershipFields } from "@/components/dealership-fields";
import { saveDealer } from "@/app/phase4-actions";
import { Button } from "@/components/ui/button";
import { DealerVirUpload } from "@/components/dealer-vir-upload";
import { dealerVirOptions } from "@/modules/finance/dealer-vir-service";
export default async function Dealers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; partners?: string }>;
}) {
  const actor = await currentUser(),
    params = await searchParams,
    q = params.q ?? "",
    scope =
      params.partners === "all" ? "all" : params.partners === "archived" ? "archived" : "active",
    data = await dealerOverview(actor.id, q, scope),
    virDealers = await dealerVirOptions(actor.id);
  return (
    <>
      <PageHeader
        title="Dealerships"
        description="Partner accounts, contact details, and invoice status."
      >
        <DealerVirUpload dealers={virDealers} />
        <DirectoryAddDialog title="Add dealership">
          <ActionForm action={saveDealer} submit="Add dealership">
            <RecordId />
            <DealershipFields />
          </ActionForm>
        </DirectoryAddDialog>
      </PageHeader>
      <DemoNotice demo={data.demo} />
      <section className="card card-body space-top dealer-directory-filters">
        <form className="form-grid" method="get">
          <Field label="Search dealership, contact, email or phone">
            <input name="q" defaultValue={q} maxLength={160} />
          </Field>
          <Field label="Partnerships">
            <select name="partners" defaultValue={scope}>
              <option value="active">Active partners</option>
              <option value="all">All dealerships</option>
              <option value="archived">Archived dealerships</option>
            </select>
          </Field>
          <div className="form-footer">
            <Button type="submit">Search dealerships</Button>
          </div>
        </form>
      </section>
      <div className="dealer-directory-caption">
        <h2>
          {scope === "active"
            ? "Active partners"
            : scope === "archived"
              ? "Archived dealerships"
              : "All dealerships"}
        </h2>
        <span>{data.dealers.length} shown</span>
      </div>
      {data.dealers.length ? (
        <section className="dealer-directory-grid" aria-label="Dealership accounts">
          {data.dealers.map((d) => {
            const contact = d.contacts[0];
            const contactEmail = contact?.email || d.email;
            const contactPhone = contact?.phone || d.phone;
            return (
              <article className="card dealer-directory-card" key={d.id}>
                <div className="dealer-directory-card-heading">
                  <div>
                    <RecordLink className="dealer-directory-name" href={`/dealerships/${d.id}`}>
                      {d.name}
                    </RecordLink>
                    <p className="muted">
                      {contact?.name || (d.email ? "Billing contact" : "Contact not added")}
                    </p>
                  </div>
                  <span className={`badge ${d.active ? "green" : "neutral"}`}>
                    {d.active ? "Active" : "Archived"}
                  </span>
                </div>
                <div className="dealer-directory-metrics">
                  <div>
                    <span>Contact</span>
                    {contactEmail ? (
                      <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
                    ) : (
                      <strong>Not provided</strong>
                    )}
                  </div>
                  <div>
                    <span>Phone</span>
                    {contactPhone ? (
                      <a href={`tel:${contactPhone}`}>{contactPhone}</a>
                    ) : (
                      <strong>Not provided</strong>
                    )}
                  </div>
                  <div>
                    <span>Balance due</span>
                    <strong>
                      <Money cents={d.outstandingCents} />
                    </strong>
                  </div>
                  <div>
                    <span>Latest invoice</span>
                    <strong>{d.latestInvoice?.status ?? "No invoices yet"}</strong>
                    {d.latestInvoice && <small>{d.latestInvoice.number}</small>}
                  </div>
                </div>
                <div className="dealer-directory-card-actions">
                  <RecordLink className="button button-outline" href={`/dealerships/${d.id}`}>
                    Open account
                  </RecordLink>
                  {d.active && (
                    <RecordLink
                      className="button button-primary"
                      href={`/dealerships/${d.id}?section=services#create-invoice`}
                    >
                      Create invoice
                    </RecordLink>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <Empty
          title="No dealerships found"
          text="Adjust your search or add a dealership partner."
        />
      )}
    </>
  );
}
