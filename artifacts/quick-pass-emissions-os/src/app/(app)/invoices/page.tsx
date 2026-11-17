import { RecordLink } from "@/components/record-link";
import Link from "next/link";
import { currentUser } from "@/lib/access";
import { businessDate } from "@/lib/time";
import { invoiceOverview, paymentOverview } from "@/modules/finance/service";
import { receivable } from "@/modules/finance/rules";
import { PageHeader } from "@/components/shared";
import { Field } from "@/components/action-form";
import { Money, DemoNotice } from "@/components/phase3";
import { Button } from "@/components/ui/button";
export default async function Invoices({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  const actor = await currentUser(),
    params = await searchParams,
    q = params.q ?? "",
    isPayments = params.view === "payments",
    isArchived = params.view === "archived",
    data = isPayments
      ? await paymentOverview(actor.id, q)
      : await invoiceOverview(actor.id, q, isArchived ? "archived" : "active");
  return (
    <>
      <PageHeader
        title={
          isPayments
            ? "Dealership payments"
            : isArchived
              ? "Archived invoices"
              : "Dealership invoices"
        }
        description={
          isPayments
            ? "Review received dealership payments and reversals."
            : "Active invoices are shown by default. Archived invoices stay in history and reports."
        }
      >
        <Link
          className={`button ${!isPayments && !isArchived ? "" : "button-secondary"}`}
          aria-current={!isPayments && !isArchived ? "page" : undefined}
          href={q ? `/invoices?q=${encodeURIComponent(q)}` : "/invoices"}
        >
          Active invoices
        </Link>
        <Link
          className={`button ${isArchived ? "" : "button-secondary"}`}
          aria-current={isArchived ? "page" : undefined}
          href={`/invoices?view=archived${q ? `&q=${encodeURIComponent(q)}` : ""}`}
        >
          Archived invoices
        </Link>
        <Link
          className={`button ${isPayments ? "" : "button-secondary"}`}
          aria-current={isPayments ? "page" : undefined}
          href={`/invoices?view=payments${q ? `&q=${encodeURIComponent(q)}` : ""}`}
        >
          Payments
        </Link>
      </PageHeader>
      <DemoNotice demo={data.demo} />
      <section className="card card-body">
        <form className="form-grid" method="get">
          <Field
            label={
              isPayments
                ? "Search reference, invoice number or dealership"
                : "Search invoice number or dealership"
            }
          >
            <input name="q" defaultValue={q} maxLength={160} />
            {(isPayments || isArchived) && (
              <input type="hidden" name="view" value={isPayments ? "payments" : "archived"} />
            )}
          </Field>
          <div className="form-footer">
            <Button type="submit">{isPayments ? "Search payments" : "Search invoices"}</Button>
          </div>
        </form>
      </section>
      {"payments" in data ? (
        <section className="card space-top">
          <div className="card-heading">
            <h2>Payments · latest 100 matches</h2>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice / dealership</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.date}</td>
                    <td>
                      <RecordLink className="task-name" href={`/invoices/${payment.invoiceId}`}>
                        {payment.invoice.number}
                      </RecordLink>
                      <small>{payment.invoice.dealership.name}</small>
                    </td>
                    <td>{payment.reference}</td>
                    <td>
                      <Money
                        cents={payment.reversesId ? -payment.amountCents : payment.amountCents}
                      />
                    </td>
                    <td>
                      {payment.reversesId ? "Reversal" : payment.reversal ? "Reversed" : "Received"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.payments.length && (
            <p className="card-body muted">No dealership payments match this search.</p>
          )}
        </section>
      ) : (
        <section className="card space-top">
          <div className="card-heading">
            <h2>{isArchived ? "Archived invoices" : "Active invoices"}</h2>
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
                        <RecordLink className="task-name" href={`/invoices/${i.id}`}>
                          {i.number}
                        </RecordLink>
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
                        {i.archivedAt ? "Archived" : s.status}
                        {i.archivedAt && <small>Retained in reports and history</small>}
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
              {isArchived
                ? "No archived invoices match this search."
                : "No active invoices match. Open a dealership to record services and draft an invoice."}
            </p>
          )}
        </section>
      )}
    </>
  );
}
