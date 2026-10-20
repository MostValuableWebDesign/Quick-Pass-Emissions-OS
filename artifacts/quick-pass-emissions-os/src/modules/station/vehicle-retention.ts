import { Temporal } from "@js-temporal/polyfill";

/** Server-only matching inputs. Never send hashes or original identifiers to the browser. */
export type RetentionVisit = {
  id: string;
  key: string;
  source: string;
  sourceId: string | null;
  date: string;
  minute: number | null;
  inspector: string;
  outcome: string;
  vinHash: string | null;
  plateHash: string | null;
  invalidVin: boolean;
  identityStatus: string;
  suffix: string;
  payment: string;
  retest: string;
  completion: string;
  sourceKind: string;
  sourceUrl: string | null;
};
export type RetentionScope = { id?: string; label: string; inspector: string | null };
export type DatePeriod = { start: string; end: string };
export type RetentionCoverage = {
  start: string;
  end: string;
  totalDates: number;
  loadedDates: number;
  missingPeriods: DatePeriod[];
  incompletePeriods: DatePeriod[];
  unprocessedPeriods: (DatePeriod & { status: string; review: number })[];
  recordsNeedingReview: number;
  unrepresentedRecords: number;
};
export type PeriodRetention = DatePeriod & {
  returning: number;
  firstObserved: number;
  priorNonqualifying: number;
  vehicles: number;
  rate: number | null;
};
export type AnnualRetention = {
  year: number;
  cohort: number;
  returned: number;
  rate: number | null;
  followStart: string;
  followEnd: string | null;
  label: "Full following year" | "Year to date" | "Following year not started";
  partialCoverage: boolean;
};
export const intervalBands = [
  { id: "same-day", label: "Same day", min: 0, max: 0 },
  { id: "1-30", label: "1–30 days", min: 1, max: 30 },
  { id: "31-180", label: "31–180 days", min: 31, max: 180 },
  { id: "181-299", label: "181–299 days", min: 181, max: 299 },
  { id: "300-430", label: "300–430 days · around annual", min: 300, max: 430 },
  { id: "431-730", label: "431–730 days", min: 431, max: 730 },
  { id: "731-plus", label: "More than 730 days", min: 731, max: Infinity },
] as const;
export type VehicleRetentionReport = {
  start: string;
  end: string;
  scope: RetentionScope;
  repeatPercentage: number | null;
  repeatVehicles: number;
  identifiableVehicles: number;
  qualifyingInspections: number;
  repeatInspections: number;
  selectedPeriod: PeriodRetention;
  returningMonth: PeriodRetention;
  returningYear: PeriodRetention;
  annualCohorts: AnnualRetention[];
  medianIntervalDays: number | null;
  intervalCount: number;
  intervals: { id: string; label: string; count: number }[];
  coverage: RetentionCoverage & {
    label: "Partial coverage" | "Loaded periods covered";
    sourceRecords: number;
    vinMatchedRecords: number;
    identifierCoverage: number | null;
    plateFallbackRecords: number;
    plateFallbackVehicles: number;
    ambiguousRecords: number;
    unmatchedRecords: number;
    duplicateRecordsExcluded: number;
    reviewableVisits: number;
  };
  classifications: {
    unknownRetestIncluded: number;
    unknownPayment: number;
    knownRetestsExcluded: number;
    incompleteInspectionsExcluded: number;
  };
};
export type RetentionDetailRequest = {
  metric: "repeat" | "selected" | "month" | "year" | "cohort" | "intervals" | "review" | "plate";
  year?: number;
  band?: string;
  vehicleId?: string;
  page?: number;
};
export type RetentionVehicleView = {
  id: string;
  label: string;
  matchType: "VIN" | "Plate/state fallback";
  firstObserved: string;
  lastObserved: string;
  qualifyingVisits: number;
  returned?: boolean;
};
export type RetentionVisitView = {
  id: string;
  date: string;
  time: string | null;
  inspector: string;
  outcome: string;
  payment: string;
  retest: string;
  completion: string;
  sourceKind: string;
  sourceUrl: string | null;
  qualifying: boolean;
  intervalDays?: number;
  previousDate?: string;
};
export type RetentionDetails = {
  kind: "vehicles" | "visits";
  page: number;
  pages: number;
  total: number;
  vehicles: RetentionVehicleView[];
  visits: RetentionVisitView[];
};

