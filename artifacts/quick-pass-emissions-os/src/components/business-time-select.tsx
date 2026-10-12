"use client";

import { useState } from "react";

/** Uses ordinary selects rather than a browser-dependent time picker inside the preview. */
export function BusinessTimeSelect({
  name,
  label,
  value = "",
}: {
  name: string;
  label: string;
  value?: string;
}) {
  const initialHour = value ? Number(value.slice(0, 2)) : null;
  const [hour, setHour] = useState(initialHour === null ? "" : String(initialHour % 12 || 12));
  const [minute, setMinute] = useState(value ? value.slice(3, 5) : "00");
  const [period, setPeriod] = useState(initialHour !== null && initialHour >= 12 ? "PM" : "AM");
  const time = hour
    ? `${String((Number(hour) % 12) + (period === "PM" ? 12 : 0)).padStart(2, "0")}:${minute}`
    : "";

  return (
    <div className="business-time-select" role="group" aria-label={label}>
      <input type="hidden" name={name} value={time} />
      <select aria-label={`${label} hour`} value={hour} onChange={(e) => setHour(e.target.value)}>
        <option value="">Hour</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option value={h} key={h}>
            {h}
          </option>
        ))}
      </select>
      <span aria-hidden="true">:</span>
      <select
        aria-label={`${label} minute`}
        value={minute}
        onChange={(e) => setMinute(e.target.value)}
      >
        {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((m) => (
          <option value={m} key={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label} AM or PM`}
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
