import { RecordLink } from "@/components/record-link";
import { formatDate } from "@/lib/time";
import { Empty } from "./shared";
export function fmtInstant(v: string | Date | null | undefined) {
  if (!v) return "Not recorded";
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? String(v) : formatDate(d);
}
export function usd(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "Not recorded";
  const a = BigInt(Math.abs(cents));
  return `${cents < 0 ? "-" : ""}$${a / 100n}.${(a % 100n).toString().padStart(2, "0")} USD`;
}
export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card card-body space-top" style={{ opacity: 0.5, minHeight: 56 }} />
      ))}
    </div>
  );
}
export function ErrorPanel({ message, reset }: { message: string; reset?: () => void }) {
  return (
    <div className="notice warning" role="alert">
      {message}{" "}
      {reset && (
        <button type="button" className="button button-outline button-sm" onClick={reset}>
          Retry
        </button>
      )}
    </div>
  );
}
export function Boundary({ children }: { children: React.ReactNode }) {
  return <div className="notice">{children}</div>;
}
export function ExternalDisabled() {
  return (
    <div className="notice warning">
      External email and SMS delivery are disabled. Reminders and summaries are delivered in-app
      only, to current active internal users.
    </div>
  );
}
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "green" | "danger" | "amber" | "neutral";
  children: React.ReactNode;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function jobTone(status: string): "green" | "danger" | "amber" | "neutral" {
  return status === "COMPLETED" || status === "DELIVERED"
    ? "green"
    : status === "FAILED"
      ? "danger"
      : status === "PENDING" || status === "RUNNING"
        ? "amber"
        : "neutral";
}
export type Row = Record<string, string | number | null>;
function cell(k: string, v: string | number | null) {
  if (v === null) return "Not recorded";
  if (/Cents$/.test(k) && typeof v === "number") return usd(v);
  if (/(At|Start|End)$/.test(k) && typeof v === "string" && v.includes("T")) return fmtInstant(v);
  if (/Milliseconds$/.test(k) && typeof v === "number") return `${(v / 3600000).toFixed(2)} h`;
  return String(v);
}
export function TotalsList({ totals }: { totals: Record<string, number> }) {
  const entries = Object.entries(totals);
  if (!entries.length) return null;
  return (
    <dl className="stats-grid">
      {entries.map(([k, v]) => (
        <div className="card stat-card" key={k}>
          <dt className="muted">{k}</dt>
          <dd style={{ margin: 0 }}>
            <h2>{/Cents$/.test(k) ? usd(v) : v.toLocaleString("en-US")}</h2>
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function RowsTable({
  rows,
  limit = 100,
  caption,
}: {
  rows: Row[];
  limit?: number;
  caption: string;
}) {
  if (!rows.length)
    return (
      <Empty
        title="No matching records"
        text="Zero matches does not prove the business had zero activity; records may not have been entered."
      />
    );
  const keys = Object.keys(rows[0]).filter((k) => k !== "href");
  const shown = rows.slice(0, limit);
  return (
    <>
      <p className="muted" style={{ padding: "12px 23px" }}>
        Showing {shown.length} of {rows.length} matching rows.
        {rows.length > limit &&
          " Totals above and CSV export include all matching rows, not just those displayed."}
      </p>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={caption}>
        <table>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {keys.map((k) => (
                <th scope="col" key={k}>
                  {k}
                </th>
              ))}
              <th scope="col">Record</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.id ?? i}-${i}`}>
                {keys.map((k) => (
                  <td key={k}>{cell(k, r[k])}</td>
                ))}
                <td>
                  {typeof r.href === "string" ? (
                    <RecordLink className="text-link" href={r.href}>
                      Open
                    </RecordLink>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
export type Inv = {
  key: string;
  name: string;
  unit: string;
  state: string;
  balance?: number | null;
  configured?: boolean;
  averageDailyUsage?: number | null;
  estimatedDaysRemaining?: number | null;
  depletionDate?: string | null;
  threshold: number;
  low: boolean;
  coverageDays: number;
  recordedConsumption: number;
  observationStart: string;
  observationEnd: string;
  limits?: string;
  coverageStart?: string | null;
  lastPhysicalCountDate?: string | null;
  planningLeadDays?: number;
};
export function InventoryTable({ inventory }: { inventory: Inv[] }) {
  if (!inventory.length)
    return (
      <Empty title="No inventory tracked" text="No certificate or chemical forecast data exists." />
    );
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Inventory depletion estimates"
    >
      <table>
        <caption className="sr-only">Inventory depletion estimates</caption>
        <thead>
          <tr>
            {[
              "Item",
              "State",
              "Recorded balance",
              "Observed",
              "Avg daily use",
              "Est. days left",
              "Est. depletion",
              "Threshold",
            ].map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {inventory.map((i) => (
            <tr key={i.key}>
              <td>
                {i.name}
                <small>{i.unit}</small>
                <small>{i.limits}</small>
              </td>
              <td>
                <Badge tone={i.low ? "danger" : i.state === "ESTIMATE" ? "green" : "amber"}>
                  {i.state.replaceAll("_", " ").toLowerCase()}
                  {i.low ? " / low" : ""}
                </Badge>
              </td>
              <td>{i.balance ?? "Unknown"}</td>
              <td>
                {i.state === "UNCONFIGURED" ? (
                  "Observation policy not configured"
                ) : (
                  <>
                    Window {i.observationStart} to {i.observationEnd}
                    <small>
                      Usable: {i.coverageDays} days from {i.coverageStart ?? "unknown"}
                    </small>
                    <small>Recorded consumption: {i.recordedConsumption}</small>
                  </>
                )}
                <small>Last physical count: {i.lastPhysicalCountDate ?? "unknown"}</small>
              </td>
              <td>
                {i.state === "UNCONFIGURED" || i.averageDailyUsage == null
                  ? "Not estimated"
                  : i.averageDailyUsage.toFixed(2)}
              </td>
              <td>{i.estimatedDaysRemaining ?? "Not estimated"}</td>
              <td>{i.depletionDate ?? "Not estimated"}</td>
              <td>
                {i.state === "UNCONFIGURED" || i.configured === false
                  ? "Unconfigured"
                  : i.threshold}
                <small>
                  Planning lead:{" "}
                  {i.state === "UNCONFIGURED"
                    ? "unconfigured"
                    : (i.planningLeadDays ?? "unconfigured")}{" "}
                  days
                </small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ItemsTable({
  items,
  limit = Infinity,
}: {
  items: { kind: string; title: string; href: string; date: string; amountCents: number | null }[];
  limit?: number;
}) {
  if (!items.length)
    return (
      <Empty
        title="No exceptions"
        text="Nothing matched the exception rules. This is not proof that all books are complete."
      />
    );
  return (
    <>
      <p className="muted" style={{ padding: "12px 23px" }}>
        Showing {Math.min(items.length, limit)} of {items.length} items.
      </p>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Exceptions">
        <table>
          <caption className="sr-only">Exceptions</caption>
          <thead>
            <tr>
              {["Type", "Record", "Date", "Amount", "Source"].map((h) => (
                <th scope="col" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.slice(0, limit).map((it, i) => (
              <tr key={i}>
                <td>
                  <Badge tone="amber">{it.kind}</Badge>
                </td>
                <td>{it.title}</td>
                <td>{it.date.includes("T") ? fmtInstant(it.date) : it.date}</td>
                <td>{it.amountCents === null ? "" : usd(it.amountCents)}</td>
                <td>
                  <RecordLink className="text-link" href={it.href}>
                    Open record
                  </RecordLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
