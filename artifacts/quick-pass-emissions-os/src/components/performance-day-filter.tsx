"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PerformanceDayFilter({
  date,
  today,
  employeeId,
}: {
  date: string;
  today: string;
  employeeId?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="card card-body"
      aria-label="Daily performance count"
      style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "end" }}
    >
      <label className="field">
        <span>Daily count date</span>
        <input
          type="date"
          value={date}
          max={today}
          required
          onChange={(event) => {
            const selected = event.currentTarget.value;
            if (!selected) return;
            const params = new URLSearchParams({ preset: "day", date: selected });
            if (employeeId) params.set("employeeId", employeeId);
            setLoading(true);
            router.push(`/performance?${params.toString()}`, { scroll: false });
          }}
        />
      </label>
      <span className="muted" aria-live="polite">
        {loading ? "Loading daily count…" : "The count updates when you select a date."}
      </span>
    </form>
  );
}
