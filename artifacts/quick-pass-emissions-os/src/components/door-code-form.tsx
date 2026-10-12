"use client";
import { useActionState, useRef, useState } from "react";
import { issueDoorCodeAction, revokeDoorCodeAction } from "@/app/door-actions";
import type { ActionState } from "@/app/actions";

type Choice = { doorId: string; id: string; label: string; employeeId: string; version: number };
export function DoorCodeForm({
  doors,
  staff,
  changes,
}: {
  doors: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  changes: Choice[];
}) {
  const [state, action, pending] = useActionState(issueDoorCodeAction, {} as ActionState);
  const [replacement, setReplacement] = useState("");
  const [kind, setKind] = useState("staff");
  const choice = changes.find((c) => c.id === replacement);
  const pin = useRef<HTMLInputElement>(null);
  return (
    <form
      aria-label="Door code request"
      className="form-grid"
      action={(form) => {
        const result = action(form);
        if (pin.current) pin.current.value = "";
        return result;
      }}
    >
      <label>
        Request
        <select
          aria-label="Access request"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          disabled={pending}
        >
          <option value="">Issue a new code</option>
          {changes.map((c) => (
            <option key={c.id} value={c.id}>
              Change code · {c.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Door
        <select
          key={choice?.id || "new-door"}
          name="doorId"
          required
          value={choice?.doorId}
          disabled={pending || !!choice}
        >
          {doors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {choice ? <input type="hidden" name="doorId" value={choice.doorId} /> : null}
      </label>
      <label>
        Access type
        <select
          value={choice ? "staff" : kind}
          onChange={(e) => setKind(e.target.value)}
          disabled={pending || !!choice}
        >
          <option value="staff">Staff</option>
          <option value="temporary">Temporary vendor / visitor</option>
        </select>
      </label>
      {choice || kind === "staff" ? (
        <label>
          Staff record
          <select
            key={choice?.id || "new-staff"}
            name="employeeId"
            required
            value={choice?.employeeId}
            disabled={pending || !!choice}
          >
            <option value="">Select staff</option>
            {staff.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          {choice ? <input type="hidden" name="employeeId" value={choice.employeeId} /> : null}
        </label>
      ) : null}
      <label>
        Access label
        <input
          name="label"
          required
          maxLength={80}
          placeholder="Name or purpose"
          disabled={pending}
        />
      </label>
      <label>
        New keypad code
        <input
          ref={pin}
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          required
          pattern="[0-9]{4,12}"
          minLength={4}
          maxLength={12}
          disabled={pending}
        />
      </label>
      {!choice && kind === "temporary" ? (
        <>
          <label>
            Starts · Eastern
            <input name="startsAt" type="datetime-local" required disabled={pending} />
          </label>
          <label>
            Ends · Eastern
            <input name="endsAt" type="datetime-local" required disabled={pending} />
          </label>
        </>
      ) : null}
      <input type="hidden" name="replacesId" value={choice?.id || ""} />
      <input type="hidden" name="version" value={choice?.version || 0} />
      <p className="muted" style={{ gridColumn: "1 / -1" }}>
        Codes are sent securely and are never displayed again or saved as plaintext. Share the new
        code privately after confirmation. Temporary access expires within 30 days. When changing a
        staff code, the old code stays in place until its replacement is confirmed; removal then
        requires confirmation.
      </p>
      <div style={{ gridColumn: "1 / -1" }}>
        <button className="button button-primary" disabled={pending}>
          {pending ? "Submitting…" : choice ? "Request code change" : "Request new code"}
        </button>
      </div>
      {state.message ? (
        <p
          style={{ gridColumn: "1 / -1" }}
          className={state.ok ? "success" : "error-text"}
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
export function RevokeDoorCode({
  id,
  version,
  label,
}: {
  id: string;
  version: number;
  label: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const [state, action, pending] = useActionState(revokeDoorCodeAction, {} as ActionState);
  return (
    <div>
      {!confirm ? (
        <button className="button button-outline" type="button" onClick={() => setConfirm(true)}>
          Revoke
        </button>
      ) : (
        <form action={action}>
          <p>Revoke access for {label}? Access remains until removal is confirmed.</p>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="version" value={version} />
          <input type="hidden" name="confirm" value="revoke" />
          <button className="button button-outline" disabled={pending}>
            {pending ? "Requesting…" : "Confirm revocation"}
          </button>{" "}
          <button
            className="button button-outline"
            type="button"
            disabled={pending}
            onClick={() => setConfirm(false)}
          >
            Keep access
          </button>
        </form>
      )}
      {state.message ? <p role="status">{state.message}</p> : null}
    </div>
  );
}
