"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type {
  DashboardEmployee,
  InspectionCadence,
  PayProfile,
} from "@/modules/station/dashboard-types";
import { usd, num, inspectionTime } from "./performance-dashboard-format";

type Key =
  | "name"
  | "cars"
  | "workingDays"
  | "inspectionCadence"
  | "revenueCents"
  | "baseCents"
  | "commissionCents"
  | "payCents";
const COLS: [Key, string, boolean][] = [
  ["name", "Employee", false],
  ["cars", "Cars", true],
  ["workingDays", "Days", true],
  ["inspectionCadence", "Avg Test Time", true],
  ["revenueCents", "Revenue", true],
  ["baseCents", "Base", true],
  ["commissionCents", "Commission", true],
  ["payCents", "Est. pay", true],
];

const sumKnown = (
  rows: DashboardEmployee[],
  k: "baseCents" | "commissionCents" | "payCents" | "cars" | "revenueCents",
) => (rows.some((r) => r[k] === null) ? null : rows.reduce((a, r) => a + (r[k] ?? 0), 0));

export function EmployeeTable({
  employees,
  profiles = [],
  overallCadence,
  panelActions,
  onVisibleRowsChange,
}: {
  employees: DashboardEmployee[];
  profiles?: PayProfile[];
  overallCadence?: InspectionCadence;
  panelActions?: ReactNode;
  onVisibleRowsChange?: (count: number) => void;
}) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "payCents", dir: -1 });
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = employees.filter(
      (e) =>
        !t || e.name.toLowerCase().includes(t) || (e.inspector ?? "").toLowerCase().includes(t),
    );
    return [...list].sort((a, b) => {
      const x = sort.key === "inspectionCadence" ? a.inspectionCadence.medianMinutes : a[sort.key];
      const y = sort.key === "inspectionCadence" ? b.inspectionCadence.medianMinutes : b[sort.key];
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (
        (typeof x === "string" ? x.localeCompare(String(y)) : (x as number) - (y as number)) *
        sort.dir
      );
    });
  }, [employees, sort, q]);
  useEffect(() => {
    onVisibleRowsChange?.(rows.length);
  }, [onVisibleRowsChange, rows.length]);
  const maxCars = Math.max(1, ...employees.map((e) => e.cars ?? 0));
  const toggle = (key: Key) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 },
    );
  const cars = sumKnown(rows, "cars");
  const rev = sumKnown(rows, "revenueCents");

  return (
    <section className="pd-card pd-employee-card" aria-label="Employees">
      <div className="pd-card-h">
        <div className="pd-card-title">
          <h2>Employees</h2>
          <p>Estimated pay for the selected dates. Not payroll.</p>
        </div>
        <div className="pd-card-actions">
          <input
            className="pd-search"
            type="search"
            placeholder="Filter employees"
            aria-label="Filter employees"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="input-employee-filter"
          />
          {panelActions}
        </div>
      </div>
      {rows.length ? (
        <div className="table-scroll">
          <table className="pd-table pd-num pd-employee-table">
            <thead>
              <tr>
                {COLS.map(([k, l, r]) => (
                  <th
                    key={k}
                    className={r ? "r" : undefined}
                    aria-sort={
                      sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"
                    }
                  >
                    <button
                      type="button"
                      onClick={() => toggle(k)}
                      data-testid={`button-sort-${k}`}
                    >
                      <span>{l}</span>
                      {sort.key === k &&
                        (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const profile = profiles.find(
                  (p) => p.id === e.id || (e.inspector !== null && p.inspector === e.inspector),
                );
                const dailyBase =
                  profile?.hourlyCents != null
                    ? Math.round((profile.hourlyCents * profile.standardMinutes) / 60)
                    : null;
                return (
                  <tr key={e.id} data-testid={`row-employee-${e.id}`}>
                    <td>
                      <strong>{e.name}</strong>
                      <small>
                        {e.inspector ? `Portal: ${e.inspector}` : "No portal name linked"}
                      </small>
                    </td>
                    <td className="r">
                      {num(e.cars)}
                      {e.cars !== null && (
                        <div className="pd-bar">
                          <span style={{ transform: `scaleX(${e.cars / maxCars})` }} />
                        </div>
                      )}
                    </td>
                    <td className="r">{e.workingDays ?? "—"}</td>
                    <td
                      className="r"
                      data-testid={`text-employee-interval-${e.id}`}
                      title="Median consecutive-test gap for this employee, paired within each day. Includes free retests; not measured inspection duration."
                    >
                      {inspectionTime(e.inspectionCadence.medianMinutes)}
                    </td>
                    <td className="r">{usd(e.revenueCents)}</td>
                    <td className="r">
                      {e.baseCents === null ? (
                        <span className="pd-unknown">
                          {dailyBase !== null ? "Days unconfirmed" : "Unknown"}
                        </span>
                      ) : (
                        usd(e.baseCents)
                      )}
                      {dailyBase !== null && profile && (
                        <small>{usd(dailyBase * profile.shiftsPerWeek)} / week</small>
                      )}
                    </td>
                    <td className="r">
                      {e.commissionCents === null ? (
                        <span className="pd-unknown">Unknown</span>
                      ) : (
                        usd(e.commissionCents)
                      )}
                    </td>
                    <td className="r">
                      {e.payCents === null ? (
                        <span className="pd-unknown">Unknown</span>
                      ) : (
                        <strong>{usd(e.payCents)}</strong>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total ({rows.length})</td>
                <td className="r">{num(cars)}</td>
                <td />
                <td
                  className="r"
                  title="Median of retained gaps, paired separately for each employee and day; not an average of employee medians."
                >
                  {rows.length === employees.length && overallCadence ? (
                    <>{inspectionTime(overallCadence.medianMinutes)}</>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="r">{usd(rev)}</td>
                <td className="r">{usd(sumKnown(rows, "baseCents"))}</td>
                <td className="r">{usd(sumKnown(rows, "commissionCents"))}</td>
                <td className="r">{usd(sumKnown(rows, "payCents"))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="pd-empty">
          {employees.length
            ? "No employees match that filter."
            : "No employee activity for these dates."}
        </div>
      )}
    </section>
  );
}
