import { ActionForm } from "./action-form";
import { Phase5Field as Field } from "./phase5-field";
import { saveOwnerEmailAction, retryOwnerEmailAction } from "@/app/owner-email-actions";
export function OwnerEmailForm({
  setting,
  owners,
  configured,
}: {
  setting: { active: boolean; revision: number; recipients: string[] } | null;
  owners: { id: string; name: string; email: string }[];
  configured: boolean;
}) {
  return (
    <ActionForm action={saveOwnerEmailAction} submit="Save owner email settings">
      <input type="hidden" name="revision" value={setting?.revision ?? 0} />
      <Field label="Daily email status">
        <select name="active" defaultValue={String(setting?.active ?? false)}>
          <option value="false">Paused</option>
          <option value="true" disabled={!configured}>
            Enabled
          </option>
        </select>
      </Field>
      <fieldset>
        <legend>Owner recipients</legend>
        {owners.map((o) => (
          <label className="check-row" key={o.id}>
            <input
              type="checkbox"
              name="recipients"
              value={o.id}
              defaultChecked={setting?.recipients.includes(o.id)}
            />{" "}
            {o.name} ({o.email})
          </label>
        ))}
      </fieldset>
      <p className="muted">
        Every day at 6:30 PM Eastern, reporting the current day. Select owner accounts only. Saving
        starts from today; pausing cancels unsent emails.
      </p>
    </ActionForm>
  );
}
export function OwnerEmailRetry({ id }: { id: string }) {
  return (
    <ActionForm action={retryOwnerEmailAction} submit="Retry email">
      <input type="hidden" name="id" value={id} />
    </ActionForm>
  );
}
