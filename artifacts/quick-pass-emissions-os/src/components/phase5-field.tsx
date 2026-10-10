import type { ReactNode } from "react";

// Native implicit association needs no generated IDs across server/client boundaries.
// Keep this limited to Phase 5; legacy form-label work is a separate task.
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
