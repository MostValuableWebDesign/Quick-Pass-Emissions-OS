import { RecordLink } from "@/components/record-link";
import { currentUser } from "@/lib/access";
import { businessDate } from "@/lib/time";
import { financeReport, datasets, categories } from "@/modules/finance/service";
import { sumCents } from "@/modules/finance/rules";
import { PageHeader } from "@/components/shared";
import { DemoNotice, Money } from "@/components/phase3";
import { RangeForm, CompletenessNotice } from "@/components/finance";
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const actor = await currentUser(),
    q = await searchParams,
    end = q.end ?? businessDate(),
    start = q.start ?? `${end.slice(0, 7)}-01`,
    data = await financeReport(actor.id, { start, end });
  return (
    <>
      <PageHeader
        title="Finance reports & exports"
        description="Dealership A/R aging and complete source records for accounting reconciliation."
      />
      <DemoNotice demo={data.demo} />
      <CompletenessNotice />
      <section className="card card-body">
        <RangeForm start={start} end={end} />
      </section>
      <section className="card card-body space-top">
        <h2>Accounting CSV exports</h2>
        <p className="muted">
          All matching records are included. Amounts are integer USD cents. Reversals are signed
          negative rows; retain them. Draft/void invoice records and estimated/void finance entries
          are labeled and must be excluded or mapped by your accountant. Aging includes all approved
          invoices issued through the end date, regardless of the start date. These exports do not
          post to accounting or establish complete books.
        </p>
        <div className="module-links">
          {datasets.map((d) => (
            <a key={d} href={`/api/finance/export?dataset=${d}&start=${start}&end=${end}`}>
              Download {d.replaceAll("-", " ")} CSV
            </a>
          ))}
        </div>
      </section>
      <section className="card space-top">
        <div className="card-heading">
          <h2>Other receipts & expenses by category</h2>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Category / direction</th>
                <th>Manual actuals</th>
                <th>Verified actuals</th>
                <th>Estimates · excluded</th>
              </tr>
            </thead>
            <tbody>
              {categories.flatMap((category) =>
                (["REVENUE", "EXPENSE"] as const).map((direction) => {
                  const entries = data.entries.filter(
                    (e) =>
                      e.category === category &&
                      e.direction === direction &&
                      (!e.voidDate || e.voidDate > end),
                  );
                  if (!entries.length) return null;
                  return (
                    <tr key={`${category}-${direction}`}>
                      <td>
                        {category.replaceAll("_", " ").toLowerCase()} · {direction.toLowerCase()}
                      </td>
                      <td>
                        <Money
                          cents={sumCents(
                            entries
                              .filter((e) => e.basis === "MANUAL" && !e.verifiedAt)
                              .map((e) => e.amountCents),
                          )}
                        />
                      </td>
                      <td>
                        <Money
                          cents={sumCents(
                            entries
                              .filter((e) => e.basis === "MANUAL" && e.verifiedAt)
                              .map((e) => e.amountCents),
                          )}
                        />
                      </td>
                      <td>
                        <Money
                          cents={sumCents(
                            entries.filter((e) => e.basis === "ESTIMATE").map((e) => e.amountCents),
                          )}
                        />
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
        <p className="card-body muted">
          This table covers other finance entries only. Dealership and rental receipts have separate
          registers and exports. No automatic expense inference or profit calculation.
        </p>
      </section>
      <section className="card space-top">
        <div className="card-heading">
          <h2>Dealership accounts receivable · {end}</h2>
          <strong>
            <Money cents={data.totals.outstanding} />
          </strong>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {["Current", "1–30 days", "31–60 days", "61–90 days", "91+ days"].map((b) => (
                  <th key={b}>{b}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {["Current", "1–30 days", "31–60 days", "61–90 days", "91+ days"].map((b) => (
                  <td key={b}>
                    <Money
                      cents={sumCents(
                        data.aging.filter((i) => i.bucket === b).map((i) => i.remainingCents),
                      )}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Dealer / invoice</th>
                <th>Due date</th>
                <th>Days overdue</th>
                <th>Bucket</th>
                <th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {data.aging.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.dealership.name}
                    <small>
                      <RecordLink href={`/invoices/${i.id}`}>{i.number}</RecordLink>
                    </small>
                  </td>
                  <td>{i.dueDate}</td>
                  <td>{i.days}</td>
                  <td>{i.bucket}</td>
                  <td>
                    <Money cents={i.remainingCents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.aging.length && (
          <p className="card-body muted">
            No outstanding approved dealership invoices as of this date.
          </p>
        )}
        <p className="card-body muted">
          Payments and reversals are included by effective date. A partially paid overdue invoice
          stays in its overdue bucket. Rental receipts are exported separately; rental charges
          remain in the rental register. Current account names and current approval/verification
          state are used; this is not a frozen historical accounting statement.
        </p>
      </section>
    </>
  );
}
