"use client";
import { useState } from "react";
import { phoneLink, emailLink, externalLink } from "@/modules/support/rules";
export function CopyPhone({ phone, label }: { phone: string; label: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(phone);
      setStatus(`Copied ${label} to clipboard.`);
    } catch {
      setStatus("Copy unavailable in this browser. Select the number manually.");
    }
  }
  return (
    <>
      <button type="button" className="badge neutral" onClick={copy} aria-label={`Copy ${label}`}>
        Copy
      </button>
      <span role="status" aria-live="polite" className="muted" style={{ fontSize: "0.8rem" }}>
        {status}
      </span>
    </>
  );
}
/** One contact method. Links render only when the value passes the shared rules. */
export function ContactLine({
  kind,
  label,
  value,
  extension,
}: {
  kind: "phone" | "email" | "url";
  label: string;
  value: string | null | undefined;
  extension?: string | null;
}) {
  if (!value) return null;
  const href =
    kind === "phone" ? phoneLink(value) : kind === "email" ? emailLink(value) : externalLink(value);
  return (
    <div className="stack" style={{ gap: "0.2rem", marginBottom: "0.6rem" }}>
      <span className="eyebrow" style={{ margin: 0 }}>
        {label}
      </span>
      <span style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        {href ? (
          <a
            href={href}
            className={kind === "phone" ? "button button-primary button-sm" : undefined}
            {...(kind === "url" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            aria-label={
              kind === "phone"
                ? `Call ${label} ${value}`
                : kind === "email"
                  ? `Email ${label} ${value}`
                  : `${label} (external site, opens new tab)`
            }
          >
            {kind === "phone" && "Call · "}
            {value}
            {kind === "url" && " (external site)"}
          </a>
        ) : (
          <span>
            {value} <span className="muted">(not a valid link format; use manually)</span>
          </span>
        )}
        {kind === "phone" && <CopyPhone phone={value} label={label} />}
      </span>
      {kind === "phone" && extension && (
        <span className="muted">
          Extension {extension}: dial manually after the call connects. It is not included in the
          call link.
        </span>
      )}
    </div>
  );
}
