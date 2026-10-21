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
  monthlyTrendRangePoints,
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
  employeeName,
}: {
  series: DashboardData["series"];
  filtered: boolean;
  panelActions?: ReactNode;
  trendDays: DashboardData["query"]["trendDays"];
  endDate: string;
  startDate: string;
  employeeName?: string;
}) {
  const [metric, setMetric] = useState<Metric>("cars");
  const weekdays = excludeSundayTrendDays(series);
  const dailyRows = weekdays.map((s) => ({
    date: s.date,
    value: metric === "cars" ? s.cars : s.revenueCents === null ? null : s.revenueCents / 100,
    station: metric === "cars" && filtered ? s.stationCars : null,
  }));
  const pastYear = trendDays === "past-year";
  const yearly = trendDays === 365;
  const allTime = trendDays === "all";
  const trendYears = typeof trendDays === "number" && trendDays >= 730 ? trendDays / 365 : 0;
  const selectedDays =
    Math.floor(
      (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
    ) + 1;
  const monthly = pastYear || yearly || trendYears > 0 || allTime || selectedDays > 90;
  const year = Number(endDate.slice(0, 4));
  const rows = monthly ? monthlyTrendRangePoints(dailyRows, startDate, endDate) : dailyRows;
  const has = rows.some((r) => r.value !== null);
  const scope = employeeName ?? "All employees";
  const dailyGaps = dailyRows.filter((row) => row.value === null).length;
  return (
    <section className="pd-card" aria-label="Trend">
      <div className="pd-card-h">
        <div className="pd-card-title">
          <h2>Trend</h2>
          <p data-testid="text-trend-period">
            {allTime
              ? `All time · monthly totals · ${shortDate(startDate)} – ${shortDate(endDate)}`
              : pastYear
                ? "Past 1 year · monthly totals"
                : yearly
                  ? `${endDate.slice(0, 4)} to date · monthly totals`
                  : trendYears > 0
                    ? `${trendYears} years · monthly totals`
                    : trendDays === "custom"
                      ? `${longDate(startDate)}${startDate === endDate ? "" : ` – ${longDate(endDate)}`} · ${monthly ? "monthly totals" : "daily"}`
                      : `Daily · ${trendDays} days`}
            {` · ${scope}`}
            {!monthly && dailyGaps > 0
              ? ` · ${dailyGaps} ${dailyGaps === 1 ? "day" : "days"} without data`
              : ""}
            {filtered && metric === "cars" ? " · line is station total" : ""}
          </p>
        </div>
        <div className="pd-card-actions">
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
                dataKey={monthly ? "label" : "date"}
                tickFormatter={monthly ? undefined : shortDate}
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
                      <b>
                        {yearly
                          ? `${String(label)} ${year}`
                          : monthly
                            ? String(label)
                            : longDate(String(label))}
                      </b>
                      {monthly && payload[0]?.payload?.monthToDate && (
                        <div>{yearly ? "Month to date" : "Partial month"}</div>
                      )}
                      {payload.map((p) => (
                        <div key={String(p.dataKey)}>
                          {p.dataKey === "station"
                            ? "Station"
                            : metric === "cars"
                              ? "Cars"
                              : "Revenue"}
                          :{" "}
                          {p.value === null || p.value === undefined
                            ? monthly && p.payload?.status === "upcoming"
                              ? "Upcoming"
                              : monthly && p.payload?.status === "incomplete"
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
                stroke="var(--chart-blue)"
                strokeWidth={2.5}
                fill="var(--chart-blue)"
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
          {monthly
            ? "No complete monthly totals are loaded for this period yet."
            : "No daily totals are loaded for this trend window yet."}
        </div>
      )}
    </section>
  );
}
