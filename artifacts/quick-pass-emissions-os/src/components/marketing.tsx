import Link from "next/link";
import { ActionForm } from "./action-form";
import { MarketingField as Field } from "./marketing-field";
import { Badge } from "./phase5";
import { Money } from "./phase3";
import { channels, sourceLabels, sources } from "@/modules/marketing/rules";
import { saveCampaign } from "@/app/marketing-actions";

export const sourceOptions = sources.map((s) => ({ value: s, label: sourceLabels[s] }));
export const channelLabels: Record<(typeof channels)[number], string> = {
  GOOGLE: "Google",
  SOCIAL: "Social media",
  FLYERS: "Flyers",
  REFERRALS: "Referrals",
  DEALERSHIPS: "Dealerships",
  OTHER: "Other",
};
export const sourceLabel = (s: string | null | undefined) =>
  s ? (sourceLabels[s as keyof typeof sourceLabels] ?? s) : "Missing";
export const centsInput = (c: number | null | undefined) =>
  c == null ? "" : `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "ACTIVE" || status === "APPROVED" || status === "REVIEWED"
      ? "green"
      : status === "PAUSED" || status === "DRAFT" || status === "PLANNED"
        ? "amber"
        : status === "CANCELLED" || status === "REFUNDED" || status === "VOIDED"
          ? "danger"
          : "neutral";
  return <Badge tone={tone}>{status.toLowerCase().replace(/_/g, " ")}</Badge>;
}

export function MarketingTabs({ current }: { current: string }) {
  const tabs = [
    ["/marketing", "Results & campaigns"],
    ["/marketing/sources", "Customer sources"],
    ["/marketing/analytics", "Google Business"],
  ];
  return (
    <nav className="mk-tabs" aria-label="Marketing sections">
      {tabs.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className={current === href ? "active" : ""}
          aria-current={current === href ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note: React.ReactNode;
}) {
  return (
    <div className="mk-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

type CampaignLike = {
  id: string;
  version: number;
  name: string;
  channel: string;
  startDate: string;
  endDate: string;
  offer: string;
  budgetCents: number;
  status: string;
};

export function CampaignForm({
  campaign,
  station,
  today,
}: {
  campaign?: CampaignLike;
  station: { hash: string; label: string };
  today: string;
}) {
  return (
    <ActionForm action={saveCampaign} submit={campaign ? "Save campaign" : "Create campaign"}>
      <input type="hidden" name="id" value={campaign?.id ?? ""} />
      <input type="hidden" name="version" value={campaign?.version ?? 0} />
      <input type="hidden" name="stationHashes" value={station.hash} />
      <Field label="Campaign name">
        <input name="name" required maxLength={160} defaultValue={campaign?.name} />
      </Field>
      <Field label="Channel">
        <select name="channel" defaultValue={campaign?.channel ?? "GOOGLE"}>
          {channels.map((c) => (
            <option key={c} value={c}>
              {channelLabels[c]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Start date">
        <input type="date" name="startDate" required defaultValue={campaign?.startDate ?? today} />
      </Field>
      <Field label="End date">
        <input type="date" name="endDate" required defaultValue={campaign?.endDate ?? today} />
      </Field>
      <Field label="Planned budget · USD">
        <input
          name="budget"
          inputMode="decimal"
          pattern="\d{1,8}(\.\d{1,2})?"
          required
          defaultValue={centsInput(campaign?.budgetCents ?? 0)}
        />
      </Field>
      <Field label="Status">
        <select name="status" defaultValue={campaign?.status ?? "DRAFT"}>
          {["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"].map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Offer description · optional" wide>
        <textarea name="offer" maxLength={2000} defaultValue={campaign?.offer} />
      </Field>
      <p className="mk-hint wide">
        Station: {station.label}. Multi-station access is not configured.
      </p>
    </ActionForm>
  );
}

export function Cents({ cents }: { cents: number | null }) {
  return <Money cents={cents} />;
}