export function isQualifyingVisit(v: RetentionVisit) {
  // A close interval is NOT source evidence of a retest. Unknown retest status is
  // included provisionally and disclosed; payment is deliberately not a qualifier.
  return v.completion === "COMPLETED" && !["FREE_RETEST", "PAID_RETEST"].includes(v.retest);
}
function validVin(v: RetentionVisit) {
  return !!v.vinHash && !v.invalidVin && v.identityStatus === "VALID_VIN";
}
function ordered(a: RetentionVisit, b: RetentionVisit) {
  return (
    a.date.localeCompare(b.date) || (a.minute ?? -1) - (b.minute ?? -1) || a.id.localeCompare(b.id)
  );
}
export function prepareRetentionVisits(input: RetentionVisit[]) {
  const keys = new Set<string>(),
    ids = new Set<string>(),
    sourceIds = new Set<string>();
  const visits: RetentionVisit[] = [];
  for (const v of [...input].sort(
    (a, b) => Number(b.sourceKind === "VIR") - Number(a.sourceKind === "VIR") || ordered(a, b),
  )) {
    const sourceId = v.sourceId ? `${v.source}:${v.sourceId}` : null;
    if (keys.has(v.key) || ids.has(v.id) || (sourceId && sourceIds.has(sourceId))) continue;
    keys.add(v.key);
    ids.add(v.id);
    if (sourceId) sourceIds.add(sourceId);
    visits.push(v);
  }
  return { visits: visits.sort(ordered), duplicates: input.length - visits.length };
}
export function datePeriods(dates: string[]): DatePeriod[] {
  const result: DatePeriod[] = [];
  for (const date of [...new Set(dates)].sort()) {
    const prior = result.at(-1);
    if (prior && Temporal.PlainDate.from(prior.end).add({ days: 1 }).toString() === date)
      prior.end = date;
    else result.push({ start: date, end: date });
  }
  return result;
}
export function createRetentionModel(
  input: RetentionVisit[],
  coverage: RetentionCoverage,
  scope: RetentionScope,
  selected: DatePeriod,
) {
  const prepared = prepareRetentionVisits(input);
  const visits = prepared.visits.filter((v) => v.date <= coverage.end);
  const inWindow = (v: RetentionVisit) => v.date >= coverage.start && v.date <= coverage.end;
  const inspectorMatches = (v: RetentionVisit) =>
    !scope.id || (scope.inspector !== null && v.inspector === scope.inspector);
  const focused = (v: RetentionVisit) => inWindow(v) && inspectorMatches(v);
  const focusedVisits = visits.filter(focused);
  const bindings = new Map<string, Set<string>>();
  for (const v of visits)
    if (v.plateHash && (v.vinHash || v.invalidVin)) {
      const values = bindings.get(v.plateHash) ?? new Set<string>();
      values.add(validVin(v) ? v.vinHash! : "INVALID");
      bindings.set(v.plateHash, values);
    }
  const fallback = (v: RetentionVisit) =>
    !v.vinHash &&
    !v.invalidVin &&
    !!v.plateHash &&
    v.identityStatus === "PLATE_STATE" &&
    (bindings.get(v.plateHash)?.size ?? 0) <= 1 &&
    !bindings.get(v.plateHash)?.has("INVALID");
  const allByVin = new Map<string, RetentionVisit[]>();
  const byVin = new Map<string, RetentionVisit[]>();
  const byPlate = new Map<string, RetentionVisit[]>();
  for (const v of visits) {
    if (validVin(v)) {
      allByVin.set(v.vinHash!, [...(allByVin.get(v.vinHash!) ?? []), v]);
      if (isQualifyingVisit(v)) byVin.set(v.vinHash!, [...(byVin.get(v.vinHash!) ?? []), v]);
    } else if (fallback(v)) byPlate.set(v.plateHash!, [...(byPlate.get(v.plateHash!) ?? []), v]);
  }
  const focusedVins = new Set(focusedVisits.filter(validVin).map((v) => v.vinHash!));
  const repeat = new Set(
    [...focusedVins].filter((vin) => (byVin.get(vin)?.filter(inWindow).length ?? 0) >= 2),
  );
  const period = (range: DatePeriod) => {
    const current = new Set<string>(),
      returned = new Set<string>();
    for (const [vin, rows] of byVin)
      if (rows.some((v) => focused(v) && v.date >= range.start && v.date <= range.end)) {
        current.add(vin);
        if (rows[0].date < range.start) returned.add(vin);
      }
    const firstObserved = [...current].filter(
      (vin) => allByVin.get(vin)![0].date >= range.start,
    ).length;
    return {
      current,
      returned,
      report: {
        ...range,
        returning: returned.size,
        firstObserved,
        priorNonqualifying: current.size - returned.size - firstObserved,
        vehicles: current.size,
        rate: current.size ? returned.size / current.size : null,
      } satisfies PeriodRetention,
    };
  };
  const anchor = Temporal.PlainDate.from(coverage.end);
  const monthStart = anchor.with({ day: 1 }).toString();
  const yearStart = `${anchor.year}-01-01`;
  const month = period({
    start: monthStart < coverage.start ? coverage.start : monthStart,
    end: coverage.end,
  });
  const year = period({
    start: yearStart < coverage.start ? coverage.start : yearStart,
    end: coverage.end,
  });
  const selectedPeriod = period(selected);
  const partial = !!(
    coverage.missingPeriods.length ||
    coverage.incompletePeriods.length ||
    coverage.unprocessedPeriods.length ||
    coverage.recordsNeedingReview ||
    coverage.unrepresentedRecords
  );
  const cohorts = new Map<
    number,
    { base: Set<string>; returned: Set<string>; report: AnnualRetention }
  >();
  for (let y = Number(coverage.start.slice(0, 4)); y <= anchor.year; y++) {
    const base = new Set<string>(),
      returned = new Set<string>();
    const nextStart = `${y + 1}-01-01`,
      nextEnd = `${y + 1}-12-31`;
    const followEnd =
      nextStart > coverage.end ? null : nextEnd > coverage.end ? coverage.end : nextEnd;
    for (const [vin, rows] of byVin)
      if (rows.some((v) => focused(v) && v.date.startsWith(`${y}-`))) {
        base.add(vin);
        if (followEnd && rows.some((v) => v.date >= nextStart && v.date <= followEnd))
          returned.add(vin);
      }
    cohorts.set(y, {
      base,
      returned,
      report: {
        year: y,
        cohort: base.size,
        returned: returned.size,
        rate: base.size && followEnd ? returned.size / base.size : null,
        followStart: nextStart,
        followEnd,
        label: !followEnd
          ? "Following year not started"
          : followEnd < nextEnd
            ? "Year to date"
            : "Full following year",
        partialCoverage:
          `${y}-01-01` < coverage.start ||
          [
            ...coverage.missingPeriods,
            ...coverage.incompletePeriods,
            ...coverage.unprocessedPeriods,
          ].some((p) => p.end >= `${y}-01-01` && p.start <= (followEnd ?? `${y}-12-31`)),
      },
    });
  }
  const gaps: { visit: RetentionVisit; previousDate: string; days: number }[] = [];
  for (const rows of byVin.values())
    for (let i = 1; i < rows.length; i++)
      if (focused(rows[i]) && inWindow(rows[i - 1]))
        gaps.push({
          visit: rows[i],
          previousDate: rows[i - 1].date,
          days: Temporal.PlainDate.from(rows[i - 1].date).until(rows[i].date).days,
        });
  const sorted = gaps.map((g) => g.days).sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  const qualifying = focusedVisits.filter(isQualifyingVisit);
  const vinMatchedRecords = focusedVisits.filter(validVin).length;
  const plateRecords = focusedVisits.filter(fallback);
  const ambiguous = focusedVisits.filter(
    (v) =>
      !validVin(v) &&
      !fallback(v) &&
      (v.invalidVin || !!v.plateHash || v.identityStatus === "NEEDS_REVIEW"),
  );
  const report: VehicleRetentionReport = {
    start: coverage.start,
    end: coverage.end,
    scope,
    repeatPercentage: focusedVins.size ? repeat.size / focusedVins.size : null,
    repeatVehicles: repeat.size,
    identifiableVehicles: focusedVins.size,
    qualifyingInspections: qualifying.filter(validVin).length,
    repeatInspections: gaps.length,
    selectedPeriod: selectedPeriod.report,
    returningMonth: month.report,
    returningYear: year.report,
    annualCohorts: [...cohorts.values()].map((c) => c.report),
    medianIntervalDays: sorted.length
      ? sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2
      : null,
    intervalCount: sorted.length,
    intervals: intervalBands.map((b) => ({
      id: b.id,
      label: b.label,
      count: gaps.filter((g) => g.days >= b.min && g.days <= b.max).length,
    })),
    coverage: {
      ...coverage,
      label: partial ? "Partial coverage" : "Loaded periods covered",
      sourceRecords: focusedVisits.length + coverage.unrepresentedRecords,
      vinMatchedRecords,
      identifierCoverage:
        focusedVisits.length + coverage.unrepresentedRecords
          ? vinMatchedRecords / (focusedVisits.length + coverage.unrepresentedRecords)
          : null,
      plateFallbackRecords: plateRecords.length,
      plateFallbackVehicles: new Set(plateRecords.map((v) => v.plateHash)).size,
      ambiguousRecords: ambiguous.length,
      unmatchedRecords:
        focusedVisits.length -
        vinMatchedRecords -
        plateRecords.length -
        ambiguous.length +
        coverage.unrepresentedRecords,
      duplicateRecordsExcluded: prepared.duplicates,
      reviewableVisits: focusedVisits.filter(
        (v) =>
          !validVin(v) ||
          v.retest === "UNKNOWN" ||
          v.payment === "UNKNOWN" ||
          !isQualifyingVisit(v),
      ).length,
    },
    classifications: {
      unknownRetestIncluded: qualifying.filter((v) => validVin(v) && v.retest === "UNKNOWN").length,
      unknownPayment: focusedVisits.filter((v) => v.payment === "UNKNOWN").length,
      knownRetestsExcluded: focusedVisits.filter((v) =>
        ["FREE_RETEST", "PAID_RETEST"].includes(v.retest),
      ).length,
      incompleteInspectionsExcluded: focusedVisits.filter((v) => v.completion !== "COMPLETED")
        .length,
    },
  };
  return {
    report,
    visits,
    byVin,
    allByVin,
    byPlate,
    focused,
    repeat,
    month,
    year,
    selectedPeriod,
    cohorts,
    gaps,
    fallback,
  };
}
export type RetentionModel = ReturnType<typeof createRetentionModel>;

