import Link from "next/link";
import { currentUser } from "@/lib/access";
import { rentalOverview } from "@/modules/rentals/service";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { DemoNotice, TextField, Reason, Money } from "@/components/phase3";
import { createAgreement } from "@/app/phase3-actions";
export default async function Rentals() {
  const actor = await currentUser(),
    data = await rentalOverview(actor.id);
  return (
    <>
      <PageHeader
        title="Detailing-bay rentals"
        description="Owner-authorized agreements, monthly charges, and externally received payments."
      />
      <DemoNotice demo={data.demo} />
      {actor.role === "OWNER" && (
        <section className="card card-body">
          <h2>Authorize a rental agreement</h2>
          <p className="muted">
            Enter verified contract terms. Existing terms are retained; end the agreement and
            authorize a new nonoverlapping agreement to change terms.
          </p>
          <ActionForm action={createAgreement} submit="Authorize rental agreement">
            <Field label="Detailing bay">
              <select name="bayId" required>
                <option value="">Choose configured detailing bay</option>
                {data.bays.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.identifier}
                  </option>
                ))}
              </select>
            </Field>
            <TextField name="tenant" label="Tenant / business name" />
            <TextField name="contact" label="Verified tenant contact" area />
            <TextField name="reference" label="Unique agreement reference" />
            <Field label="Agreement start date">
              <input name="startDate" type="date" required />
            </Field>
            <Field label="Agreement end date · optional">
              <input name="endDate" type="date" />
            </Field>
            <Field label="Monthly rent · integer USD cents">
              <input name="monthlyCents" type="number" min="1" max="2000000000" required />
            </Field>
            <Field label="Monthly payment due day">
              <input name="dueDay" type="number" min="1" max="31" required />
            </Field>
            <TextField name="responsibilities" label="Verified maintenance responsibilities" area />
            <Reason label="Agreement authorization reference / reason" />
          </ActionForm>
        </section>
      )}
      <section className="card space-top">
        <div className="card-heading">
          <h2>Agreements · latest 100</h2>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Tenant / reference</th>
                <th>Bay</th>
                <th>Authorized dates</th>
                <th>Monthly amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.agreements.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link className="task-name" href={`/rentals/${a.id}`}>
                      {a.tenant}
                    </Link>
                    <small>{a.reference}</small>
                  </td>
                  <td>{a.bay.identifier}</td>
                  <td>
                    {a.startDate} → {a.endDate ?? "Open-ended"}
                  </td>
                  <td>
                    <Money cents={a.monthlyCents} />
                  </td>
                  <td>{a.status.toLowerCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.agreements.length && (
          <p className="card-body muted">No owner-authorized rental terms entered.</p>
        )}
      </section>
    </>
  );
}
