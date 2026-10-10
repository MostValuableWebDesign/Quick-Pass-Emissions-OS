import { RecordLink } from "@/components/record-link";
import { currentUser } from "@/lib/access";
import { dealerOverview } from "@/modules/finance/service";
import { PageHeader, Empty } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { DemoNotice, RecordId, TextField, ActiveField, Reason } from "@/components/phase3";
import { saveDealer } from "@/app/phase4-actions";
import { Button } from "@/components/ui/button";
export default async function Dealers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await currentUser(),
    q = (await searchParams).q ?? "",
    data = await dealerOverview(actor.id, q);
  return (
    <>
      <PageHeader
        title="Dealerships & contacts"
        description="Billing accounts, contact records, completed services, and owner-authorized terms."
      />
      <DemoNotice demo={data.demo} />
      <section className="card card-body">
        <h2>Add dealership</h2>
        <ActionForm action={saveDealer} submit="Add dealership">
          <RecordId />
          <TextField name="code" label="Unique dealership code" />
          <TextField name="name" label="Dealership name" />
          <TextField name="billingAddress" label="Billing address / instructions" area />
          <TextField name="notes" label="Private account notes" required={false} area />
          <ActiveField />
          <Reason />
        </ActionForm>
      </section>
      <section className="card space-top">
        <div className="card-heading">
          <h2>Directory · up to 100 matches</h2>
        </div>
        <form className="card-body form-grid" method="get">
          <Field label="Search name or account code">
            <input name="q" defaultValue={q} maxLength={160} />
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
                <th>Contacts</th>
                <th>Terms</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.dealers.map((d) => (
                <tr key={d.id}>
                  <td>
                    <RecordLink className="task-name" href={`/dealerships/${d.id}`}>
                      {d.name}
                    </RecordLink>
                    <small>{d.code}</small>
                  </td>
                  <td>{d.contacts.map((c) => c.name).join(", ") || "None entered"}</td>
                  <td>
                    {d.termsDays === null
                      ? "Owner configuration required"
                      : `Net ${d.termsDays} days`}
                  </td>
                  <td>{d.active ? "Active" : "Archived"}</td>
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
