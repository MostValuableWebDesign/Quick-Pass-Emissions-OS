"use client";
import { useActionState, useId, isValidElement, cloneElement } from "react";
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
  const fieldId = useId();
  return (
    <div className={wide ? "field wide" : "field"}>
      <label htmlFor={fieldId}>{label}</label>
      {isValidElement<{ id?: string }>(children)
        ? cloneElement(children, { id: fieldId })
        : children}
    </div>
  );
}
