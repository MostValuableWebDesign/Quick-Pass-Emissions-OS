import { settingsStationAction } from "@/app/station-actions";
import { ActionForm } from "@/components/action-form";
import { loadStationSettings } from "@/modules/station/performance";
import type { Hours } from "@/modules/station/projections";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function StationSettingsPanel({ actorId }: { actorId: string }) {
  const settings = await loadStationSettings(actorId);
  const latest = settings[0] ?? null;
  const hours = (latest?.hours ?? []) as Hours;

  return (
    <section className="card card-body station-settings-panel" id="station-settings">
      <h2>Station settings</h2>
      <p className="muted">
        These station hours and projection settings apply only to Emissions Performance. They do
        not change Business operating days, closures, or responsibility generation.
      </p>
      <p className="muted">
        {latest
          ? `Revision ${latest.revision}, effective ${latest.effectiveDate}. New revisions must have a later effective date.`
          : "Not configured. This Week and projections are unavailable."}
      </p>
      {settings.length > 0 && (
        <p className="muted">
          History:{" "}
          {settings
            .map(
              (setting) =>
                `r${setting.revision} from ${setting.effectiveDate} (week starts ${DAYS[setting.weekStart - 1]}${setting.sourceTimezoneConfirmed ? ", NY dates confirmed" : ", timezone unconfirmed"})`,
            )
            .join("; ")}
        </p>
      )}
      <ActionForm action={settingsStationAction} submit="Save new revision">
        <input type="hidden" name="revision" value={latest?.revision ?? 0} />
        <label className="field">
          <span>Effective date</span>
          <input type="date" name="effectiveDate" required />
        </label>
        <label className="field">
          <span>Week starts on</span>
          <select name="weekStart" defaultValue={latest?.weekStart ?? ""} required>
            <option value="" disabled>
              Choose
            </option>
            {DAYS.map((day, index) => (
              <option key={day} value={index + 1}>
                {day}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="wide">
          <legend>Station performance hours (split overnight hours by date)</legend>
          {DAYS.map((day, index) => {
            const weekday = index + 1;
            const entry = hours.find((hour) => hour.weekday === weekday);
            return (
              <div key={day} className="checks" style={{ alignItems: "center", marginBottom: 8 }}>
                <label style={{ width: 80 }}>
                  <input
                    type="checkbox"
                    name={`openDay${weekday}`}
                    value="true"
                    defaultChecked={!!entry}
                  />{" "}
                  {day}
                </label>
                <label>
                  Open{" "}
                  <input
                    type="time"
                    name={`open${weekday}`}
                    defaultValue={entry?.open ?? ""}
                    style={{ width: 130 }}
                  />
                </label>
                <label>
                  Close{" "}
                  <input
                    type="time"
                    name={`close${weekday}`}
                    defaultValue={entry?.close ?? ""}
                    style={{ width: 130 }}
                  />
                </label>
              </div>
            );
          })}
        </fieldset>
        <label className="field">
          <span>Observation days (7–365)</span>
          <input
            type="number"
            name="observationDays"
            min={7}
            max={365}
            defaultValue={latest?.observationDays ?? ""}
            required
          />
        </label>
        <label className="field">
          <span>Minimum usable days</span>
          <input
            type="number"
            name="minimumDays"
            min={1}
            max={365}
            defaultValue={latest?.minimumDays ?? ""}
            required
          />
        </label>
        <label className="check wide">
          <input
            type="checkbox"
            name="sourceTimezoneConfirmed"
            value="true"
            defaultChecked={!!latest?.sourceTimezoneConfirmed}
          />
          I confirm the portal&apos;s source calendar dates are America/New_York business dates.
          Provider timezone is unverified; payroll reconciliation is blocked until confirmed.
        </label>
        <label className="field wide">
          <span>Reason</span>
          <input name="reason" required maxLength={2000} />
        </label>
      </ActionForm>
    </section>
  );
}
