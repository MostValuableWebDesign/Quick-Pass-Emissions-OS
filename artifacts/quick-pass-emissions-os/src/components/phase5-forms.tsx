import { ActionForm } from "./action-form";
import { Phase5Field as Field } from "./phase5-field";
import {
  saveScheduleAction,
  savePolicyAction,
  saveForecastAction,
  retryJobAction,
} from "@/app/phase5-actions";
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const bool = (v: boolean) => String(v);
type Num = number | null | undefined;
function NumberField({
  label,
  name,
  value,
  min,
  max,
}: {
  label: string;
  name: string;
  value?: Num;
  min: number;
  max: number;
}) {
  return (
    <Field label={label}>
      <input
        name={name}
        type="number"
        inputMode="numeric"
        step={1}
        min={min}
        max={max}
        required
        defaultValue={value ?? ""}
      />
    </Field>
  );
}
export function ScheduleForm({
  k,
  current,
}: {
  k: "daily" | "weekly";
  current?: {
    revision: number;
    active: boolean;
    weekday: number | null;
    time: string;
    openDaysOnly: boolean;
  };
}) {
  return (
    <ActionForm action={saveScheduleAction} submit={`Save ${k} schedule`}>
      <input type="hidden" name="key" value={k} />
      <input type="hidden" name="frequency" value={k.toUpperCase()} />
      <input type="hidden" name="revision" value={current?.revision ?? 0} />
      <Field label="Weekday (1 Monday to 7 Sunday; required even for daily)">
        <select
          name="weekday"
          required
          defaultValue={current?.weekday ? String(current.weekday) : ""}
        >
          <option value="" disabled>
            Choose weekday
          </option>
          {weekdays.map((d, i) => (
            <option key={d} value={i + 1}>
              {i + 1} - {d}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Run time (Eastern, 24-hour HH:mm)">
        <input name="time" type="time" required defaultValue={current?.time ?? ""} />
      </Field>
      <Field label="Run on open days only">
        <select name="openDaysOnly" defaultValue={bool(current?.openDaysOnly ?? true)}>
          <option value="true">Yes - skip closures and non-operating days</option>
          <option value="false">No - run every scheduled day</option>
        </select>
      </Field>
      <Field label="Schedule status">
        <select name="active" defaultValue={bool(current?.active ?? true)}>
          <option value="true">Active</option>
          <option value="false">Paused</option>
        </select>
      </Field>
    </ActionForm>
  );
}
export function PolicyForm({
  kind,
  current,
  recipients,
}: {
  kind: string;
  current?: {
    revision: number;
    active: boolean;
    advanceDays: number;
    escalationDays: number;
    recipients: string[];
    escalationRecipients: string[];
  };
  recipients: { id: string; name: string; role: string }[];
}) {
  return (
    <ActionForm action={savePolicyAction} submit={`Save ${kind.toLowerCase()} policy`}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="revision" value={current?.revision ?? 0} />
      <Field label="Policy status">
        <select name="active" defaultValue={bool(current?.active ?? false)}>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      </Field>
      <NumberField
        label="Advance notice days before due"
        name="advanceDays"
        value={current?.advanceDays}
        min={0}
        max={365}
      />
      <NumberField
        label="Escalate after days overdue"
        name="escalationDays"
        value={current?.escalationDays}
        min={0}
        max={365}
      />
      <fieldset className="wide">
        <legend>Recipients (advance and overdue)</legend>
        <div className="checks">
          {recipients.map((u) => (
            <label key={u.id}>
              <input
                type="checkbox"
                name="recipients"
                value={u.id}
                defaultChecked={current?.recipients.includes(u.id)}
              />{" "}
              {u.name} ({u.role.toLowerCase()})
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="wide">
        <legend>Escalation recipients</legend>
        <div className="checks">
          {recipients.map((u) => (
            <label key={u.id}>
              <input
                type="checkbox"
                name="escalationRecipients"
                value={u.id}
                defaultChecked={current?.escalationRecipients.includes(u.id)}
              />{" "}
              {u.name} ({u.role.toLowerCase()})
            </label>
          ))}
        </div>
      </fieldset>
    </ActionForm>
  );
}
export function ForecastForm({
  k,
  name,
  current,
}: {
  k: string;
  name: string;
  current?: {
    revision: number;
    windowDays: number;
    minimumDays: number;
    leadDays: number;
    threshold: number;
  };
}) {
  return (
    <ActionForm action={saveForecastAction} submit={`Save ${name} forecast`}>
      <input type="hidden" name="key" value={k} />
      <input type="hidden" name="revision" value={current?.revision ?? 0} />
      <NumberField
        label="Observation window days (7 to 365)"
        name="windowDays"
        value={current?.windowDays}
        min={7}
        max={365}
      />
      <NumberField
        label="Minimum days of history (1 to window)"
        name="minimumDays"
        value={current?.minimumDays}
        min={1}
        max={365}
      />
      <NumberField
        label="Planning lead days"
        name="leadDays"
        value={current?.leadDays}
        min={0}
        max={365}
      />
      <NumberField
        label="Low-stock threshold (units)"
        name="threshold"
        value={current?.threshold}
        min={0}
        max={2000000000}
      />
    </ActionForm>
  );
}
export function RetryForm({ id }: { id: string }) {
  return (
    <ActionForm className="inline-form" action={retryJobAction} submit="Authorize retry">
      <input type="hidden" name="id" value={id} />
    </ActionForm>
  );
}