export function retentionDetails(
  model: RetentionModel,
  request: RetentionDetailRequest,
): RetentionDetails {
  const page = Math.max(1, request.page ?? 1),
    size = 15;
  const visitView = (v: RetentionVisit): RetentionVisitView => ({
    id: v.id,
    date: v.date,
    time:
      v.minute === null
        ? null
        : `${String(Math.floor(v.minute / 60)).padStart(2, "0")}:${String(v.minute % 60).padStart(2, "0")}`,
    inspector: v.inspector,
    outcome: v.outcome,
    payment: v.payment,
    retest: v.retest,
    completion: v.completion,
    sourceKind: v.sourceKind,
    sourceUrl: v.sourceUrl,
    qualifying: validVin(v) && isQualifyingVisit(v),
  });
  let vehicles: RetentionVehicleView[] = [],
    visits: RetentionVisitView[] = [];
  if (request.vehicleId) {
    const seed = model.visits.find((v) => v.id === request.vehicleId);
    const rows =
      seed && validVin(seed)
        ? model.allByVin.get(seed.vinHash!)
        : seed && model.fallback(seed)
          ? model.byPlate.get(seed.plateHash!)
          : undefined;
    visits = (rows ?? []).map(visitView);
  } else if (request.metric === "intervals") {
    const band = intervalBands.find((b) => b.id === request.band);
    visits = model.gaps
      .filter((g) => !band || (g.days >= band.min && g.days <= band.max))
      .map((g) => ({ ...visitView(g.visit), intervalDays: g.days, previousDate: g.previousDate }));
  } else if (request.metric === "review") {
    visits = model.visits
      .filter(
        (v) =>
          model.focused(v) &&
          (!validVin(v) ||
            v.retest === "UNKNOWN" ||
            v.payment === "UNKNOWN" ||
            !isQualifyingVisit(v)),
      )
      .map(visitView);
  } else {
    const cohort = request.metric === "cohort" ? model.cohorts.get(request.year ?? -1) : undefined;
    const keys =
      request.metric === "month"
        ? model.month.returned
        : request.metric === "year"
          ? model.year.returned
          : request.metric === "selected"
            ? model.selectedPeriod.returned
            : cohort
              ? cohort.base
              : model.repeat;
    const groups =
      request.metric === "plate"
        ? [...model.byPlate.entries()]
        : [...keys].map((k) => [k, model.allByVin.get(k) ?? []] as const);
    vehicles = groups
      .filter(
        ([, rows]) => rows.length > 0 && (request.metric !== "plate" || rows.some(model.focused)),
      )
      .map(([key, rows]) => ({
        id: rows[0].id,
        label:
          rows[0].suffix && /^[A-Z0-9]{4}$/i.test(rows[0].suffix)
            ? `Vehicle ••••${rows[0].suffix}`
            : request.metric === "plate"
              ? "Plate/state-only vehicle"
              : "VIN-matched vehicle",
        matchType:
          request.metric === "plate" ? ("Plate/state fallback" as const) : ("VIN" as const),
        firstObserved: rows[0].date,
        lastObserved: rows.at(-1)!.date,
        qualifyingVisits: rows.filter(
          (v) => isQualifyingVisit(v) && v.date >= model.report.start && v.date <= model.report.end,
        ).length,
        ...(cohort ? { returned: cohort.returned.has(key) } : {}),
      }))
      .sort((a, b) => b.lastObserved.localeCompare(a.lastObserved) || a.id.localeCompare(b.id));
  }
  const kind =
    request.vehicleId || ["intervals", "review"].includes(request.metric) ? "visits" : "vehicles";
  const total = kind === "visits" ? visits.length : vehicles.length,
    pages = Math.max(1, Math.ceil(total / size));
  const actualPage = Math.min(page, pages),
    offset = (actualPage - 1) * size;
  return {
    kind,
    page: actualPage,
    pages,
    total,
    vehicles: vehicles.slice(offset, offset + size),
    visits: visits.slice(offset, offset + size),
  };
}
