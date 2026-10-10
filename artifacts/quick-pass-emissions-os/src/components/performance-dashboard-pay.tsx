"use client";

import { useRef, useState } from "react";
import { Plus, Settings2, Trash2, X } from "lucide-react";
import type { DashboardQuery, DashboardState, PayAdjustment, PayPlan, PayProfile } from "@/modules/station/dashboard-types";
import { savePerformancePayPlanAction } from "@/modules/station/dashboard-actions";
import { WEEKDAYS, centsToDollars, dollarsToCents } from "./performance-dashboard-format";

const clone = (p: PayPlan): PayPlan => JSON.parse(JSON.stringify(p));
const newId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function PayPlanDialog({
  plan,
  inspectors,
  query,
  today,
  onSaved,
}: {
  plan: PayPlan;
  inspectors: string[];
  query: DashboardQuery;
  today: string;
  onSaved: (s: DashboardState) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<PayPlan>(() => clone(plan));
  const [tab, setTab] = useState<"profiles" | "days">("profiles");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    setDraft(clone(plan));
    setError(null);
    ref.current?.showModal();
  };
  const close = () => ref.current?.close();
  const setProfile = (id: string, patch: Partial<PayProfile>) =>
    setDraft((d) => ({ ...d, profiles: d.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const setAdj = (i: number, patch: Partial<PayAdjustment>) =>
    setDraft((d) => ({ ...d, adjustments: d.adjustments.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));
  const usedInspectors = (exceptId: string) =>
    new Set(draft.profiles.filter((p) => p.id !== exceptId && p.inspector).map((p) => p.inspector));

  const save = async () => {
    if (saving) return;
    for (const p of draft.profiles) {
      if (!p.name.trim()) return setError("Every employee needs a name.");
      if (p.scheduledWeekdays.length > p.shiftsPerWeek)
        return setError(`${p.name}: ${p.scheduledWeekdays.length} scheduled days exceeds ${p.shiftsPerWeek} shifts per week.`);
    }
    setSaving(true);
    setError(null);
    try {
      const res = await savePerformancePayPlanAction(draft, query);
      if (res.ok === false || !res.data) setError(res.message ?? "Could not save pay setup.");
      else {
        onSaved(res);
        close();
      }
    } catch {
      setError("Could not save pay setup. Your changes are still here.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" className="button button-outline" onClick={open} data-testid="button-pay-setup">
        <Settings2 size={15} /> Pay setup
      </button>
      <dialog ref={ref} className="pd-dialog" aria-labelledby="pd-pay-title" onCancel={(e) => saving && e.preventDefault()}>
        <div className="pd-dialog-h">
          <div>
            <h2 id="pd-pay-title">Pay setup</h2>
            <small className="muted">Report estimates only. Approved payroll is unchanged.</small>
          </div>
          <div className="pd-tabs">
            <div className="pd-seg" role="group" aria-label="Section">
              <button type="button" aria-pressed={tab === "profiles"} onClick={() => setTab("profiles")}>Employees</button>
              <button type="button" aria-pressed={tab === "days"} onClick={() => setTab("days")}>
                Day adjustments{draft.adjustments.length ? ` (${draft.adjustments.length})` : ""}
              </button>
            </div>
            <button type="button" className="button button-ghost" onClick={close} aria-label="Close" disabled={saving}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="pd-dialog-b">
          {tab === "profiles" ? (
            <>
              {draft.profiles.map((p) => {
                const used = usedInspectors(p.id);
                return (
                  <fieldset key={p.id} className="pd-prof" aria-label={p.name || "Employee"}>
                    <label className="field two">
                      <span>Name</span>
                      <input value={p.name} onChange={(e) => setProfile(p.id, { name: e.target.value })} />
                    </label>
                    <label className="field two">
                      <span>Portal inspector</span>
                      <select value={p.inspector ?? ""} onChange={(e) => setProfile(p.id, { inspector: e.target.value || null })}>
                        <option value="">Not linked</option>
                        {[...new Set([...inspectors, ...(p.inspector ? [p.inspector] : [])])].map((n) => (
                          <option key={n} value={n} disabled={used.has(n)}>
                            {n}{used.has(n) ? " (linked)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Hourly $</span>
                      <input inputMode="decimal" defaultValue={centsToDollars(p.hourlyCents)} placeholder="Unknown"
                        onBlur={(e) => setProfile(p.id, { hourlyCents: dollarsToCents(e.target.value) })} />
                    </label>
                    <label className="field">
                      <span>Monday flat $</span>
                      <input inputMode="decimal" defaultValue={centsToDollars(p.mondayCents)} placeholder="None"
                        onBlur={(e) => setProfile(p.id, { mondayCents: dollarsToCents(e.target.value) })} />
                    </label>
                    <label className="field">
                      <span>Shift hours</span>
                      <input type="number" min={0} max={24} step={0.25} value={p.standardMinutes / 60}
                        onChange={(e) => setProfile(p.id, { standardMinutes: Math.round(Number(e.target.value || 0) * 60) })} />
                    </label>
                    <label className="field">
                      <span>Shifts / week</span>
                      <input type="number" min={0} max={7} value={p.shiftsPerWeek}
                        onChange={(e) => setProfile(p.id, { shiftsPerWeek: Math.max(0, Math.min(7, Math.round(Number(e.target.value || 0)))) })} />
                    </label>
                    <div className="field two">
                      <span>Available</span>
                      <div className="pd-days">
                        {WEEKDAYS.map((w, i) => (
                          <label key={w}>
                            <input type="checkbox" checked={p.availableWeekdays.includes(i)}
                              onChange={(e) => setProfile(p.id, {
                                availableWeekdays: e.target.checked ? [...p.availableWeekdays, i].sort() : p.availableWeekdays.filter((x) => x !== i),
                                scheduledWeekdays: e.target.checked ? p.scheduledWeekdays : p.scheduledWeekdays.filter((x) => x !== i),
                              })} />
                            {w}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="field two">
                      <span>Confirmed schedule ({p.scheduledWeekdays.length}/{p.shiftsPerWeek})</span>
                      <div className="pd-days">
                        {WEEKDAYS.map((w, i) => (
                          <label key={w}>
                            <input type="checkbox" checked={p.scheduledWeekdays.includes(i)}
                              disabled={!p.availableWeekdays.includes(i) || (!p.scheduledWeekdays.includes(i) && p.scheduledWeekdays.length >= p.shiftsPerWeek)}
                              onChange={(e) => setProfile(p.id, {
                                scheduledWeekdays: e.target.checked ? [...p.scheduledWeekdays, i].sort() : p.scheduledWeekdays.filter((x) => x !== i),
                              })} />
                            {w}
                          </label>
                        ))}
                      </div>
                    </div>
                    <label className="check">
                      <input type="checkbox" checked={p.commissionEligible} onChange={(e) => setProfile(p.id, { commissionEligible: e.target.checked })} />
                      Shop commission
                    </label>
                    <label className="check">
                      <input type="checkbox" checked={p.approximate} onChange={(e) => setProfile(p.id, { approximate: e.target.checked })} />
                      Estimated rate
                    </label>
                    <div className="full" style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button type="button" className="button button-ghost button-sm"
                        onClick={() => setDraft((d) => ({ ...d, profiles: d.profiles.filter((x) => x.id !== p.id), adjustments: d.adjustments.filter((a) => a.profileId !== p.id) }))}>
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  </fieldset>
                );
              })}
              <button type="button" className="button button-outline" style={{ alignSelf: "flex-start" }}
                onClick={() => setDraft((d) => ({ ...d, profiles: [...d.profiles, {
                  id: newId(), name: "", inspector: null, hourlyCents: null, mondayCents: null, standardMinutes: 600,
                  shiftsPerWeek: 5, availableWeekdays: [1, 2, 3, 4, 5, 6], scheduledWeekdays: [], commissionEligible: false, approximate: false,
                }] }))}>
                <Plus size={14} /> Add employee
              </button>
            </>
          ) : (
            <>
              {draft.adjustments.length === 0 && <p className="muted">No day adjustments. Add actual hours, a base override, or a grass-cutting day.</p>}
              {draft.adjustments.map((a, i) => (
                <div key={i} className="pd-adj">
                  <select aria-label="Employee" value={a.profileId} onChange={(e) => setAdj(i, { profileId: e.target.value })}>
                    {draft.profiles.map((p) => <option key={p.id} value={p.id}>{p.name || "Unnamed"}</option>)}
                  </select>
                  <input aria-label="Date" type="date" max={today} value={a.date} onChange={(e) => setAdj(i, { date: e.target.value })} />
                  <input aria-label="Actual hours" type="number" min={0} max={24} step={0.25} placeholder="Hours"
                    value={a.minutes === null ? "" : a.minutes / 60}
                    onChange={(e) => setAdj(i, { minutes: e.target.value === "" ? null : Math.round(Number(e.target.value) * 60) })} />
                  <input aria-label="Base override dollars" inputMode="decimal" placeholder="Base $" defaultValue={centsToDollars(a.baseCents)}
                    onBlur={(e) => setAdj(i, { baseCents: dollarsToCents(e.target.value) })} />
                  <label className="check"><input type="checkbox" checked={a.grassCut} onChange={(e) => setAdj(i, { grassCut: e.target.checked })} />Grass</label>
                  <button type="button" className="button button-ghost" aria-label="Remove adjustment"
                    onClick={() => setDraft((d) => ({ ...d, adjustments: d.adjustments.filter((_, j) => j !== i) }))}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button type="button" className="button button-outline" style={{ alignSelf: "flex-start" }} disabled={!draft.profiles.length}
                onClick={() => setDraft((d) => ({ ...d, adjustments: [...d.adjustments, { profileId: d.profiles[0].id, date: today, minutes: null, baseCents: null, grassCut: false }] }))}>
                <Plus size={14} /> Add day adjustment
              </button>
            </>
          )}
        </div>

        <div className="pd-dialog-f">
          <span role="status" className={error ? "error-text" : "muted"} style={{ fontSize: 12 }}>
            {error ?? "Blank rates stay unknown, not zero."}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="button button-outline" onClick={close} disabled={saving}>Cancel</button>
            <button type="button" className="button button-primary" onClick={save} disabled={saving} data-testid="button-save-pay">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
