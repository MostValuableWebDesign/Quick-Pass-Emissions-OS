import { describe, expect, it } from "vitest";
import {
  buildDashboard,
  calendarDays,
  inspectorKey,
} from "../src/modules/station/dashboard-calculations";
import type { PayPlan, PortalDay } from "../src/modules/station/dashboard-types";
import { addDays, businessDate } from "../src/lib/time";
import { portalExplicitEmpty } from "../src/modules/station/portal-client";
import {
  dashboardDaySchema,
  dashboardPayPlanSchema,
  resolveDashboardQuery,
} from "../src/modules/station/dashboard-service";

const today = "2026-01-15";
const day: PortalDay = {
  date: today,
  total: 95,
  passed: 75,
  failed: 18,
  aborted: 2,
  other: 0,
  retrievedAt: "2026-01-15T18:00:00Z",
  verifiedEmpty: false,
  inspectors: [
    { inspector: "Fixture One", total: 70, passed: 55, failed: 13, aborted: 2, other: 0 },
    { inspector: "Fixture Two", total: 25, passed: 20, failed: 5, aborted: 0, other: 0 },
  ],
};
const query = { start: today, end: today, trendDays: 7 as const };
const plan: PayPlan = {
  revision: 0,
  adjustments: [],
  profiles: ["Fixture One", "Fixture Two"].map((name, i) => ({
    id: `staff-${i}`,
    name,
    inspector: name,
    hourlyCents: 2300,
    mondayCents: null,
    standardMinutes: 600,
    shiftsPerWeek: 5,
    availableWeekdays: [1, 2, 3, 4, 5, 6],
    scheduledWeekdays: [1, 2, 3, 4, 5],
    commissionEligible: true,
    approximate: false,
  })),
};
describe("Performance financial projections", () => {
  it("pays each working employee $45 at 95 SHOP vehicles, not their individual threshold", () => {
    const data = buildDashboard(query, today, [day], plan);
    expect(data.employees.map((e) => e.commissionCents)).toEqual([4500, 4500]);
    expect(data.summary.commissionCents).toBe(9000);
    expect(data.summary.baseCents).toBe(46000);
    expect(data.summary.payCents).toBe(55000);
    expect(data.summary.revenueCents).toBe(186000); // 93 pass/fail, excluding 2 aborted.
  });
  it("filters employee counts/revenue/pay without changing the shop-wide commission basis", () => {
    const data = buildDashboard(
      { ...query, employee: inspectorKey("Fixture Two") },
      today,
      [day],
      plan,
    );
    expect(data.summary.cars).toBe(25);
    expect(data.summary.commissionCents).toBe(4500);
    expect(data.summary.revenueCents).toBe(50000);
    expect(data.current?.total).toBe(95);
    expect(data.series.at(-1)?.stationCars).toBe(95);
  });
  it("keeps report panels and the chart on the same selected day", () => {
    const data = buildDashboard(
      { ...query, trendDays: 30, employee: inspectorKey("Fixture Two") },
      today,
      [{ ...day, date: "2026-01-14" }, day],
      plan,
    );
    expect(data.series).toHaveLength(1);
    expect(data.series.at(-1)).toMatchObject({ date: today, cars: 25, revenueCents: 50000 });
    expect(data.commissionProgress.days.map((d) => d.date)).toEqual([today]);
    expect(data.busyHours.expectedDays).toBe(1);
    expect(data.employees).toHaveLength(1);
    expect(data.summary.cars).toBe(data.series.at(-1)?.cars);
  });
  it("aligns inclusive multi-day ranges and preserves Sundays and missing days", () => {
    const data = buildDashboard(
      { ...query, start: "2026-01-11", end: "2026-01-15" },
      today,
      [{ ...day, date: "2026-01-11" }, day],
      plan,
    );
    expect(data.series.map((d) => d.date)).toEqual(calendarDays("2026-01-11", "2026-01-15"));
    expect(data.series.find((d) => d.date === "2026-01-11")?.cars).toBe(95);
    expect(data.series.find((d) => d.date === "2026-01-12")?.cars).toBeNull();
    expect(data.commissionProgress.days.map((d) => d.date)).toEqual(
      calendarDays("2026-01-11", "2026-01-15"),
    );
    expect(data.busyHours.expectedDays).toBe(5);
    expect(data.summary.expectedDays).toBe(5);
    expect(data.summary.cars).toBeNull();
  });
  it("keeps missing source data null and graph gaps instead of manufacturing zero", () => {
    const data = buildDashboard(query, today, [], plan);
    expect(data.summary.cars).toBeNull();
    expect(data.summary.revenueCents).toBeNull();
    expect(data.summary.commissionCents).toBeNull();
    expect(data.summary.payCents).toBeNull();
    expect(data.series.every((d) => d.cars === null)).toBe(true);
  });
  it("accepts a separately verified empty source date as zero", () => {
    const empty: PortalDay = {
      ...day,
      total: 0,
      passed: 0,
      failed: 0,
      aborted: 0,
      inspectors: [],
      verifiedEmpty: true,
    };
    expect(dashboardDaySchema.safeParse(empty).success).toBe(true);
    expect(dashboardDaySchema.safeParse({ ...empty, verifiedEmpty: false }).success).toBe(false);
    const data = buildDashboard(query, today, [empty], plan);
    expect(data.summary.cars).toBe(0);
    expect(data.summary.revenueCents).toBe(0);
    expect(data.summary.commissionCents).toBe(0);
  });
  it("does not automatically add a sixth paid shift when six days are available", () => {
    const saturday = "2026-01-17";
    const data = buildDashboard({ ...query, start: saturday, end: saturday }, saturday, [], plan);
    expect(data.summary.baseCents).toBe(0);
    const invalid = {
      ...plan,
      profiles: plan.profiles.map((p) => ({ ...p, scheduledWeekdays: [1, 2, 3, 4, 5, 6] })),
    };
    expect(dashboardPayPlanSchema.safeParse(invalid).success).toBe(false);
  });
  it("estimates standard shifts only for source-confirmed work without guessing days off", () => {
    const unconfirmed = {
      ...plan,
      profiles: plan.profiles.map((p) => ({ ...p, scheduledWeekdays: [] })),
    };
    const data = buildDashboard(query, today, [day], unconfirmed);
    expect(data.summary.baseCents).toBe(46000);
    expect(data.summary.payCents).toBe(55000);
    expect(data.employees.every((e) => e.approximate)).toBe(true);
    expect(data.summary.commissionCents).toBe(9000);
    expect(buildDashboard(query, today, [], unconfirmed).summary.baseCents).toBeNull();
  });
  it("projects a $900 five-day ten-hour week as $180 per confirmed working day, with actual hours taking precedence", () => {
    const p = { ...plan.profiles[0], hourlyCents: 1800, approximate: true, scheduledWeekdays: [] };
    const estimated = { ...plan, profiles: [p] };
    const row = buildDashboard(query, today, [day], estimated).employees[0];
    expect(row.baseCents).toBe(18000);
    expect(row.payCents).toBe(22500);
    const actual = {
      ...estimated,
      adjustments: [
        { profileId: p.id, date: today, minutes: 480, baseCents: null, grassCut: false },
      ],
    };
    expect(buildDashboard(query, today, [day], actual).employees[0].baseCents).toBe(14400);
  });
  it("uses dated hours/base adjustments and only adds grass pay when recorded", () => {
    const maintenance = {
      ...plan.profiles[0],
      id: "grounds",
      name: "Fixture grounds",
      inspector: null,
      hourlyCents: null,
      mondayCents: 10000,
      commissionEligible: false,
      scheduledWeekdays: [1],
      shiftsPerWeek: 1,
    };
    const monday = "2026-01-12";
    const adjusted = {
      ...plan,
      profiles: [maintenance],
      adjustments: [
        { profileId: "grounds", date: monday, minutes: null, baseCents: null, grassCut: true },
      ],
    };
    expect(
      buildDashboard({ ...query, start: monday, end: monday }, monday, [], adjusted).summary
        .baseCents,
    ).toBe(15000);
    expect(
      buildDashboard({ ...query, start: monday, end: monday }, monday, [], {
        ...adjusted,
        adjustments: [],
      }).summary.baseCents,
    ).toBe(10000);
    const shorter = {
      ...plan,
      profiles: [plan.profiles[0]],
      adjustments: [
        { profileId: "staff-0", date: today, minutes: 300, baseCents: null, grassCut: false },
      ],
    };
    expect(buildDashboard(query, today, [day], shorter).employees[0].baseCents).toBe(11500);
  });
  it("sums daily pay and commissions over an inclusive range", () => {
    const yesterday = { ...day, date: "2026-01-14" };
    const data = buildDashboard({ ...query, start: yesterday.date }, today, [yesterday, day], plan);
    expect(data.summary.cars).toBe(190);
    expect(data.summary.revenueCents).toBe(372000);
    expect(data.summary.payCents).toBe(110000);
    expect(calendarDays(yesterday.date, today)).toHaveLength(2);
  });
  it("keeps selected-day cars, outcomes, revenue and pay separate from today's station totals", () => {
    const selected: PortalDay = {
      ...day,
      date: "2026-01-14",
      total: 60,
      passed: 50,
      failed: 10,
      aborted: 0,
      inspectors: [
        { inspector: "Fixture One", total: 40, passed: 35, failed: 5, aborted: 0, other: 0 },
        { inspector: "Fixture Two", total: 20, passed: 15, failed: 5, aborted: 0, other: 0 },
      ],
    };
    const data = buildDashboard(
      { ...query, start: selected.date, end: selected.date },
      today,
      [selected, day],
      plan,
    );
    expect(data.current?.total).toBe(95);
    expect(data.summary).toMatchObject({
      cars: 60,
      passed: 50,
      failed: 10,
      aborted: 0,
      revenueCents: 120000,
      baseCents: 46000,
      commissionCents: 2000,
      payCents: 48000,
    });
    expect(data.employees.map((e) => e.cars)).toEqual([40, 20]);
    expect(data.employees.map((e) => e.payCents)).toEqual([24000, 24000]);
  });
  it("keeps a source employee filter available on a new uncached date", () => {
    const data = buildDashboard(
      { ...query, employee: inspectorKey("Fixture Two") },
      today,
      [],
      plan,
    );
    expect(data.employeeOptions.some((e) => e.id === inspectorKey("Fixture Two"))).toBe(true);
    expect(data.summary.cars).toBeNull();
    expect(data.summary.payCents).toBeNull();
  });
  it("does not present unlinked employee test counts or unconfirmed workdays as zero", () => {
    const p = {
      ...plan,
      profiles: [{ ...plan.profiles[0], inspector: null, scheduledWeekdays: [] }],
    };
    const data = buildDashboard({ ...query, employee: "staff-0" }, today, [day], p);
    expect(data.summary.cars).toBeNull();
    expect(data.summary.revenueCents).toBeNull();
    expect(data.employees[0].workingDays).toBeNull();
    expect(data.series.at(-1)?.cars).toBeNull();
    expect(data.current?.total).toBe(95);
  });
  it("does not pay a commission for an explicitly recorded zero-hour day off", () => {
    const off = {
      ...plan,
      profiles: [plan.profiles[0]],
      adjustments: [
        { profileId: "staff-0", date: today, minutes: 0, baseCents: null, grassCut: false },
      ],
    };
    const data = buildDashboard(query, today, [day], off);
    expect(data.employees.find((e) => e.inspector === "Fixture One")?.payCents).toBe(0);
  });
  it("rejects inconsistent inspector outcomes and duplicate mappings", () => {
    expect(
      dashboardDaySchema.safeParse({
        ...day,
        inspectors: [{ ...day.inspectors[0], passed: 100 }, day.inspectors[1]],
      }).success,
    ).toBe(false);
    expect(
      dashboardPayPlanSchema.safeParse({
        ...plan,
        profiles: plan.profiles.map((p) => ({ ...p, inspector: "same" })),
      }).success,
    ).toBe(false);
  });
  it("resolves a native single-date form with a blank end to that same date", () => {
    expect(resolveDashboardQuery({ start: today, end: "" })).toMatchObject({
      start: today,
      end: today,
    });
  });
  it.each([7, 30, 365, 730, 1095, 1460, 1825, 2190] as const)(
    "applies date-period preset %s to the shared report range",
    (days) => {
      const end = businessDate();
      const start =
        days === 365
          ? `${end.slice(0, 4)}-01-01`
          : days >= 730
            ? `${Number(end.slice(0, 4)) - days / 365 + 1}-01-01`
            : addDays(end, 1 - days);
      expect(
        resolveDashboardQuery({ start: today, end: today, period: String(days) }),
      ).toMatchObject({ start, end, trendDays: days });
    },
  );
  it("applies Past 1 Year as a rolling 365-day report period", () => {
    const end = businessDate();
    expect(resolveDashboardQuery({ start: today, end: today, period: "past-year" })).toMatchObject({
      start: addDays(end, -364),
      end,
      trendDays: "past-year",
    });
  });
  it("sets All Time and custom dates as the report window modes", () => {
    expect(resolveDashboardQuery({ start: today, end: today, period: "all" })).toMatchObject({
      end: businessDate(),
      trendDays: "all",
    });
    expect(
      resolveDashboardQuery({
        start: "2024-05-12",
        end: "2024-05-15",
        trendDays: "custom",
      }),
    ).toMatchObject({
      start: "2024-05-12",
      end: "2024-05-15",
      trendDays: "custom",
    });
  });
  it("treats an older independent trend parameter as a custom shared date window", () => {
    expect(
      resolveDashboardQuery({ start: today, end: today, trendDays: "since2023" }),
    ).toMatchObject({
      start: today,
      end: today,
      trendDays: "custom",
    });
  });
});

