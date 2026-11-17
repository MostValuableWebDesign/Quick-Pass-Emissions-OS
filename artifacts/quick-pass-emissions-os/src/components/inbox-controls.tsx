"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import type { ActionState } from "@/app/actions";
import { saveInboxAnnotation, moveEmailToTrash } from "@/app/inbox-actions";
import { Field } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { INBOX_CATEGORIES, INBOX_IMPORTANCE, type InboxImportance } from "@/modules/inbox/constants";

export function InboxAnnotationForm({
  messageId,
  annotation,
}: {
  messageId: string;
  annotation: {
    category: string;
    importance: InboxImportance;
    followUp: boolean;
    notes: string;
  };
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveInboxAnnotation, {});
  return (
    <form action={action} className="form-grid inbox-annotation-form">
      <input type="hidden" name="messageId" value={messageId} />
      <Field label="Topic">
        <select name="category" defaultValue={annotation.category}>
          {INBOX_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Importance">
        <select name="importance" defaultValue={annotation.importance}>
          {INBOX_IMPORTANCE.map((importance) => (
            <option key={importance} value={importance}>
              {importance[0] + importance.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </Field>
      <label className="inbox-follow-up-toggle">
        <input type="checkbox" name="followUp" defaultChecked={annotation.followUp} />
        <span>Needs follow-up</span>
      </label>
      <Field label="Important notes" wide>
        <textarea
          name="notes"
          rows={4}
          defaultValue={annotation.notes}
          maxLength={2000}
          placeholder="Add context or next steps for the team"
        />
      </Field>
      <div className="form-footer">
        <Button disabled={pending}>{pending ? "Saving…" : "Save email details"}</Button>
        {state.message && (
          <p role="status" className={state.ok ? "success" : "error-text"}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

export function GmailTrashControl({
  messageId,
  subject,
}: {
  messageId: string;
  subject: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(moveEmailToTrash, {});
  const [confirming, setConfirming] = useState(false);
  const titleId = useId();
  return (
    <form action={action} className="inbox-trash-control">
      <input type="hidden" name="messageId" value={messageId} />
      {state.ok ? (
        <div className="inbox-trash-success">
          <p role="status" className="success">
            {state.message}
          </p>
          <Link className="button button-outline" href="/inbox">
            Back to inbox
          </Link>
        </div>
      ) : confirming ? (
        <div className="inbox-trash-confirm" role="alertdialog" aria-labelledby={titleId}>
          <div>
            <p className="inbox-trash-eyebrow">Gmail action</p>
            <h3 id={titleId}>Move this email to Trash?</h3>
            <p>
              “{subject}” will leave the inbox and move to Gmail Trash. You can restore it from
              Trash later; this does not permanently delete it.
            </p>
          </div>
          <div className="inbox-trash-buttons">
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Keep email
            </Button>
            <Button disabled={pending} className="inbox-trash-submit">
              {pending ? "Moving…" : "Move to Gmail Trash"}
            </Button>
          </div>
          {state.message && (
            <p role="alert" className="error-text">
              {state.message}
            </p>
          )}
        </div>
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            className="inbox-trash-trigger"
            onClick={() => setConfirming(true)}
          >
            Move to Gmail Trash
          </Button>
          {state.message && (
            <p role="alert" className="error-text">
              {state.message}
            </p>
          )}
        </>
      )}
    </form>
  );
}
