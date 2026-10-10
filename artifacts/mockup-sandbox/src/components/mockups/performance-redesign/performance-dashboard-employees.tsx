"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { DashboardEmployee } from "./dashboard-types";
import { usd, num } from "./performance-dashboard-format";

type Key = "name" | "cars" | "workingDays" | "revenueCents" | "baseCents" | "commissionCents" | "payCents";
const COLS: [Key, string, boolean][] = [
  ["name", "Employee", false],
  ["cars", "Cars", true],
  ["workingDays", "Days", true],
  ["revenueCents", "Revenue", true],
  ["baseCents", "Base", true],
  ["commissionCents", "Commission", true],
  ["payCents", "Est. pay", true],
];

const sumKnown = (rows: DashboardEmployee[], k: "baseCents" | "commissionCents" | "payCents" | "cars" | "revenueCents") =>
  rows.some((r) => r[k] === null) ? null : rows.reduce((a, r) => a + (r[k] ?? 0), 0);

export function EmployeeTable({ employees }: { employees: DashboardEmployee[] }) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "payCents", dir: -1 });
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = employees.filter(
      (e) => !t || e.name.toLowerCase().includes(t) || (e.inspector ?? "").toLowerCase().includes(t),
    );
    return [...list].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (typeof x === "string" ? x.localeCompare(String(y)) : (x as number) - (y as number)) * sort.dir;
    });
  }, [employees, sort, q]);
  const maxCars = Math.max(1, ...employees.map((e) => e.cars ?? 0));
  const toggle = (key: Key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 }));
  const cars = sumKnown(rows, "cars");
  const rev = sumKnown(rows, "revenueCents");

  return (
    <section className="pd-card" aria-label="Employees">
      <div className="pd-card-h">
        <div>
          <h2>Employees</h2>
          <p>Estimated pay for the selected dates. Not payroll.</p>
        </div>
        <input
          className="pd-search"
          type="search"
          placeholder="Filter employees"
          aria-label="Filter employees"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="input-employee-filter"
        />
      </div>
      {rows.length ? (
        <div className="table-scroll">
          <table className="pd-table pd-num">
            <thead>
              <tr>
                {COLS.map(([k, l, r]) => (
                  <th key={k} className={r ? "r" : undefined} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => toggle(k)} data-testid={`button-sort-${k}`}>
                      {l}
                      {sort.key === k && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} data-testid={`row-employee-${e.id}`}>
                  <td>
                    <strong>{e.name}</strong>
                    <small>{e.inspector ? `Portal: ${e.inspector}` : "No portal name linked"}</small>
                  </td>
                  <td className="r">
                    {num(e.cars)}
                    {e.cars !== null && <div className="pd-bar"><span style={{ transform: `scaleX(${e.cars / maxCars})` }} /></div>}
                  </td>
                  <td className="r">{e.workingDays ?? "—"}</td>
                  <td className="r">{usd(e.revenueCents)}</td>
                  <td className="r">{e.baseCents === null ? <span className="pd-unknown">Unknown</span> : usd(e.baseCents)}</td>
                  <td className="r">{e.commissionCents === null ? <span className="pd-unknown">Unknown</span> : usd(e.commissionCents)}</td>
                  <td className="r">
                    {e.payCents === null ? <span className="pd-unknown">Unknown</span> : <strong>{usd(e.payCents)}</strong>}
                    {e.approximate && <small>estimated</small>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total ({rows.length})</td>
                <td className="r">{num(cars)}</td>
                <td />
                <td className="r">{usd(rev)}</td>
                <td className="r">{usd(sumKnown(rows, "baseCents"))}</td>
                <td className="r">{usd(sumKnown(rows, "commissionCents"))}</td>
                <td className="r">{usd(sumKnown(rows, "payCents"))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="pd-empty">{employees.length ? "No employees match that filter." : "No employee activity for these dates."}</div>
      )}
    </section>
  );
}
