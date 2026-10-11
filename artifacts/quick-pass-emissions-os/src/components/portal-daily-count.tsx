"use client";

import { useActionState } from "react";
import { getPortalDailyCountAction } from "@/app/station-actions";
import type { SavedPortalTotal } from "@/modules/station/portal-service";

export function PortalDailyCount({
  date,
  previous,
}: {
  date: string;
  previous: SavedPortalTotal | null;
}) {
  const [state, action, pending] = useActionState(getPortalDailyCountAction, {});
  const result = [state.result, previous]
    .filter((r): r is SavedPortalTotal => !!r && r.date === date)
    .sort((a, b) => b.retrievedAt.localeCompare(a.retrievedAt))[0];

  return (
    <section className="card card-body space-top" aria-label="Portal daily count">
      <h2>Portal daily count · {date}</h2>
      <form action={action} className="checks" style={{ flexWrap: "wrap" }}>
        <input type="hidden" name="date" value={date} />
        <button className="button button-primary" disabled={pending}>
          {pending ? "Retrieving station export…" : "Get daily count from portal"}
        </button>
        <span className="muted">Read-only, requested by you. No employee setup required.</span>
      </form>
      {pending && <p role="status">Signing in and retrieving the selected day’s report…</p>}
      {!pending && state.message && (
        <p role="status" className={state.ok ? "success" : "error-text"}>
          {state.message}
        </p>
      )}
      {result ? (
        <>
          <p>
            <strong style={{ fontSize: 36 }}>{result.total}</strong> test rows in the portal export
          </p>
          <p>
            Pass: {result.passed} · Fail: {result.failed} · Abort: {result.aborted}
            {result.other > 0 && ` · Other: ${result.other}`}
          </p>
          <p className="muted">
            Retrieved{" "}
            {new Date(result.retrievedAt).toLocaleString("en-US", { timeZone: "America/New_York" })}{" "}
            Eastern. Saved snapshot; use the button to retrieve a fresh export.
          </p>
        </>
      ) : (
        <p className="muted">No portal lookup saved for this date. Retrieve the report above.</p>
      )}
      <p className="muted">
        This counts report rows, including failed and aborted tests—not unique vehicles, collected
        revenue, or approved payroll. Export completeness and source timezone are not independently
        guaranteed. No individual test records or payroll counts are changed.
      </p>
    </section>
  );
}