describe("All Time station extent", () => {
  it("keeps report totals independent while starting the chart at verified source activity", () => {
    const normal = buildDashboard(query, today, [day], plan);
    const all = buildDashboard(
      { ...query, trendDays: "all" },
      today,
      [day],
      plan,
      undefined,
      "2026-01-12",
    );
    expect(all.summary).toEqual(normal.summary);
    expect(all.trendStart).toBe("2026-01-12");
    expect(all.series.map((row) => row.date)).toEqual([
      "2026-01-12",
      "2026-01-13",
      "2026-01-14",
      "2026-01-15",
    ]);
    expect(all.series[0].cars).toBeNull();
  });
});

describe("verified provider empty response", () => {
  const fields = [
    ["txtStationId", "SYNTHETIC"],
    ["txtWaiverDateStart", "01/15/2026"],
    ["txtWaiverDateEnd", "01/15/2026"],
    ["txtVin", ""],
    ["txtCertNumber", ""],
    ["txtLicNo", ""],
    ["txtWaiverRecordNumber", ""],
  ]
    .map(([name, value]) => `<input name="ctl00$MainContent$${name}" value="${value}">`)
    .join("");
  const empty = `<form>${fields}<table id="MainContent_gvMain"><tr><th>VIN</th></tr>
    <tr><td colspan="7">No data was found. <a>Clear Search</a></td></tr></table></form>`;
  it("requires the explicit grid message, exact request dates, station and cleared filters", () => {
    expect(portalExplicitEmpty(empty, today, today, "SYNTHETIC")).toBe(true);
    expect(portalExplicitEmpty(empty, today, today, "OTHER")).toBe(false);
    expect(portalExplicitEmpty(empty, "2026-01-14", today, "SYNTHETIC")).toBe(false);
    expect(
      portalExplicitEmpty(empty.replace("No data was found.", "Failed"), today, today, "SYNTHETIC"),
    ).toBe(false);
    expect(
      portalExplicitEmpty(
        empty.replace('txtVin" value=""', 'txtVin" value="FILTER"'),
        today,
        today,
        "SYNTHETIC",
      ),
    ).toBe(false);
  });
});
