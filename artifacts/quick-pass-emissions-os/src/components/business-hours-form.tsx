"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { saveSettings } from "@/app/actions";
import { BUSINESS_DAYS, businessHoursFromForm, type BusinessHours } from "@/lib/business-hours";
import { BusinessTimeSelect } from "./business-time-select";
import { Button } from "./ui/button";

type Pair = { open: string; close: string };
const empty: Pair = { open: "", close: "" };

export function BusinessHoursForm({
  operatingDays,
  operatingHours,
}: {
  operatingDays: number[];
  operatingHours: BusinessHours;
}) {
  const [days, setDays] = useState(operatingDays);
  const [hours, setHours] = useState<Record<string, Pair>>(operatingHours);
  const first = operatingDays.map((day) => operatingHours[String(day)]).find(Boolean) ?? empty;
  const [shared, setShared] = useState<Pair>(first);
  const [mode, setMode] = useState(
    operatingDays.every((day) => {
      const pair = operatingHours[String(day)] ?? empty;
      return pair.open === first.open && pair.close === first.close;
    })
      ? "shared"
      : "individual",
  );
  const [state, dispatch, pending] = useActionState(
    async (previous: Awaited<ReturnType<typeof saveSettings>>, form: FormData) => {
      const result = await saveSettings(previous, form);
      if (result.ok) setHours(businessHoursFromForm(form));
      return result;
    },
    {},
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    // Deliberately do not use React's form action: its automatic native reset can
    // blank the displayed selects/checkboxes after a successful settings update.
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    BUSINESS_DAYS.forEach((_, index) => {
      const day = index + 1;
      const pair = mode === "shared" && days.includes(day) ? shared : (hours[String(day)] ?? empty);
      form.set(`openTime${day}`, pair.open);
      form.set(`closeTime${day}`, pair.close);
    });
    startTransition(() => dispatch(form));
  }

  function changeMode(next: string) {
    if (mode === "shared" && next === "individual") {
      setHours((previous) => ({
        ...previous,
        ...Object.fromEntries(days.map((day) => [String(day), { ...shared }])),
      }));
    } else if (next === "shared") {
      setShared(days.map((day) => hours[String(day)]).find(Boolean) ?? empty);
    }
    setMode(next);
  }

  function changeDayTime(day: number, field: keyof Pair, value: string) {
    setHours((previous) => ({
      ...previous,
      [String(day)]: { ...(previous[String(day)] ?? empty), [field]: value },
    }));
  }

  return (
    <form onSubmit={submit} className="business-hours-editor">
      <fieldset disabled={pending} className="business-hours-editor-fields">
        <fieldset className="operating-hours">
          <legend>Open days</legend>
          <div className="business-open-days">
            {BUSINESS_DAYS.map((name, index) => (
              <label className="operating-hours-day" key={name}>
                <input
                  type="checkbox"
                  name="operatingDays"
                  value={index + 1}
                  checked={days.includes(index + 1)}
                  onChange={(event) =>
                    setDays((previous) =>
                      event.target.checked
                        ? [...previous, index + 1]
                        : previous.filter((day) => day !== index + 1),
                    )
                  }
                />
                <span>{name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label>
            <span>Hours setup</span>
            <select
              aria-label="Hours setup"
              value={mode}
              onChange={(event) => changeMode(event.target.value)}
            >
              <option value="shared">Same hours for all open days</option>
              <option value="individual">Different hours by day</option>
            </select>
          </label>
        </div>
        <div className="operating-hours-list">
          {mode === "shared" ? (
            <div className="business-shared-hours">
              <div className="operating-hours-time">
                <span>Opens · all open days</span>
                <BusinessTimeSelect
                  name="sharedOpen"
                  label="All open days opening time"
                  value={shared.open}
                  onChange={(open) => setShared((previous) => ({ ...previous, open }))}
                />
              </div>
              <div className="operating-hours-time">
                <span>Closes · all open days</span>
                <BusinessTimeSelect
                  name="sharedClose"
                  label="All open days closing time"
                  value={shared.close}
                  onChange={(close) => setShared((previous) => ({ ...previous, close }))}
                />
              </div>
            </div>
          ) : (
            BUSINESS_DAYS.map((name, index) => {
              const day = index + 1;
              if (!days.includes(day)) return null;
              const pair = hours[String(day)] ?? empty;
              return (
                <div className="operating-hours-row" key={name}>
                  <span className="operating-hours-day">{name}</span>
                  <div className="operating-hours-time">
                    <span>Opens</span>
                    <BusinessTimeSelect
                      name={`openTime${day}`}
                      label={`${name} opening time`}
                      value={pair.open}
                      onChange={(value) => changeDayTime(day, "open", value)}
                    />
                  </div>
                  <div className="operating-hours-time">
                    <span>Closes</span>
                    <BusinessTimeSelect
                      name={`closeTime${day}`}
                      label={`${name} closing time`}
                      value={pair.close}
                      onChange={(value) => changeDayTime(day, "close", value)}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </fieldset>
      <div className="form-footer">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save business hours"}
        </Button>
        {state.message && (
          <p role="status" className={state.ok ? "success" : "error-text"}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
