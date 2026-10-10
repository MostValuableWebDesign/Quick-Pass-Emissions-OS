import Link from "next/link";
import { Field } from "./action-form";
import { TextField, Reason } from "./phase3";
import { businessDate } from "@/lib/time";
import { Button } from "./ui/button";
export function FinanceNav() {
  return (
    <nav className="module-links" aria-label="Finance navigation">
      <Link href="/dealerships">Dealerships & contacts</Link>
      <Link href="/invoices">Invoices</Link>
      <Link href="/finance">Operational finance</Link>
      <Link href="/finance/reports">Reports & exports</Link>
    </nav>
  );
}
export function AmountField({
  label,
  name = "amountCents",
  value,
  min = 1,
  max = 2000000000,
}: {
  label: string;
  name?: string;
  value?: number | null;
  min?: number;
  max?: number;
}) {
  return (
    <Field label={label}>
      <input
        name={name}
        type="number"
        step="1"
        min={min}
        max={max}
        defaultValue={value ?? ""}
        required
      />
    </Field>
  );
}
export function DateField({
  label = "Business date",
  name = "date",
  value = businessDate(),
}: {
  label?: string;
  name?: string;
  value?: string;
}) {
  return (
    <Field label={label}>
      <input name={name} type="date" defaultValue={value} max={businessDate()} required />
    </Field>
  );
}
export function PaymentFields({ reversal = false }: { reversal?: boolean }) {
  return (
    <>
      {!reversal && <AmountField label="Received amount · integer USD cents" />}
      <DateField />
      <TextField
        name="reference"
        label={reversal ? "Unique reversal reference" : "Unique receipt reference"}
      />
      <TextField
        name="evidence"
        label={reversal ? "Reversal evidence / reason" : "External receipt evidence / reference"}
        area
      />
    </>
  );
}
export function ReviewFields() {
  return (
    <>
      <DateField />
      <TextField
        name="reference"
        label="External delivery reference · required for sent"
        required={false}
      />
      <Reason />
    </>
  );
}
export function CompletenessNotice() {
  return (
    <div className="notice warning">
      Operational records are incomplete until reconciled with your accounting system. Received
      payments are manual records. “Verified” means a separate reviewer checked the supplied
      evidence. Estimates are shown separately. These reports do not establish profit, tax
      liability, bank balances, or accounting completeness.
    </div>
  );
}
export function RangeForm({ start, end }: { start: string; end: string }) {
  return (
    <form className="form-grid" method="get">
      <DateField label="From date" name="start" value={start} />
      <DateField label="Through / aging as-of date" name="end" value={end} />
      <div className="form-footer">
        <Button type="submit">Update report dates</Button>
      </div>
    </form>
  );
}
