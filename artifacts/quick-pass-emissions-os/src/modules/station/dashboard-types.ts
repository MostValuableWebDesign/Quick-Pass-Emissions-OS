export type Counts = {
  total: number;
  passed: number;
  failed: number;
  aborted: number;
  other: number;
};
export type PortalDay = Counts & {
  date: string;
  retrievedAt: string;
  inspectors: (Counts & { inspector: string })[];
  /** An explicit provider empty response, not an absence inferred from an import. */
  verifiedEmpty: boolean;
  /** Source-local minute precision; absent in legacy count-only caches. */
  testTimes?: { inspector: string; minute: number | null }[];
};
export type InspectionCadence = {
  averageMinutes: number | null;
  cars: number;
  coveredDays: number;
};
export type DashboardQuery = {
  start: string;
  end: string;
  trendDays: 7 | 30;
  employee?: string;
};
export type PayProfile = {
  id: string;
  name: string;
  inspector: string | null;
  hourlyCents: number | null;
  mondayCents: number | null;
  standardMinutes: number;
  shiftsPerWeek: number;
  availableWeekdays: number[];
  scheduledWeekdays: number[];
  commissionEligible: boolean;
  approximate: boolean;
};
export type PayAdjustment = {
  profileId: string;
  date: string;
  minutes: number | null;
  baseCents: number | null;
  grassCut: boolean;
};
export type PayPlan = { revision: number; profiles: PayProfile[]; adjustments: PayAdjustment[] };
export type DashboardEmployee = {
  id: string;
  name: string;
  inspector: string | null;
  cars: number | null;
  workingDays: number | null;
  revenueCents: number | null;
  baseCents: number | null;
  commissionCents: number | null;
  payCents: number | null;
  approximate: boolean;
  inspectionCadence: InspectionCadence;
};
export type DashboardData = {
  query: DashboardQuery;
  today: string;
  current: (Counts & { date: string; retrievedAt: string }) | null;
  summary: {
    inspectionCadence: InspectionCadence;
    cars: number | null;
    revenueCents: number | null;
    baseCents: number | null;
    commissionCents: number | null;
    payCents: number | null;
    passed: number;
    failed: number;
    aborted: number;
    other: number;
    coveredDays: number;
    expectedDays: number;
  };
  series: {
    date: string;
    cars: number | null;
    stationCars: number | null;
    revenueCents: number | null;
    commissionCents: number | null;
  }[];
  employees: DashboardEmployee[];
  employeeOptions: { id: string; name: string }[];
  inspectors: string[];
  payPlan: PayPlan;
  missingDates: string[];
  staleDates: string[];
  timingMissingDates: string[];
  syncedAt: string | null;
  error?: string;
};
export type DashboardState = {
  ok?: boolean;
  message?: string;
  data?: DashboardData;
};
