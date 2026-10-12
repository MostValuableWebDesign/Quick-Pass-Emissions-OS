"use client";

import { useState, type ReactNode } from "react";
import type { CommissionProgress } from "@/modules/station/dashboard-types";
import { longDate, shortDate, usd } from "./performance-dashboard-format";

function DailyProgress({
  day,
  threshold,
}: {
  day: CommissionProgress["days"][number];
  threshold: number;
}) {
  const count = day.stationCars;
  return (
    <div className="pd-commission-day">
      <div className="pd-commission-label">
        <time dateTime={day.date} title={longDate(day.date)}>
          {shortDate(day.date)}
        </time>
        <strong>{count === null ? "Count unavailable" : `${count} shop tests`}</strong>
      </div>
      {count === null ? (
        <div
          className="pd-commission-track unknown"
          aria-label="Daily threshold progress unavailable"
        />
      ) : (
        <div
          className="pd-commission-track"
          role="progressbar"
          aria-label={`${day.date} shop tests toward the daily threshold`}
          aria-valuemin={0}
          aria-valuemax={threshold}
          aria-valuenow={Math.min(count, threshold)}
          aria-valuetext={`${count} shop tests, ${day.commissionTests} commission tests`}
        >
          <span style={{ width: `${Math.min(count / Math.max(1, threshold), 1) * 100}%` }} />
        </div>
      )}
      <div className="pd-commission-label muted">
        <span>
          {count === null
            ? "Awaiting report / VIN history"
            : count <= threshold
              ? `${threshold + 1 - count} more test${threshold + 1 - count === 1 ? "" : "s"} for the first commission dollar`
              : `${day.commissionTests} tests above the daily threshold`}
        </span>
        <span>
          {day.perEmployeeCents === null
            ? "Unknown"
            : `${usd(day.perEmployeeCents)} / eligible worker`}
        </span>
      </div>
    </div>
  );
}

export function PerformanceCommissionProgress({
  data,
  selectedCommissionCents,
  filtered,
  panelActions,
}: {
  data: CommissionProgress;
  selectedCommissionCents: number | null;
  filtered: boolean;
  panelActions?: ReactNode;
}) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(data.days.length / 15));
  const current = Math.min(page, pages);
  const days = data.days.slice((current - 1) * 15, current * 15);
  const known = data.days.filter((day) => day.stationCars !== null).length;
  return (
    <section className="pd-card" aria-label="Commission progress">
      <div className="pd-card-h">
        <div className="pd-card-title">
          <h2>Commission progress</h2>
          <p>
            {usd(data.rateCents)} per counted shop test above {data.threshold} · resets each day
          </p>
        </div>
        <div className="pd-card-actions">
          {panelActions}
        </div>
      </div>
      <div className="pd-panel-content">
        <div className="pd-panel-metrics">
          <div>
            <span>{filtered ? "Selected employee" : "Selected staff"} commission (est.)</span>
            <strong data-testid="text-progress-commission">{usd(selectedCommissionCents)}</strong>
          </div>
          <div>
            <span>Days with known counts</span>
            <strong>
              {known} / {data.days.length}
            </strong>
          </div>
        </div>
        {pages > 1 && (
          <nav className="pd-progress-pages" aria-label="Commission progress pages">
            <button
              type="button"
              className="button button-outline button-sm"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </button>
            <span>
              Page {current} of {pages} · 15 days per page
            </span>
            <button
              type="button"
              className="button button-outline button-sm"
              disabled={current === pages}
              onClick={() => setPage(current + 1)}
            >
              Next
            </button>
          </nav>
        )}
        {days.map((day) => (
          <DailyProgress key={day.date} day={day} threshold={data.threshold} />
        ))}
        <p className="pd-panel-note">
          The daily threshold always uses the whole shop, including when an employee is selected.{" "}
          Per-worker amounts assume commission eligibility and a working day.
        </p>
      </div>
    </section>
  );
}
