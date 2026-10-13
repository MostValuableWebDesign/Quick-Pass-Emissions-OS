"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardData } from "@/modules/station/dashboard-types";
import {
  excludeSundayTrendDays,
  longDate,
  monthlyTrendPoints,
  shortDate,
  usd,
} from "./performance-dashboard-format";

type Metric = "cars" | "revenue";

export function PerformanceTrend({
  series,
  filtered,
  panelActions,
  trendDays,
  endDate,
  startDate,
  employeeId,
  today,
  employeeName,
}: {
  series: DashboardData["series"];
  filtered: boolean;
  panelActions?: ReactNode;
  trendDays: 7 | 30 | 365;
  endDate: string;
  startDate: string;
  employeeId?: string;
  today: string;
  employeeName?: string;
}) {
  const [metric, setMetric] = useState<Metric>("cars");
  const weekdays = excludeSundayTrendDays(series);
  const dailyRows = weekdays.map((s) => ({
    date: s.date,
    value: metric === "cars" ? s.cars : s.revenueCents === null ? null : s.revenueCents / 100,
    station: metric === "cars" && filtered ? s.stationCars : null,
  }));
  const year = Number(endDate.slice(0, 4));
  const yearly = trendDays === 365;
  const rows = yearly ? monthlyTrendPoints(dailyRows, year, today) : dailyRows;
  const has = rows.some((r) => r.value !== null);
  const scope = employeeName ?? "All employees";
  return (
    <section className="pd-card" aria-label="Trend">
      <div className="pd-card-h">
        <div className="pd-card-title">
          <h2>Trend</h2>
          <p>
            {yearly
              ? `${year} · monthly totals`
              : `Daily · ${trendDays} days through ${shortDate(endDate)}`}
            {` · ${scope}`}
            {filtered && metric === "cars" ? " · line is station total" : ""}
          </p>
        </div>
        <div className="pd-card-actions">
          <form method="get" action="/performance" className="pd-trend-form">
            <input type="hidden" name="start" value={startDate} />
            <input type="hidden" name="end" value={endDate} />
            {employeeId && <input type="hidden" name="employee" value={employeeId} />}
            <label className="pd-trend-view">
              <span>Trend view</span>
              <select
                name="trendDays"
                defaultValue={String(trendDays)}
                data-testid="select-trend"
                onChange={(event) => event.currentTarget.form?.requestSubmit()}
              >
                <option value="7">Daily · 7 days</option>
                <option value="30">Daily · 30 days</option>
                <option value="365">Yearly · monthly totals</option>
              </select>
            </label>
          </form>
          <div className="pd-seg" role="group" aria-label="Trend metric">
            {(["cars", "revenue"] as Metric[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={metric === m}
                onClick={() => setMetric(m)}
                data-testid={`button-trend-${m}`}
              >
                {m === "cars" ? "Cars tested" : "Revenue"}
              </button>
            ))}
          </div>
          {panelActions}
        </div>
      </div>
      {has ? (
        <div className="pd-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis
                dataKey={yearly ? "label" : "date"}
                tickFormatter={yearly ? undefined : shortDate}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                axisLine={false}
                tickLine={false}
                minTickGap={18}
                interval={yearly ? 0 : "preserveEnd"}
              />
              <YAxis
                width={52}
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => (metric === "revenue" ? `$${v}` : String(v))}
              />
              <Tooltip
                filterNull={false}
                cursor={{ fill: "var(--soft)" }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="pd-tip">
                      <b>{yearly ? `${String(label)} ${year}` : longDate(String(label))}</b>
                      {yearly && payload[0]?.payload?.monthToDate && <div>Month to date</div>}
                      {payload.map((p) => (
                        <div key={String(p.dataKey)}>
                          {p.dataKey === "station"
                            ? "Station"
                            : metric === "cars"
                              ? "Cars"
                              : "Revenue"}
                          :{" "}
                          {p.value === null || p.value === undefined
                            ? yearly && p.payload?.status === "upcoming"
                              ? "Upcoming"
                              : yearly && p.payload?.status === "incomplete"
                                ? "Incomplete data"
                                : "No data"
                            : metric === "revenue"
                              ? usd(Number(p.value) * 100)
                              : String(p.value)}
                        </div>
                      ))}
                    </div>
                  ) : null
                }
              />
              <Area
                dataKey="value"
                type="linear"
                stroke="var(--chart-green)"
                strokeWidth={2.5}
                fill="var(--chart-green)"
                fillOpacity={0.18}
                connectNulls={false}
                isAnimationActive={false}
              />
              {filtered && metric === "cars" && (
                <Line
                  dataKey="station"
                  stroke="var(--text)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="pd-empty">
          {yearly
            ? "No complete monthly totals are loaded for this year yet."
            : "No daily totals are loaded for this trend window yet."}
        </div>
      )}
    </section>
  );
}
