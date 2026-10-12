"use client";

import { useRef, useState, useTransition } from "react";
import { Settings2, X } from "lucide-react";
import { savePerformancePaceSettingsAction } from "@/modules/station/dashboard-actions";
import type {
  DashboardQuery,
  DashboardState,
  PaceSettings,
} from "@/modules/station/dashboard-types";

export function PerformancePaceSettings({
  settings,
  query,
  onSaved,
}: {
  settings: PaceSettings;
  query: DashboardQuery;
  onSaved: (state: DashboardState) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [threshold, setThreshold] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();
  const open = () => {
    setThreshold(settings.longGapMinutes?.toString() ?? "");
    setError(null);
    dialog.current?.showModal();
  };
  return (
    <>
      <button type="button" className="button button-outline" onClick={open}>
        <Settings2 size={15} aria-hidden="true" /> Pace settings
      </button>
      <dialog
        ref={dialog}
        className="pd-dialog pd-pace-dialog"
        aria-labelledby="pd-pace-title"
        onCancel={(event) => saving && event.preventDefault()}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (saving) return;
            const value = threshold.trim() === "" ? null : Number(threshold);
            if (value !== null && (!Number.isInteger(value) || value < 1 || value > 1439)) {
              setError("Use 1–1439 whole minutes, or leave blank for no long-gap limit.");
              return;
            }
            setError(null);
            startTransition(async () => {
              try {
                const result = await savePerformancePaceSettingsAction(
                  { ...settings, longGapMinutes: value },
                  query,
                );
                if (!result.ok || !result.data)
                  setError(result.message ?? "Could not save pace settings.");
                else {
                  onSaved(result);
                  dialog.current?.close();
                }
              } catch {
                setError("Could not save pace settings. Your changes are still here.");
              }
            });
          }}
        >
          <div className="pd-dialog-h">
            <h2 id="pd-pace-title">Pace settings</h2>
            <button
              type="button"
              className="button button-ghost"
              aria-label="Close pace settings"
              disabled={saving}
              onClick={() => dialog.current?.close()}
            >
              <X size={16} />
            </button>
          </div>
          <div className="pd-dialog-b">
            <label className="field">
              <span>Long-gap threshold (minutes)</span>
              <input
                type="number"
                min={1}
                max={1439}
                step={1}
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
                disabled={saving}
                aria-describedby="pd-pace-help"
                autoFocus
              />
            </label>
            <p className="muted" id="pd-pace-help">
              Exclude gaps strictly longer than this limit. Leave blank to include every same-day
              gap. Overnight gaps are always excluded.
            </p>
            <p className="muted">
              Applies to all employee pace estimates for this station, including past dates. Free
              retests are included. A long gap may reflect no customers, downtime or a break; its
              cause is unknown.
            </p>
            {error && (
              <p className="notice warning" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="pd-dialog-f">
            <button type="submit" className="button" disabled={saving}>
              {saving ? "Saving…" : "Save pace settings"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
