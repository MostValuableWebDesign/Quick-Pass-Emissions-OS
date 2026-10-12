import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PayrollSummary } from "../src/components/payroll-summary";

vi.mock("../src/components/record-link", () => ({
  RecordLink: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));

type Dashboard = Parameters<typeof PayrollSummary>[0]["data"];
function fixture(): Dashboard {
  const paging = { total: 1, totalPages: 1, page: 1, pageSize: 15 };
  return {
    filter: {
      date: "2026-10-12", weekStart: 1,
      employeesPage: 1, historyPage: 1, periodsPage: 1,
    },
    week: { start: "2026-10-12", end: "2026-10-18" },
    employeesPaging: paging,
    historyPaging: paging,
    periodsPaging: paging,
    employees: [{
      id: "employee-fixture", name: "Sample employee", active: true,
      arrangement: {
        id: "pay-fixture", createdAt: new Date("2026-10-12T12:00:00Z"),
        effectiveDate: "2026-10-01", createdBy: "owner-fixture",
        employeeId: "employee-fixture", kind: "WEEKLY", amountCents: 115000,
        scheduledDaysPerWeek: 5, scheduledMinutesPerDay: 600, reason: "Fixture",
      },
      policy: null,
      approvedPayroll: {
        id: "line-fixture", totalCents: 119500, employeeId: "employee-fixture",
        draftId: "draft-fixture", employeeName: "Sample employee",
        baseCents: 115000, commissionCents: 4500, snapshot: {},
        draft: { period: {
          id: "period-fixture", label: "Previously approved payroll",
          startDate: "2026-10-05", endDate: "2026-10-11",
        } },
      },
      base: { daily: 23000, weekly: 115000 },
      commission: {
        daily: 4500, weekly: 9000, average: 4500,
        approvedDays: 2, pendingDays: 1, missingPolicies: 0,
      },
    }],
    history: [],
    periods: [],
  };
}

const render = (data: Dashboard) => renderToStaticMarkup(createElement(PayrollSummary, {
  data, href: (key, page) => `/payroll?${key}=${page}`,
}));

describe("informational employee pay overview", () => {
  it("shows employee pay and commission without approval or configuration controls", () => {
    const html = render(fixture());
    expect(html).toContain("Sample employee");
    expect(html).toContain("$230.00");
    expect(html).toContain("$1,150.00");
    expect(html).toContain("$45.00");
    expect(html).toContain("$90.00");
    expect(html).toContain("Across 2 recorded days");
    expect(html).toContain('name="date"');
    expect(html).not.toMatch(/approv|configur|authoriz|Adjust pay|percentage|Latest.*payroll/i);
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<details");
    expect(html.match(/<th>/g)).toHaveLength(5);
  });

  it("keeps missing amounts unavailable instead of inventing zero pay", () => {
    const data = fixture();
    data.employees[0].base = { daily: null, weekly: null };
    data.employees[0].commission = {
      daily: null, weekly: null, average: null,
      approvedDays: 0, pendingDays: 1, missingPolicies: 1,
    };
    const html = render(data);
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("$0.00");
    expect(html).not.toMatch(/approv|configur|authoriz/i);
    expect(html).not.toContain("Across 0 recorded days");
  });

  it("shows a neutral empty state", () => {
    const data = fixture();
    data.employees = [];
    expect(render(data)).toContain("No employees to display.");
    expect(render(data)).not.toMatch(/configur|authoriz/i);
  });
});
