import Link from "next/link";

const currency = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

const responsibilities = [
  ["Check chemical levels", "Carwash", "Wash team", "Today · 8:00 AM", "In progress"],
  ["Confirm analyzer opening check", "Emissions", "Manager", "Today · 8:30 AM", "Done"],
  ["Count receipt paper and tag supplies", "Operations", "Manager", "Today · 10:00 AM", "To do"],
  ["Review Monday payroll payment evidence", "Payroll", "Owner", "Today · 12:00 PM", "Needs review"],
  ["Follow up on wash pump service", "Maintenance", "Manager", "Today · 2:00 PM", "In progress"],
  ["Reconcile dealership invoice balance", "Billing", "Office", "Today · 3:00 PM", "To do"],
  ["Inspect drain pits and record condition", "Carwash", "Wash team", "Tomorrow · 9:00 AM", "To do"],
  ["Review next week's promotional draft", "Marketing", "Owner", "Friday · 11:00 AM", "Draft"],
];

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join("-")}>
              {row.map((value, index) => <td key={`${index}-${value}`}>{value}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SamplePreviewControl({
  active,
  path,
}: {
  active: boolean;
  path: string;
}) {
  return active ? (
    <div className="notice" role="note">
      <strong>Sample preview only.</strong> Example counts, amounts, assignments, and statuses are
      not real records. Nothing here is saved or used for payroll, purchases, deposits, or task
      automation.{" "}
      <Link href={path}>Return to live data</Link>
    </div>
  ) : (
    <div className="notice">
      Preview how this area looks with example values without adding business records.{" "}
      <Link href={`${path}?sample=1`}>Show sample data</Link>
    </div>
  );
}

export function ManagerOverviewSample() {
  return (
    <div className="manager-grid">
      <section className="card card-body">
        <h2>Priorities & delegated work</h2>
        <p><strong>7</strong> open responsibilities · <strong>2</strong> need manager review</p>
        <p>1 overdue · 3 due today · 3 scheduled later</p>
        <Link href="/tasks?sample=1">View all sample responsibilities</Link>
      </section>
      <section className="card card-body">
        <h2>Staffing & equipment</h2>
        <p>3 of 4 example shifts recorded today</p>
        <p>5 registered assets · 1 sample service follow-up · 5 of 6 bays marked ready</p>
      </section>
      <section className="card card-body">
        <h2>Chemicals & supplies</h2>
        <p>Receipt paper · 2 rolls · reorder at 4</p>
        <p>Paper towels · 8 packs · reorder at 3</p>
        <p>Ink cartridges · 1 cartridge · reorder at 2</p>
        <Link href="/operations/supplies?sample=1">Open sample supplies</Link>
      </section>
      <section className="card card-body">
        <h2>Payroll · Monday payment</h2>
        <p>Example approved gross: {currency(4620)}</p>
        <p>Payment evidence: {currency(4620)} · pending independent reconciliation</p>
        <Link href="/operations/registers?sample=1">Open sample payments & deposits</Link>
      </section>
      <section className="card card-body">
        <h2>Billing, balances & deposits</h2>
        <p>2 example invoices outstanding · {currency(1260)} total</p>
        <p>2 example deposits recorded · 1 pending reconciliation</p>
      </section>
      <section className="card card-body">
        <h2>Maintenance & vendor follow-ups</h2>
        <p>Wash pump service call · waiting on appointment</p>
        <p>Drain-pit cleaning · example due this week</p>
      </section>
      <section className="card card-body">
        <h2>Marketing, website & promotions</h2>
        <p>Fall wash offer · draft · 2 review actions remaining</p>
        <p>Sample only; no marketing messages are scheduled or sent.</p>
      </section>
    </div>
  );
}

export function SuppliesSample() {
  return (
    <>
      <section className="card card-body">
        <h2>Example stock counts</h2>
        <DataTable
          headers={["Supply", "On hand", "Reorder at", "Status", "Preferred source"]}
          rows={[
            ["Receipt paper", "2 rolls", "4 rolls", "Reorder attention", "Amazon"],
            ["Paper towels", "8 packs", "3 packs", "Stocked", "Walmart"],
            ["Tag scrapers", "24 pieces", "5 pieces", "Stocked", "Amazon"],
            ["Ink cartridges", "1 cartridge", "2 cartridges", "Reorder attention", "Office supplier"],
          ]}
        />
      </section>
      <section className="card card-body">
        <h2>Example purchase history</h2>
        <DataTable
          headers={["Reference", "Supply", "Quantity", "Vendor", "Status"]}
          rows={[
            ["SAMPLE-PO-015", "Receipt paper", "2 rolls", "Amazon", "Received"],
            ["SAMPLE-PO-014", "Paper towels", "4 packs", "Walmart", "Prepared"],
          ]}
        />
      </section>
      <p className="muted">
        These sample records do not create an order or change recorded stock. Chemical quantities
        remain in the Chemicals area.
      </p>
    </>
  );
}

export function PaymentsDepositsSample() {
  return (
    <>
      <section className="card card-body">
        <h2>Example payroll payment evidence</h2>
        <DataTable
          headers={["Record", "Amount", "Method", "Status", "Notes"]}
          rows={[
            ["SAMPLE-PAY-042", currency(4620), "Check", "Pending reconciliation", "Example approved gross"],
          ]}
        />
      </section>
      <section className="card card-body">
        <h2>Example checks & deposits</h2>
        <DataTable
          headers={["Reference", "Date", "Amount", "Method", "Status"]}
          rows={[
            ["SAMPLE-CHK-104", "Oct 26", currency(1240), "Check awaiting deposit", "Pending"],
            ["SAMPLE-DEP-101", "Oct 23", currency(820), "Remote deposit", "Reconciled"],
          ]}
        />
      </section>
      <p className="muted">
        Example evidence only. No bank connection, payment, deposit, or reconciliation was created.
      </p>
    </>
  );
}

export function ResponsibilitiesSample() {
  return (
    <section className="card">
      <div className="card-heading">
        <h2>{responsibilities.length} sample responsibilities</h2>
        <span className="muted">Example statuses · not assigned to real staff</span>
      </div>
      <DataTable
        headers={["Responsibility", "Area", "Example owner", "Due", "Status"]}
        rows={responsibilities}
      />
    </section>
  );
}
