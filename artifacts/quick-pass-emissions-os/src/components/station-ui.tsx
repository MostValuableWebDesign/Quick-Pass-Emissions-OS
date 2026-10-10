import { Badge } from "./phase5";

export function StationStat({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="stat">
      <div className="stat-top">{label}</div>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

export function StateBadge({ state }: { state: string }) {
  return (
    <Badge tone={state === "CONFIRMED" ? "green" : state === "SUPERSEDED" ? "neutral" : "amber"}>
      {state === "CONFIRMED"
        ? "confirmed"
        : state === "SUPERSEDED"
          ? "superseded"
          : "pending identity"}
    </Badge>
  );
}

export function SourceTime({ value }: { value: string }) {
  return (
    <>
      {value}
      <small>Portal local time, timezone unverified, minute precision</small>
    </>
  );
}

export function Last4({ value }: { value: string }) {
  return <span>…{value.slice(-4)}</span>;
}

export function Section({
  title,
  note,
  count,
  children,
}: {
  title: string;
  note?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="card space-top">
      <div className="card-heading">
        <div>
          <h2>
            {title}
            {count !== undefined && <span className="count">{count}</span>}
          </h2>
          {note && <p>{note}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function inclusiveDays(start: string, end: string) {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 + 1;
}
