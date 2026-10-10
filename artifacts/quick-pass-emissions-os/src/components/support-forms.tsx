"use client";
import { useState } from "react";
import { Field } from "@/components/action-form";
/** Builds an ISO-8601 contactedAt with explicit offset. Local input is unnamed so it is not submitted. */
export function ContactedAtField() {
  const [local, setLocal] = useState("");
  const [zone, setZone] = useState<"local" | "utc">("local");
  let iso = "";
  if (local) {
    if (zone === "utc") iso = `${local}:00Z`;
    else {
      const d = new Date(local);
      if (!Number.isNaN(d.getTime())) {
        const off = -d.getTimezoneOffset();
        const sign = off >= 0 ? "+" : "-";
        const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
        const m = String(Math.abs(off) % 60).padStart(2, "0");
        iso = `${local}:00${sign}${h}:${m}`;
      }
    }
  }
  return (
    <>
      <Field label="Contacted at (date and time)">
        <input
          type="datetime-local"
          required
          value={local}
          onChange={(e) => setLocal(e.target.value)}
        />
      </Field>
      <Field label="Time zone of the entered time">
        <select value={zone} onChange={(e) => setZone(e.target.value as "local" | "utc")}>
          <option value="local">This device&apos;s time zone</option>
          <option value="utc">UTC</option>
        </select>
      </Field>
      <input type="hidden" name="contactedAt" value={iso} />
      <p className="muted wide" aria-live="polite">
        {iso ? `Will be recorded as ${iso}` : "Enter when the contact happened."}
      </p>
    </>
  );
}
