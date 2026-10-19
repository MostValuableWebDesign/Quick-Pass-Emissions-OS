export type Counts = {
  total: number;
  passed: number;
  failed: number;
  aborted: number;
  other: number;
  /** Derived only: preserve work evidence even when every inspection was free. */
  rawTotal?: number;
  freeRetests?: number;
};
export type PortalDay = Counts & {
  date: string;
  retrievedAt: string;
  inspectors: (Counts & { inspector: string })[];
  /** An explicit provider empty response, not an absence inferred from an import. */
  verifiedEmpty: boolean;
  /** Rows counted against the portal total but not usable as verified test identities. */
  incompleteRows?: { total: number; vehicle: number; inspector: number; outcome: number };
  /** Derived on read, never trusted from persisted aggregate snapshots. */
  retestComplete?: boolean;
  /** Source-local minute precision; absent in legacy count-only caches. */
  testTimes?: {
    inspector: string;
    minute: number | null;
    vinHash?: string;
    recordKey?: string;
    outcome?: "passed" | "failed" | "aborted" | "other";
  }[];
  /** Derived on read: all physical inspections, including free retests, for pace only. */
  paceTestTimes?: PortalDay["testTimes"];
};
export type InspectionCadence = {
  medianMinutes: number | null;
  includedGaps: number;
  excludedLongGaps: number;
  excludedOvernightGaps: number;
  coveredDays: number;
  timedTests: number;
};
export type PaceSettings = { revision: number; longGapMinutes: number | null };
import type { SourceRefreshStatus } from "@/lib/source-refresh";

export type DashboardQuery = {
  start: string;
  end: string;
  trendDays: 7 | 30 | 365 | 730 | "since2023";
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
  commissionDays?: {
    date: string;
    cents: number | null;
    working: boolean;
    workKnown: boolean;
  }[];
  payCents: number | null;
  approximate: boolean;
  inspectionCadence: InspectionCadence;
};
export type BusyHours = {
  hours: { hour: number; count: number | null }[];
  observedTests: number;
  untimedTests: number;
  timedDays: number;
  expectedDays: number;
  complete: boolean;
  linked: boolean;
  peakHours: number[];
  peakCount: number | null;
};
export type CommissionProgress = {
  threshold: number;
  rateCents: number;
  days: {
    date: string;
    stationCars: number | null;
    commissionTests: number | null;
    perEmployeeCents: number | null;
    selectedCommissionCents: number | null;
  }[];
};
export type DashboardData = {
  query: DashboardQuery;
  today: string;
  current: (Counts & { date: string; retrievedAt: string }) | null;
  summary: {
    inspectionCadence: InspectionCadence;
    reportedTests: number | null;
    cars: number | null;
    freeRetests: number;
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
  busyHours: BusyHours;
  commissionProgress: CommissionProgress;
  employees: DashboardEmployee[];
  employeeOptions: { id: string; name: string }[];
  inspectors: string[];
  payPlan: PayPlan;
  paceSettings: PaceSettings;
  missingDates: string[];
  staleDates: string[];
  timingMissingDates: string[];
  retestMissingDates: string[];
  syncedAt: string | null;
  sourceStatus?: SourceRefreshStatus;
  backfill?: {
    totalDates: number;
    pendingDates: number;
    incompleteDates: number;
    retryAfterMs: number;
    interrupted?: boolean;
  };
  knownIncompleteDates?: string[];
  reportIssues?: {
    date: string;
    sourceRows: number;
    rows: number;
    vehicle: number;
    inspector: number;
    outcome: number;
  }[];
  error?: string;
  returningVehicles?: import("./history/report").ReturningVehicleReport;
};
export type DashboardState = {
  ok?: boolean;
  message?: string;
  data?: DashboardData;
};
