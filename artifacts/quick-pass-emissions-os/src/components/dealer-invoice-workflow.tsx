"use client";

import { useMemo, useState } from "react";
import { ActionForm } from "@/components/action-form";
import * as actions from "@/app/phase4-actions";

type SavedService = {
  id: string;
  date: string;
  description: string;
  quantity: number;
  unitCents: number;
  virReportCount: number;
};

const STEPS = ["Select services", "Review billing", "Confirm draft"];

function StepProgress({ step }: { step: number }) {
  return (
    <ol className="dealer-invoice-steps" aria-label="Invoice creation progress">
      {STEPS.map((label, index) => {
        const number = index + 1;
        return (
          <li
            key={label}
            className={number === step ? "is-current" : number < step ? "is-complete" : ""}
            aria-current={number === step ? "step" : undefined}
          >
            <span>{number < step ? "✓" : number}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function DealerInvoiceWorkflow({
  dealershipId,
  services,
  taxBps,
  termsReady,
  issueDate,
}: {
  dealershipId: string;
  services: SavedService[];
  taxBps: number | null;
  termsReady: boolean;
  issueDate: string;
}) {
  const [step, setStep] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(issueDate);
  const [notes, setNotes] = useState("");

  const selected = useMemo(
    () => services.filter((service) => selectedIds.includes(service.id)),
    [services, selectedIds],
  );
  const totals = useMemo(() => {
    const subtotal = selected.reduce((sum, service) => sum + service.quantity * service.unitCents, 0);
    const tax =
      taxBps === null ? 0 : Math.floor((subtotal * taxBps + 5000) / 10000);
    return {
      inspections: selected.reduce((sum, service) => sum + service.quantity, 0),
      subtotal,
      tax,
      total: subtotal + tax,
    };
  }, [selected, taxBps]);

  function toggleService(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((serviceId) => serviceId !== id),
    );
  }

  function selectAll(checked: boolean) {
    setSelectedIds(checked ? services.map((service) => service.id) : []);
  }

  return (
    <section className="card card-body space-top dealer-invoice-wizard" id="create-invoice">
      <div className="dealer-invoice-heading">
        <div>
          <p className="dealer-invoice-eyebrow">INVOICE WORKFLOW</p>
          <h2>Create invoice from saved services</h2>
          <p className="muted">
            Choose unbilled inspections, verify the bill, then create a draft to review before
            sending.
          </p>
        </div>
      </div>

      <StepProgress step={step} />

      {step === 1 && (
        <div className="dealer-invoice-step-panel">
          <div className="dealer-invoice-step-heading">
            <div>
              <span className="dealer-invoice-step-number">STEP 1</span>
              <h3>Select completed services to invoice</h3>
            </div>
            <span className="dealer-invoice-count">
              {selected.length} of {services.length} selected
            </span>
          </div>
          {services.length ? (
            <>
              <label className="dealer-select-all">
                <input
                  type="checkbox"
                  checked={selected.length === services.length}
                  ref={(input) => {
                    if (input) input.indeterminate = selected.length > 0 && selected.length < services.length;
                  }}
                  onChange={(event) => selectAll(event.target.checked)}
                />
                <span>Select all listed services</span>
              </label>
              <div className="dealer-invoice-service-list">
                {services.map((service) => {
                  const checked = selectedIds.includes(service.id);
                  return (
                    <label className="dealer-invoice-service" key={service.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleService(service.id, event.target.checked)}
                      />
                      <span className="dealer-invoice-service-main">
                        <strong>{service.date}</strong>
                        <span>{service.description}</span>
                        {service.virReportCount > 0 && (
                          <small>
                            {service.virReportCount} saved VIR reports · already reviewed and saved
                          </small>
                        )}
                      </span>
                      <span className="dealer-invoice-service-amount">
                        {service.quantity} × {formatMoney(service.unitCents)}
                        <strong>{formatMoney(service.quantity * service.unitCents)}</strong>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="dealer-invoice-step-actions">
                <span>
                  {totals.inspections} inspection{totals.inspections === 1 ? "" : "s"} ·{" "}
                  {formatMoney(totals.subtotal)} selected
                </span>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={!selected.length}
                  onClick={() => setStep(2)}
                >
                  Review billing
                </button>
              </div>
            </>
          ) : (
            <div className="dealer-invoice-empty">
              <p>No unbilled saved services are available for this dealership.</p>
              <p className="muted">
                To add new inspections, use <strong>Upload VIR PDFs</strong> above. Reports are
                processed in batches of up to 40 and reviewed before they can be billed.
              </p>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="dealer-invoice-step-panel">
          <div className="dealer-invoice-step-heading">
            <div>
              <span className="dealer-invoice-step-number">STEP 2</span>
              <h3>Review billing</h3>
            </div>
            <button type="button" className="button button-outline" onClick={() => setStep(1)}>
              Edit selection
            </button>
          </div>
          <div className="dealer-invoice-review-list">
            {selected.map((service) => (
              <div className="dealer-invoice-review-row" key={service.id}>
                <span>
                  <strong>{service.date}</strong>
                  <small>{service.description}</small>
                </span>
                <span>
                  {service.quantity} × {formatMoney(service.unitCents)}
                </span>
                <strong>{formatMoney(service.quantity * service.unitCents)}</strong>
              </div>
            ))}
          </div>
          <div className="dealer-invoice-totals" aria-label="Invoice amount summary">
            <div>
              <span>Billable inspections</span>
              <strong>{totals.inspections}</strong>
            </div>
            <div>
              <span>Subtotal</span>
              <strong>{formatMoney(totals.subtotal)}</strong>
            </div>
            <div>
              <span>Tax</span>
              <strong>{taxBps === null ? "Not configured" : formatMoney(totals.tax)}</strong>
            </div>
            <div className="is-total">
              <span>Invoice total</span>
              <strong>{formatMoney(totals.total)}</strong>
            </div>
          </div>
          <div className="dealer-invoice-fields">
            <label className="field">
              <span>Invoice issue date</span>
              <input
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Invoice number · optional</span>
              <input
                value={invoiceNumber}
                maxLength={40}
                placeholder={`QP-${invoiceDate.slice(0, 4)}-0001`}
                onChange={(event) => setInvoiceNumber(event.target.value)}
              />
              <small>Leave blank to assign the next invoice number.</small>
            </label>
            <label className="field wide">
              <span>Invoice notes · optional</span>
              <textarea value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} />
            </label>
          </div>
          {!termsReady && (
            <p className="dealer-invoice-warning" role="alert">
              Authorized dealership billing terms are required before creating a draft.{" "}
              <a href={`/dealerships/${dealershipId}?section=billing#billing-terms`}>
                Review billing settings
              </a>
            </p>
          )}
          <div className="dealer-invoice-step-actions">
            <span>Draft creation does not email the dealership or charge a payment method.</span>
            <button
              type="button"
              className="button button-primary"
              disabled={!selected.length || !invoiceDate || !termsReady}
              onClick={() => setStep(3)}
            >
              Continue to draft
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="dealer-invoice-step-panel">
          <div className="dealer-invoice-step-heading">
            <div>
              <span className="dealer-invoice-step-number">STEP 3</span>
              <h3>Confirm draft details</h3>
            </div>
            <button type="button" className="button button-outline" onClick={() => setStep(2)}>
              Back to review
            </button>
          </div>
          <div className="dealer-invoice-confirmation">
            <div>
              <span>Issue date</span>
              <strong>{invoiceDate}</strong>
            </div>
            <div>
              <span>Invoice number</span>
              <strong>{invoiceNumber || `Assigned automatically · ${invoiceDate.slice(0, 4)}`}</strong>
            </div>
            <div>
              <span>Inspections</span>
              <strong>{totals.inspections}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{formatMoney(totals.total)}</strong>
            </div>
          </div>
          <p className="muted">
            The draft will appear in this dealership’s invoice history. You can inspect its VIN
            details, create the email, and send it separately.
          </p>
          <ActionForm action={actions.createInvoice} submit="Create invoice draft">
            <input type="hidden" name="dealershipId" value={dealershipId} />
            <input type="hidden" name="issueDate" value={invoiceDate} />
            <input type="hidden" name="number" value={invoiceNumber} />
            <input type="hidden" name="notes" value={notes} />
            {selected.map((service) => (
              <input key={service.id} type="hidden" name="serviceIds" value={service.id} />
            ))}
          </ActionForm>
        </div>
      )}
    </section>
  );
}
