"use client";
import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { MetricSummary, Metric } from "@/modules/analytics/rules";
export function AnalyticsTrend({
  rows,
  labels: METRICS,
}: {
  labels: Record<Metric, string>;
  rows: { month: string; metrics: MetricSummary[] }[];
}) {
  const [metric, setMetric] = useState<Metric>("CALL_CLICKS");
  const points = rows.map((r) => {
    const m = r.metrics.find((m) => m.metric === metric)!;
    return {
      month: r.month,
      value: m.value,
      coverage: `${m.reportedDays}/${m.expectedDays} days${m.complete ? "" : " · partial/provisional"}`,
    };
  });
  return (
    <div>
      <label>
        Monthly trend metric
        <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
          {Object.entries(METRICS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        Google Business Profile · {METRICS[metric]}. Missing values leave gaps; partial totals are
        not prorated. See the monthly table for coverage.
      </p>
      <div
        role="img"
        aria-label={`${METRICS[metric]} monthly trend. ${points.map((p) => `${p.month}: ${p.value === null ? "unavailable" : p.value}, ${p.coverage}`).join("; ")}`}
        style={{ height: 220, minWidth: 0 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <XAxis dataKey="month" />
            <YAxis allowDecimals={false} />
            <Tooltip
              formatter={(value, _name, item) => [
                `${value} · ${item.payload.coverage}`,
                METRICS[metric],
              ]}
            />
            <Line
              type="linear"
              dataKey="value"
              stroke="var(--primary)"
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
