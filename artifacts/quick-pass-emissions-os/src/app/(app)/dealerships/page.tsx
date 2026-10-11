import { RecordLink } from "@/components/record-link";
import { currentUser } from "@/lib/access";
import { dealerOverview } from "@/modules/finance/service";
import { PageHeader, Empty } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { DemoNotice, RecordId, TextField } from "@/components/phase3";
import { saveDealer } from "@/app/phase4-actions";
import { Button } from "@/components/ui/button";
export default async function Dealers({ searchParams }: { searchParams: Promise<{ q?: string; partners?: string }> }) {
  const actor = await currentUser(),
    params = await searchParams,
    q = params.q ?? "",
    scope = params.partners === "all" ? "all" : params.partners === "archived" ? "archived" : "active",
    data = await dealerOverview(actor.id, q, scope);
  return (
    <>
      <PageHeader
        title="Dealerships & contacts"
        description="Billing accounts, contact records, completed services, and owner-authorized terms."
      />
      <DemoNotice demo={data.demo} />
      <details className="card dealership-add-card">
        <summary className="button button-primary dealership-add-toggle">
          <span>Add dealership</span>
        </summary>
        <div className="card-body">
          <ActionForm action={saveDealer} submit="Add dealership">
            <RecordId />
            <TextField name="name" label="Dealership name" />
            <Field label="Phone">
              <input name="phone" type="tel" maxLength={50} />
            </Field>
            <TextField name="billingAddress" label="Billing address" area />
            <TextField name="notes" label="Private account notes" required={false} area />
          </ActionForm>
        </div>
      </details>
      <section className="card space-top">
        <div className="card-heading">
          <h2>{scope === "active" ? "Active dealership partners" : "Dealership directory"} · up to 100 matches</h2>
        </div>
        <form className="card-body form-grid" method="get">
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
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Phone</th>
                <th>Contacts</th>
                <th>Terms</th>
                <th>Partnership</th>
                <th>Billing</th>
              </tr>
            </thead>
            <tbody>
              {data.dealers.map((d) => (
                <tr key={d.id}>
                  <td>
                    <RecordLink className="task-name" href={`/dealerships/${d.id}`}>
                      {d.name}
                    </RecordLink>
                  </td>
                  <td>{d.phone ? <a href={`tel:${d.phone}`}>{d.phone}</a> : "—"}</td>
                  <td>
                    {d.contacts.length ? d.contacts.map((c) => (
                      <div key={c.id}>
                        {c.name}
                        {c.email && <small><a href={`mailto:${c.email}`}>{c.email}</a></small>}
                      </div>
                    )) : "None entered"}
                  </td>
                  <td>
                    {d.termsDays === null
                      ? "Owner configuration required"
                      : `Net ${d.termsDays} days`}
                  </td>
                  <td>{d.active ? "Active" : "Archived"}</td>
                  <td>
                    {d.active && <RecordLink href={`/dealerships/${d.id}#create-invoice`}>Create invoice</RecordLink>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.dealers.length && (
          <Empty
            title="No dealerships found"
            text="Add an account using verified business details."
          />
        )}
      </section>
    </>
  );
}
