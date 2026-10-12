"use client";
import { useEffect, useRef, useState } from "react";
import { MarketingField as Field } from "./marketing-field";

/** Promo offer value input whose meaning follows the selected kind. */
export function PromoValueFields({
  kind = "FIXED",
  value,
  locked = false,
}: {
  kind?: string;
  value?: string;
  locked?: boolean;
}) {
  const [current, setCurrent] = useState(kind);
  return (
    <>
      <Field label="Offer type">
        <select
          name="kind"
          defaultValue={kind}
          onChange={(e) => setCurrent(e.target.value)}
          disabled={locked}
        >
          <option value="FIXED">Fixed amount off (USD)</option>
          <option value="PERCENT">Percentage off</option>
        </select>
        {locked && <input type="hidden" name="kind" value={kind} />}
      </Field>
      <Field
        label={current === "PERCENT" ? "Percent off · e.g. 12.5" : "Amount off · USD, e.g. 5.00"}
      >
        <input
          name="offerValue"
          inputMode="decimal"
          pattern="\d{1,8}(\.\d{1,2})?"
          required
          defaultValue={value}
          readOnly={locked}
        />
      </Field>
    </>
  );
}

/**
 * Marketing source fields for the dealership service form. They only apply to a
 * single service; any other quantity disables them so they are not submitted.
 */
export function ServiceSourceFields({
  sources,
  campaigns,
  isOwner,
}: {
  sources: { value: string; label: string }[];
  campaigns: { id: string; name: string; startDate: string; endDate: string }[];
  isOwner: boolean;
}) {
  const ref = useRef<HTMLFieldSetElement>(null);
  const [single, setSingle] = useState(true);
  const [source, setSource] = useState("");
  const [kind, setKind] = useState("UNKNOWN");
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const check = () => {
      const q = form.querySelector<HTMLInputElement>('input[name="quantity"]');
      setSingle(!q || q.value === "" || q.value === "1");
    };
    check();
    form.addEventListener("input", check);
    return () => form.removeEventListener("input", check);
  }, []);
  const canAttribute = !!source && source !== "UNKNOWN";
  return (
    <fieldset ref={ref} className="field wide mk-fieldset" disabled={!single}>
      <legend>How did you hear about us? · optional</legend>
      {!single && (
        <p className="mk-hint warn">
          Source, campaign and promo details apply only to a quantity of 1. They are disabled and
          will not be saved for this batch.
        </p>
      )}
      <div className="form-grid mk-inner">
        <Field label="Customer-reported source">
          <select name="customerSource" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Not asked</option>
            {sources.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Campaign the customer named">
          <select name="reportedCampaignId" defaultValue="" disabled={!canAttribute}>
            <option value="">None stated</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.startDate} to {c.endDate}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Inspection classification">
          <select name="inspectionKind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="UNKNOWN">Unknown</option>
            <option value="PAID">Paid inspection</option>
            <option value="OTHER">Other service</option>
          </select>
        </Field>
        <Field
          label={kind === "PAID" ? "Paid classification evidence · required" : "Source evidence"}
        >
          <input name="sourceEvidence" maxLength={2000} required={kind === "PAID" && single} />
        </Field>
        {isOwner && (
          <Field label="Promo code · owner applies">
            <input name="promoCode" maxLength={30} autoCapitalize="characters" />
          </Field>
        )}
      </div>
      <p className="mk-hint">
        Only stated campaigns are recorded; nothing is inferred. Unknown or missing responses cannot
        be tied to a campaign. Free retests are not charged services. An offer must leave a positive
        charge.
      </p>
    </fieldset>
  );
}

/** Source + optional campaign pair that disables campaign for unknown/missing. */
export function SourceCampaignFields({
  sources,
  campaigns,
  source = "",
  campaignId = "",
}: {
  sources: { value: string; label: string }[];
  campaigns: { id: string; name: string }[];
  source?: string;
  campaignId?: string;
}) {
  const [value, setValue] = useState(source);
  const canAttribute = !!value && value !== "UNKNOWN";
  return (
    <>
      <Field label="Customer-reported source">
        <select name="source" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Not asked / missing</option>
          {sources.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Campaign the customer named · optional">
        <select name="campaignId" defaultValue={campaignId} disabled={!canAttribute}>
          <option value="">None stated</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}
