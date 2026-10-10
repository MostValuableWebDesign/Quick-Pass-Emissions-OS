import Link from "next/link";
import { currentUser } from "@/lib/access";
import { businessDate, formatDate } from "@/lib/time";
import { providerDetail } from "@/modules/support/service";
import { CATEGORIES } from "@/modules/support/rules";
import { PageHeader, Empty } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { RecordId, TextField, Reason, SelectField } from "@/components/phase3";
import { ContactLine } from "@/components/support-contact";
import { ContactedAtField } from "@/components/support-forms";
import { VendorForm } from "@/components/support-vendor-form";
import {
  saveDirectory,
  associateSupport,
  logContact,
  setProviderStatus,
} from "@/app/support-actions";

export default async function ProviderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentUser();
  const d = await providerDetail(actor.id, id);
  const p = d.provider;
  const priv = d.privateProvider;
  const s = (v: string | null | undefined) => v ?? "";
  return (
    <>
      <PageHeader
        title={p.name}
        description="Provider contact details, instructions and self-reported contact history."
      >
        <Link href="/vendors">Back to directory</Link>
      </PageHeader>
      <p style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
        <span className={p.active ? "badge green" : "badge neutral"}>
          {p.active ? "Active" : "Archived"}
        </span>
        {p.verifiedDate ? (
          <span className="badge green">Verified contact {p.verifiedDate}</span>
        ) : (
          <span className="badge amber">Document-sourced · unconfirmed</span>
        )}
        {p.preferences.map((x) => (
          <span key={x.category} className="badge">
            Preferred: {x.category}
          </span>
        ))}
      </p>
      <p className="muted">
        Last confirmed: {p.lastConfirmedDate ? p.lastConfirmedDate : "not recorded"}
      </p>
      {!p.verifiedDate && (
        <p className="notice">
          Source-provided reference only. Confirm independently before relying on it.
        </p>
      )}
      <div className="two-columns space-top">
        <section className="card card-body">
          <h2>Contact</h2>
          {p.contact && <p>Primary: {p.contact}</p>}
          <ContactLine kind="phone" label="Phone" value={p.phone} extension={p.extension} />
          <ContactLine kind="email" label="Email" value={p.email} />
          {p.alternateContact && <p>Alternate: {p.alternateContact}</p>}
          <ContactLine
            kind="phone"
            label="Alternate phone"
            value={p.alternatePhone}
            extension={p.alternateExtension}
          />
          <ContactLine kind="email" label="Alternate email" value={p.alternateEmail} />
          <ContactLine kind="phone" label="Emergency phone" value={p.emergencyPhone} />
          <ContactLine kind="url" label="Support portal" value={p.supportUrl} />
          <ContactLine kind="url" label="Website" value={p.website} />
          {!p.phone &&
            !p.email &&
            !p.alternatePhone &&
            !p.alternateEmail &&
            !p.emergencyPhone &&
            !p.supportUrl &&
            !p.website && <p className="notice">No contact method recorded for this provider.</p>}
          <p className="muted">
            Phone links need a calling app; on desktop, copy the number if nothing opens. Using a
            link does not log contact.
          </p>
        </section>
        <section className="card card-body">
          <h2>Service information</h2>
          <p>
            <strong>Categories:</strong>{" "}
            {p.categories.length ? p.categories.join(" · ") : "None recorded"}
          </p>
          {[
            ["Hours", p.hours],
            ["Supported services", p.supportedServices],
            ["Emergency details", p.emergencyDetails],
            ["Operational instructions", p.operationalInstructions],
            ["Source", p.sourceReference],
          ].map(([k, v]) => (
            <p key={k} style={{ whiteSpace: "pre-wrap" }}>
              <strong>{k}:</strong> {v || <span className="muted">Not recorded</span>}
            </p>
          ))}
        </section>
      </div>

      <section className="card card-body space-top">
        <h2>{d.management ? "Contact history" : "Your contact history"}</h2>
        <p className="muted">
          Entries are self-reported. They are never verified communication and do not confirm a
          repair was completed.
        </p>
        {d.history.length === 0 ? (
          <Empty title="No contact entries" text="Nothing has been logged for this provider yet." />
        ) : (
          <ul className="stack">
            {d.history.map((h) => (
              <li key={h.id} className="card card-body">
                <strong>
                  {formatDate(h.contactedAt)} · {h.method.replace("_", " ").toLowerCase()}
                </strong>
                <span className="muted"> · reported by {h.actorName}</span>
                {h.outcome && <p style={{ whiteSpace: "pre-wrap" }}>{h.outcome}</p>}
                {h.reference && <p className="muted">Reference: {h.reference}</p>}
                {h.followUpDate && <p>Follow up: {h.followUpDate}</p>}
                {h.ticketId && (
                  <p>
                    <Link href={`/maintenance/${h.ticketId}`}>
                      Related ticket:{" "}
                      {d.tickets.find((t) => t.id === h.ticketId)?.title ?? "ticket"}
                    </Link>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {p.active ? (
          <details className="space-top">
            <summary>Log a contact (self-reported)</summary>
            <ActionForm action={logContact} submit="Log self-reported contact">
              <input type="hidden" name="vendorId" value={p.id} />
              <ContactedAtField />
              <Field label="Method">
                <select name="method" defaultValue="PHONE">
                  <option value="PHONE">Phone</option>
                  <option value="EMAIL">Email</option>
                  <option value="PORTAL">Portal</option>
                  <option value="IN_PERSON">In person</option>
                  <option value="OTHER">Other</option>
                </select>
              </Field>
              <SelectField
                label="Related ticket (optional)"
                name="ticketId"
                options={d.tickets.map((t) => ({ id: t.id, name: t.title }))}
                empty="None"
              />
              {d.management ? (
                <SelectField
                  label="Related equipment (optional)"
                  name="equipmentId"
                  options={d.equipment}
                  empty="None"
                />
              ) : (
                <input type="hidden" name="equipmentId" value="" />
              )}
              <TextField name="outcome" label="What happened" area required={false} />
              <TextField
                name="reference"
                label="Provider reference / case number"
                required={false}
              />
              <Field label="Follow-up date (optional)">
                <input type="date" name="followUpDate" />
              </Field>
            </ActionForm>
          </details>
        ) : (
          <p className="notice">Archived providers cannot receive new contact entries.</p>
        )}
      </section>

      {d.management && priv && (
        <>
          <section className="card card-body space-top">
            <h2>Manager-only record</h2>
            <ActionForm
              action={setProviderStatus}
              submit={p.active ? "Archive provider" : "Reactivate provider"}
            >
              <RecordId id={p.id} version={p.version} />
              <input type="hidden" name="active" value={String(!p.active)} />
              <Reason label="Status change reason" />
            </ActionForm>
            <p>
              Archival retains all ticket, equipment and contact-history references. Verification
              requirements are unchanged.
            </p>
            <p>
              <strong>Account reference:</strong> {priv.accountReference || "Not recorded"}
            </p>
            <p>
              <strong>Verification evidence:</strong> {priv.reference || "Not recorded"}
            </p>
            <p style={{ whiteSpace: "pre-wrap" }}>
              <strong>Notes:</strong> {priv.notes || "None"}
            </p>
          </section>
          <section className="card card-body space-top">
            <h2>Support directory details</h2>
            <ActionForm action={saveDirectory} submit="Save directory details">
              <RecordId id={p.id} version={p.version} />
              <fieldset className="field wide">
                <legend>Categories</legend>
                {CATEGORIES.map((c) => (
                  <label key={c} style={{ display: "block" }}>
                    <input
                      type="checkbox"
                      name="categories"
                      value={c}
                      defaultChecked={p.categories.includes(c)}
                    />{" "}
                    {c}
                  </label>
                ))}
              </fieldset>
              <TextField
                name="extension"
                label="Phone extension (digits)"
                value={s(p.extension)}
                required={false}
              />
              <TextField
                name="alternateContact"
                label="Alternate contact"
                value={s(p.alternateContact)}
                required={false}
              />
              <TextField
                name="alternatePhone"
                label="Alternate phone (no extension)"
                value={s(p.alternatePhone)}
                required={false}
              />
              <TextField
                name="alternateExtension"
                label="Alternate extension (digits)"
                value={s(p.alternateExtension)}
                required={false}
              />
              <Field label="Alternate email">
                <input
                  type="email"
                  name="alternateEmail"
                  defaultValue={s(p.alternateEmail)}
                  maxLength={254}
                />
              </Field>
              <Field label="Website (http/https)">
                <input type="url" name="website" defaultValue={s(p.website)} maxLength={500} />
              </Field>
              <Field label="Support portal (http/https)">
                <input
                  type="url"
                  name="supportUrl"
                  defaultValue={s(p.supportUrl)}
                  maxLength={500}
                />
              </Field>
              <TextField
                name="emergencyPhone"
                label="Emergency phone"
                value={s(p.emergencyPhone)}
                required={false}
              />
              <TextField name="hours" label="Hours" value={s(p.hours)} area required={false} />
              <TextField
                name="emergencyDetails"
                label="Emergency details"
                value={s(p.emergencyDetails)}
                area
                required={false}
              />
              <TextField
                name="operationalInstructions"
                label="Operational instructions"
                value={s(p.operationalInstructions)}
                area
                required={false}
              />
              <TextField
                name="supportedServices"
                label="Supported services"
                value={s(p.supportedServices)}
                area
                required={false}
              />
              <TextField
                name="sourceReference"
                label="Source reference"
                value={s(p.sourceReference)}
                required={false}
              />
              <TextField
                name="accountReference"
                label="Account reference (manager-only)"
                value={s(priv.accountReference)}
                required={false}
              />
              <Field label="Last confirmed date (blank if unknown; requires verified contact)">
                <input
                  type="date"
                  name="lastConfirmedDate"
                  defaultValue={s(p.lastConfirmedDate)}
                  max={businessDate()}
                />
              </Field>
              <Reason />
            </ActionForm>
          </section>
          <section className="card card-body space-top">
            <h2>Equipment and bay associations</h2>
            {d.associations.length === 0 ? (
              <p className="muted">No associations.</p>
            ) : (
              <ul className="stack">
                {d.associations.map((a) => (
                  <li key={a.id}>
                    <ActionForm
                      action={associateSupport}
                      submit={`Remove ${a.equipment?.name ?? `bay ${a.bay?.identifier}`}`}
                    >
                      <input type="hidden" name="vendorId" value={p.id} />
                      <input type="hidden" name="version" value={p.version} />
                      <input type="hidden" name="equipmentId" value={a.equipmentId ?? ""} />
                      <input type="hidden" name="bayId" value={a.bayId ?? ""} />
                      <input type="hidden" name="remove" value="true" />
                      <p className="wide">
                        {a.equipment
                          ? `Equipment: ${a.equipment.name}`
                          : `Bay ${a.bay?.identifier}`}
                      </p>
                      <Reason label="Removal reason" />
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
            <div className="two-columns">
              <ActionForm action={associateSupport} submit="Add equipment">
                <input type="hidden" name="vendorId" value={p.id} />
                <input type="hidden" name="version" value={p.version} />
                <input type="hidden" name="bayId" value="" />
                <input type="hidden" name="remove" value="false" />
                <SelectField
                  label="Active equipment"
                  name="equipmentId"
                  options={d.equipment}
                  empty="Choose equipment"
                />
                <Reason />
              </ActionForm>
              <ActionForm action={associateSupport} submit="Add bay">
                <input type="hidden" name="vendorId" value={p.id} />
                <input type="hidden" name="version" value={p.version} />
                <input type="hidden" name="equipmentId" value="" />
                <input type="hidden" name="remove" value="false" />
                <SelectField
                  label="Bay"
                  name="bayId"
                  options={d.bays.map((b) => ({ id: b.id, name: b.identifier }))}
                  empty="Choose bay"
                />
                <Reason />
              </ActionForm>
            </div>
          </section>
          <section className="card card-body space-top">
            <h2>Verified primary contact</h2>
            <p className="muted">
              Name, primary phone/email, verification date and status are edited here separately.
            </p>
            <VendorForm vendor={priv} />
          </section>
        </>
      )}
    </>
  );
}
