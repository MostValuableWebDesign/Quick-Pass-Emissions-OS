"use client";
import {
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { ActionState } from "@/app/actions";
import { Button } from "./ui/button";
import { DirectoryAddDialogContext } from "./directory-add-dialog-context";
export function ActionForm({
  action,
  children,
  submit = "Save changes",
  className = "form-grid",
  confirmOnSubmit,
}: {
  action: (state: ActionState, data: FormData) => Promise<ActionState>;
  children?: React.ReactNode;
  submit?: string;
  className?: string;
  confirmOnSubmit?: string;
}) {
  const closeAddDialog = useContext(DirectoryAddDialogContext);
  const form = useRef<HTMLFormElement>(null);
  const confirmation = useRef<HTMLDialogElement>(null);
  const approved = useRef(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const confirmationTitleId = useId();
  const confirmationDescriptionId = useId();
  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, data: FormData) => {
      const result = await action(previous, data);
      if (result.ok) closeAddDialog?.();
      // Resolve private invitation paths on the currently viewed site. The token stays
      // in the fragment, never in a server request path or query string.
      return result.invite
        ? { ...result, invite: new URL(result.invite, window.location.href).href }
        : result;
    },
    {},
  );
  useEffect(() => {
    const dialog = confirmation.current;
    if (confirmationOpen && dialog && !dialog.open) dialog.showModal();
    else if (!confirmationOpen && dialog?.open) dialog.close();
  }, [confirmationOpen]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!confirmOnSubmit || approved.current) {
      approved.current = false;
      return;
    }
    event.preventDefault();
    setConfirmationOpen(true);
  }

  function cancelRemoval() {
    approved.current = false;
    setConfirmationOpen(false);
    confirmation.current?.close();
  }

  function confirmRemoval() {
    const currentForm = form.current;
    if (!currentForm) return;
    approved.current = true;
    setConfirmationOpen(false);
    confirmation.current?.close();
    window.requestAnimationFrame(() => {
      if (currentForm.isConnected) currentForm.requestSubmit();
      else approved.current = false;
    });
  }

  return (
    <>
      <form
        ref={form}
        action={formAction}
        className={className}
        onSubmit={confirmOnSubmit ? handleSubmit : undefined}
      >
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
      {confirmOnSubmit && (
        <dialog
          ref={confirmation}
          className="employee-removal-confirmation"
          role="alertdialog"
          aria-labelledby={confirmationTitleId}
          aria-describedby={confirmationDescriptionId}
          onCancel={cancelRemoval}
          onClose={() => setConfirmationOpen(false)}
          onClick={(event) => {
            if (event.target === confirmation.current) cancelRemoval();
          }}
        >
          <div className="employee-removal-content">
            <span className="employee-removal-icon" aria-hidden="true">
              !
            </span>
            <div>
              <p className="employee-removal-eyebrow">Staff change</p>
              <h2 id={confirmationTitleId} className="employee-removal-title">
                Confirm employee removal
              </h2>
              <p id={confirmationDescriptionId} className="employee-removal-description">
                {confirmOnSubmit}
              </p>
            </div>
          </div>
          <div className="employee-removal-actions">
            <button
              type="button"
              className="employee-removal-cancel"
              autoFocus
              onClick={cancelRemoval}
            >
              Keep employee
            </button>
            <button type="button" className="employee-removal-confirm" onClick={confirmRemoval}>
              Remove from active staff
            </button>
          </div>
        </dialog>
      )}
    </>
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
