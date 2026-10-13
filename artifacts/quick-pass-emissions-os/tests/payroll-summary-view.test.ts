import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PayrollSummary } from "../src/components/payroll-summary";

vi.mock("../src/components/record-link", () => ({
  RecordLink: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

type Dashboard = Parameters<typeof PayrollSummary>[0]["data"];
function fixture(): Dashboard {
  const paging = { total: 1, totalPages: 1, page: 1, pageSize: 15 };
  return {
    filter: {
      date: "2026-10-12", start: "2026-10-12", end: "2026-10-12", weekStart: 1,
      employeesPage: 1, historyPage: 1, periodsPage: 1,
    },
    week: { start: "2026-10-12", end: "2026-10-18" },
    selection: { start: "2026-10-12", end: "2026-10-12", range: false },
    syncedAt: null,
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
       rate: { eligible: true, rateCents: 100, threshold: 50, attribution: "SHOP_WIDE_APPROVED_DAILY" },
       rangeCommission: {
         daily: 4500, weekly: 4500, average: 4500,
         approvedDays: 1, pendingDays: 0, missingPolicies: 0,
       },
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
         recordedDays: 2, missingDays: 1,
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
    expect(html).toContain("Across 2 recorded working days");
    expect(html).toContain('name="start"');
    expect(html).not.toContain("Fixture</small>");
    expect(html).toContain("$1.00 / shop car above 50 per day");
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
      recordedDays: 0, missingDays: 1,
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
