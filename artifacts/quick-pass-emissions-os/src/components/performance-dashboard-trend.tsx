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
import { excludeSundayTrendDays, shortDate, usd } from "./performance-dashboard-format";

type Metric = "cars" | "revenue";

export function PerformanceTrend({
  series,
  filtered,
  panelActions,
}: {
  series: DashboardData["series"];
  filtered: boolean;
  panelActions?: ReactNode;
}) {
  const [metric, setMetric] = useState<Metric>("cars");
  const weekdays = excludeSundayTrendDays(series);
  const rows = weekdays.map((s) => ({
    date: s.date,
    value: metric === "cars" ? s.cars : s.revenueCents === null ? null : s.revenueCents / 100,
    station: metric === "cars" && filtered ? s.stationCars : null,
  }));
  const has = rows.some((r) => r.value !== null);
  const gaps = rows.filter((r) => r.value === null).length;
  return (
    <section className="pd-card" aria-label="Trend">
      <div className="pd-card-h">
        <div className="pd-card-title">
          <h2>Trend</h2>
          <p>
            {rows.length} days{gaps ? ` · ${gaps} without data shown as gaps` : ""}
            {filtered && metric === "cars" ? " · line is station total" : ""}
          </p>
          {panelActions}
        </div>
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
      </div>
      {has ? (
        <div className="pd-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                axisLine={false}
                tickLine={false}
                minTickGap={18}
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
                cursor={{ fill: "var(--soft)" }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="pd-tip">
                      <b>{shortDate(String(label))}</b>
                      {payload.map((p) => (
                        <div key={String(p.dataKey)}>
                          {p.dataKey === "station"
                            ? "Station"
                            : metric === "cars"
                              ? "Cars"
                              : "Revenue"}
                          :{" "}
                          {p.value === null || p.value === undefined
                            ? "No data"
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
        <div className="pd-empty">No counts recorded for this trend window yet.</div>
      )}
    </section>
  );
}
