"use client";

import { useState } from "react";

/** Uses ordinary selects rather than a browser-dependent time picker inside the preview. */
export function BusinessTimeSelect({
  name,
  label,
  value = "",
  onChange,
}: {
  name: string;
  label: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const initialHour = value ? Number(value.slice(0, 2)) : null;
  const [hour, setHour] = useState(initialHour === null ? "" : String(initialHour % 12 || 12));
  const [minute, setMinute] = useState(value ? value.slice(3, 5) : "00");
  const [period, setPeriod] = useState(initialHour !== null && initialHour >= 12 ? "PM" : "AM");
  const [previousValue, setPreviousValue] = useState(value);
  const time = hour
    ? `${String((Number(hour) % 12) + (period === "PM" ? 12 : 0)).padStart(2, "0")}:${minute}`
    : "";
  if (value !== previousValue) {
    const nextHour = value ? Number(value.slice(0, 2)) : null;
    setPreviousValue(value);
    setHour(nextHour === null ? "" : String(nextHour % 12 || 12));
    setMinute(value ? value.slice(3, 5) : "00");
    setPeriod(nextHour !== null && nextHour >= 12 ? "PM" : "AM");
  }

  function change(nextHour: string, nextMinute: string, nextPeriod: string) {
    setHour(nextHour);
    setMinute(nextMinute);
    setPeriod(nextPeriod);
    onChange?.(
      nextHour
        ? `${String((Number(nextHour) % 12) + (nextPeriod === "PM" ? 12 : 0)).padStart(2, "0")}:${nextMinute}`
        : "",
    );
  }

  return (
    <div className="business-time-select" role="group" aria-label={label}>
      <input type="hidden" name={name} value={time} />
      <select
        aria-label={`${label} hour`}
        value={hour}
        onChange={(e) => change(e.target.value, minute, period)}
      >
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
        onChange={(e) => change(hour, e.target.value, period)}
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
        onChange={(e) => change(hour, minute, e.target.value)}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
