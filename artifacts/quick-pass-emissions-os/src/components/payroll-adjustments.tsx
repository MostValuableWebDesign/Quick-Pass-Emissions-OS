"use client";
import { useState } from "react";
import { ActionForm, Field } from "./action-form";
import { PayrollPagination } from "./payroll-pagination";
import {
  adjustCompensation,
  savePayrollBaseDollars,
  savePayrollCommissionDollars,
} from "@/app/phase2-actions";
import { formatMoney } from "@/modules/payroll/calculations";
import type { payrollDashboard } from "@/modules/payroll/dashboard";
type Dashboard = Awaited<ReturnType<typeof payrollDashboard>>;
type Employee = Pick<
  Dashboard["employees"][number],
  "id" | "name" | "active" | "arrangement" | "policy"
>;
type Data = Pick<Dashboard, "employeesPaging"> & {
  filter: Pick<Dashboard["filter"], "date">;
  employees: Employee[];
};
const dollars = (cents: number | undefined) =>
  cents === undefined ? "" : (cents / 100).toFixed(2);
function ChangeFields({ date }: { date: string }) {
  return (
    <>
      <Field label="Effective date">
        <input name="effectiveDate" type="date" defaultValue={date} required />
      </Field>
      <Field label="Reason for change">
        <textarea name="reason" maxLength={2000} required />
      </Field>
    </>
  );
}
function PercentageFields({
  expectedId,
  target,
}: {
  expectedId: string;
  target: "BASE" | "COMMISSION";
}) {
  return (
    <>
      <input name="expectedId" type="hidden" value={expectedId} />
      <input name="target" type="hidden" value={target} />
      <Field label="Change direction">
        <select name="direction">
          <option value="INCREASE">Increase</option>
          <option value="DECREASE">Decrease</option>
        </select>
      </Field>
      <Field label="Percentage">
        <input
          name="percent"
          type="number"
          min="0.01"
          max="10000"
          step="0.01"
          required
          placeholder="e.g. 5"
        />
      </Field>
    </>
  );
}
function EmployeeEditor({ employee: e, date }: { employee: Employee; date: string }) {
  const [baseMode, setBaseMode] = useState("EXACT");
  const [commissionMode, setCommissionMode] = useState("EXACT");
  return (
    <div className="pay-adjust-grid">
      <section className="pay-adjust-card" aria-label="Base pay adjustment">
        <h3>Base pay · {e.name}</h3>
        <p className="muted">
          Current as of {date}:{" "}
          {e.arrangement
            ? `${formatMoney(e.arrangement.amountCents)} · ${e.arrangement.kind.toLowerCase()} · from ${e.arrangement.effectiveDate}`
            : "Not configured"}
        </p>
        <Field label="Base pay change">
          <select
            aria-label="Base pay change"
            value={baseMode}
            onChange={(event) => setBaseMode(event.target.value)}
          >
            <option value="EXACT">Set exact rate</option>
            <option value="PERCENT" disabled={!e.arrangement}>
              Increase or decrease by percentage
            </option>
          </select>
        </Field>
        <ActionForm
          key={`base:${baseMode}`}
          action={baseMode === "PERCENT" ? adjustCompensation : savePayrollBaseDollars}
          submit="Save base pay"
        >
          <input name="employeeId" type="hidden" value={e.id} />
          {baseMode === "PERCENT" && e.arrangement ? (
            <PercentageFields expectedId={e.arrangement.id} target="BASE" />
          ) : (
            <>
              <Field label="Pay basis">
                <select name="kind" defaultValue={e.arrangement?.kind ?? ""} required>
                  <option value="" disabled>
                    Select pay basis
                  </option>
                  <option value="HOURLY">Hourly</option>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="FIXED">Fixed per payroll period</option>
                </select>
              </Field>
              <Field label="Base rate ($)">
                <input
                  name="amountDollars"
                  type="number"
                  min="0"
                  max="20000000"
                  step="0.01"
                  defaultValue={dollars(e.arrangement?.amountCents)}
                  required
                />
              </Field>
              <Field label="Scheduled days per week">
                <input
                  name="scheduledDaysPerWeek"
                  type="number"
                  min="1"
                  max="7"
                  step="1"
                  defaultValue={e.arrangement?.scheduledDaysPerWeek ?? ""}
                />
              </Field>
              <Field label="Scheduled minutes per day">
                <input
                  name="scheduledMinutesPerDay"
                  type="number"
                  min="1"
                  max="1440"
                  step="1"
                  defaultValue={e.arrangement?.scheduledMinutesPerDay ?? ""}
                />
              </Field>
            </>
          )}
          <ChangeFields date={date} />
        </ActionForm>
      </section>
      <section className="pay-adjust-card" aria-label="Commission adjustment">
        <h3>Commission · {e.name}</h3>
        <p className="muted">
          Current as of {date}:{" "}
          {e.policy
            ? e.policy.eligible
              ? `${formatMoney(e.policy.rateCents)} per qualifying test above ${e.policy.threshold} · from ${e.policy.effectiveDate}`
              : "Not eligible"
            : "Not configured"}
        </p>
        <Field label="Commission change">
          <select
            aria-label="Commission change"
            value={commissionMode}
            onChange={(event) => setCommissionMode(event.target.value)}
          >
            <option value="EXACT">Set rate and volume rules</option>
            <option value="PERCENT" disabled={!e.policy}>
              Increase or decrease rate by percentage
            </option>
          </select>
        </Field>
        <ActionForm
          key={`commission:${commissionMode}`}
          action={commissionMode === "PERCENT" ? adjustCompensation : savePayrollCommissionDollars}
          submit="Save commission"
        >
          <input name="employeeId" type="hidden" value={e.id} />
          {commissionMode === "PERCENT" && e.policy ? (
            <PercentageFields expectedId={e.policy.id} target="COMMISSION" />
          ) : (
            <>
              <Field label="Commission eligibility">
                <select
                  name="eligible"
                  defaultValue={e.policy ? String(e.policy.eligible) : ""}
                  required
                >
                  <option value="" disabled>
                    Select eligibility
                  </option>
                  <option value="true">Eligible</option>
                  <option value="false">Not eligible</option>
                </select>
              </Field>
              <Field label="Commission basis">
                <select name="attribution" defaultValue={e.policy?.attribution ?? ""} required>
                  <option value="" disabled>
                    Select count basis
                  </option>
                  <option value="PERSONAL_APPROVED_DAILY">Approved personal daily tests</option>
                  <option value="SHOP_WIDE_APPROVED_DAILY">Approved whole-shop daily tests</option>
                </select>
              </Field>
              <Field label="Daily test threshold">
                <input
                  name="threshold"
                  type="number"
                  min="0"
                  max="100000"
                  step="1"
                  defaultValue={e.policy?.threshold ?? ""}
                  required
                />
              </Field>
              <Field label="Commission per qualifying test ($)">
                <input
                  name="rateDollars"
                  type="number"
                  min="0"
                  max="20000000"
                  step="0.01"
                  defaultValue={dollars(e.policy?.rateCents)}
                  required
                />
              </Field>
              <Field label="Volume boost starts above tests/day">
                <input
                  name="volumeThreshold"
                  type="number"
                  min="0"
                  max="100000"
                  step="1"
                  defaultValue={e.policy?.volumeThreshold ?? ""}
                />
              </Field>
              <Field label="Additional rate per test above volume threshold ($)">
                <input
                  name="volumeIncreaseDollars"
                  type="number"
                  min="0"
                  max="20000000"
                  step="0.01"
                  defaultValue={dollars(e.policy?.volumeIncreaseCents ?? undefined)}
                />
              </Field>
              <p className="muted">
                Leave both volume boost fields blank to disable the boost. A percentage change
                adjusts the base commission rate and retains existing eligibility, thresholds and
                boost.
              </p>
            </>
          )}
          <ChangeFields date={date} />
        </ActionForm>
      </section>
    </div>
  );
}
export function PayrollAdjustments({ data, query }: { data: Data; query: string }) {
  const href = (page: number) => {
    const params = new URLSearchParams(query);
    params.set("employeesPage", String(page));
    return `/payroll?${params}`;
  };
  const [employeeId, setEmployeeId] = useState(data.employees[0]?.id ?? "");
  const employee = data.employees.find((e) => e.id === employeeId) ?? data.employees[0];
  return (
    <section className="card space-top" aria-label="Adjust pay and commissions">
      <div className="card-heading">
        <h2>Adjust pay &amp; commissions</h2>
        <span className="badge neutral">Owner controls</span>
      </div>
      <div className="card-body">
        <p>
          Choose an employee and save a dated payroll rate. Each change requires a reason and
          appears in Pay transaction history. Existing dated rates and approved payroll are
          retained.
        </p>
        <p className="muted">
          These are payroll rates. The separate Pay setup dialog controls Performance report
          estimates.
        </p>
        <PayrollPagination
          label="Pay adjustment employees"
          paging={data.employeesPaging}
          href={href}
        />
        {employee ? (
          <>
            <Field label="Employee to adjust">
              <select value={employee.id} onChange={(e) => setEmployeeId(e.target.value)}>
                {data.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.active ? "" : " · inactive"}
                  </option>
                ))}
              </select>
            </Field>
            <EmployeeEditor
              key={`${employee.id}:${data.filter.date}`}
              employee={employee}
              date={data.filter.date}
            />
          </>
        ) : (
          <p className="muted">Create an employee record before configuring pay.</p>
        )}
        <p className="muted">
          Rates shown use the Pay overview date below. Use a new effective date for each version;
          frozen payroll dates cannot be changed.
        </p>
      </div>
    </section>
  );
}
