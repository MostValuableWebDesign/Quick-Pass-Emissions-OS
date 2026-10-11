import type { ReactNode } from "react";

// Native implicit association needs no generated IDs across server/client boundaries.
// The shared legacy Field uses the same association for operational forms.
export function Phase5Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "field wide" : "field"}>
      <label>
        <span>{label}</span>
        {children}
      </label>
    </div>
  );
}
