import Link from "next/link";
import { currentUser } from "@/lib/access";
import { businessDate } from "@/lib/time";
import { invoiceOverview } from "@/modules/finance/service";
import { receivable } from "@/modules/finance/rules";
import { PageHeader } from "@/components/shared";
import { Field } from "@/components/action-form";
import { Money, DemoNotice } from "@/components/phase3";
import { FinanceNav } from "@/components/finance";
import { Button } from "@/components/ui/button";
export default async function Invoices({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const actor = await currentUser(),
    q = (await searchParams).q ?? "",
    data = await invoiceOverview(actor.id, q);
  return (
    <>
      <PageHeader
        title="Dealership invoices"
        description="Draft, approve, record external delivery, and track received payments. Create drafts from a dealership’s completed services."
      />
      <FinanceNav />
      <DemoNotice demo={data.demo} />
      <section className="card card-body">
        <form className="form-grid" method="get">
          <Field label="Search invoice number or dealership">
            <input name="q" defaultValue={q} maxLength={160} />
          </Field>
          <div className="form-footer">
            <Button type="submit">Search invoices</Button>
          </div>
        </form>
      </section>
      <section className="card space-top">
        <div className="card-heading">
          <h2>Invoices · latest 100 matches</h2>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Invoice / dealership</th>
                <th>Issue / due</th>
                <th>Total</th>
                <th>Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((i) => {
                const s = receivable(
                  { ...i, state: i.approvedAt ? i.state : "DRAFT" },
                  i.payments,
                  businessDate(),
                );
                return (
                  <tr key={i.id}>
                    <td>
                      <Link className="task-name" href={`/invoices/${i.id}`}>
                        {i.number}
                      </Link>
                      <small>{i.dealership.name}</small>
                    </td>
                    <td>
                      {i.issueDate}
                      <small>Due {i.dueDate}</small>
                    </td>
                    <td>
                      <Money cents={i.totalCents} />
                    </td>
                    <td>
                      <Money cents={s.remainingCents} />
                    </td>
                    <td>
                      {s.status}
                      {s.paidCents > 0 && s.remainingCents > 0 && (
                        <small>Partial payment recorded</small>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!data.invoices.length && (
          <p className="card-body muted">
            No invoice records match. Open a dealership to record services and draft an invoice.
          </p>
        )}
      </section>
    </>
  );
}
