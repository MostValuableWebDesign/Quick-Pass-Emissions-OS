"use client";
import { useActionState } from "react";
import type { ActionState } from "@/app/actions";
import { Button } from "./ui/button";
export function ActionForm({
  action,
  children,
  submit = "Save changes",
  className = "form-grid",
}: {
  action: (state: ActionState, data: FormData) => Promise<ActionState>;
  children?: React.ReactNode;
  submit?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="form-footer">
        <Button disabled={pending}>{pending ? "Saving…" : submit}</Button>
        {state.message && (
          <p role="status" className={state.ok ? "success" : "error-text"}>
            {state.message}
          </p>
        )}
        {state.invite && (
          <input
            aria-label="Private invitation link"
            readOnly
            value={state.invite}
            onFocus={(e) => e.target.select()}
          />
        )}
      </div>
    </form>
  );
}
export function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children?: React.ReactNode;
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
