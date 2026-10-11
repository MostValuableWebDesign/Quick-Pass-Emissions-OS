import { Temporal } from "@js-temporal/polyfill";
import { businessDate, addDays } from "@/lib/time";
import { type Tx } from "../phase2";
import {
  stationTransaction,
  currentRecords,
  reportRange,
  correctionBoundaries,
  coverageAfterCorrections,
} from "./service";
import { report as financeReport } from "../finance/service";
import { commissionCents, periodAmounts, sumCents, csvCell } from "../payroll/calculations";
import { audit } from "../phase2";
import { estimateTests, elapsedMinutes, operatingMinutes, type Hours } from "./projections";
import { digest } from "./report";
import { portalTotalSchema } from "./portal-service";
import {
  compareTrends,
  employeePerformance,
  previousRange,
  testBreakdown,
  trendPeriod,
} from "./analytics";

async function payEvidence(
  tx: Tx,
  start: string,
  end: string,
  employeeId?: string,
  attributed: string[] = [],
) {
  const counts = await tx.dailyEmission.findMany({
    where: { date: { gte: start, lte: end }, ...(employeeId ? { employeeId } : {}) },
    orderBy: [{ date: "asc" }, { employeeId: "asc" }],
    include: { employee: { select: { user: { select: { name: true } } } } },
  });
  const policies = await tx.commissionPolicy.findMany({
    where: { effectiveDate: { lte: end }, ...(employeeId ? { employeeId } : {}) },
    orderBy: { effectiveDate: "desc" },
  });
  const daily = counts.map((c) => {
    const p = policies.find((p) => p.employeeId === c.employeeId && p.effectiveDate <= c.date);
    return {
      id: c.id,
      employeeId: c.employeeId,
      employee: c.employee.user.name,
      date: c.date,
      count: c.count,
      approved: !!c.approvedAt,
      policy: p,
      commissionCents: p ? commissionCents(c.count, p.threshold, p.rateCents, p.eligible, p) : null,
      calculationPeriod: "Daily qualifying personal count. Not a weekly threshold.",
      sourceRef: c.sourceRef,
      version: c.version,
    };
  });
  const periods = await tx.payrollPeriod.findMany({
    where: { status: { not: "CANCELLED" }, startDate: { lte: end }, endDate: { gte: start } },
    include: {
      inputs: { include: { employee: { select: { user: { select: { name: true } } } } } },
      drafts: {
        where: { status: { in: ["DRAFT", "APPROVED"] } },
        include: { lines: true },
        orderBy: { revision: "desc" },
      },
    },
  });
  const employees = await tx.employee.findMany({
    where: employeeId
      ? { id: employeeId }
      : {
          OR: [
            { user: { active: true } },
            { emissions: { some: { date: { gte: start, lte: end } } } },
            { id: { in: attributed } },
            {
              payrollInputs: {
                some: { period: { startDate: { lte: end }, endDate: { gte: start } } },
              },
            },
          ],
        },
    select: { id: true, user: { select: { name: true } } },
  });
  const periodRows = [];
  for (const period of periods) {
    const periodCounts = await tx.dailyEmission.findMany({
      where: { date: { gte: period.startDate, lte: period.endDate } },
    });
    const arrangements = await tx.payArrangement.findMany({
      where: { effectiveDate: { lte: period.endDate } },
      orderBy: { effectiveDate: "desc" },
    });
    const periodPolicies = await tx.commissionPolicy.findMany({
      where: { effectiveDate: { lte: period.endDate } },
      orderBy: { effectiveDate: "desc" },
    });
    for (const employee of employees) {
      const arrangement = arrangements.find(
        (a) => a.employeeId === employee.id && a.effectiveDate <= period.startDate,
      );
      const input = period.inputs.find((i) => i.employeeId === employee.id);
      const personal = periodCounts.filter((c) => c.employeeId === employee.id);
      const policyConfigured = periodPolicies.some(
        (p) => p.employeeId === employee.id && p.effectiveDate <= period.startDate,
      );
      const crosses = arrangements.some(
        (a) => a.employeeId === employee.id && a.effectiveDate > period.startDate,
      );
      const missing = [
        ...(!arrangement ? ["Owner-approved pay arrangement"] : []),
        ...(crosses ? ["Period must not cross a pay arrangement change"] : []),
        ...(!input?.approvedAt || !input.emissionsComplete
          ? ["Independently approved worked-time input and count-completeness attestation"]
          : []),
        ...(personal.some((c) => !c.approvedAt) ? ["Independent daily count approval"] : []),
        ...(!policyConfigured ? ["Effective commission eligibility/policy at period start"] : []),
        ...(arrangement && arrangement.kind !== "HOURLY" && input?.minutes !== 0
          ? ["Non-hourly compensation requires explicit zero minutes"]
          : []),
      ];
      const amounts = personal.map((c) => {
        const p = periodPolicies.find(
          (p) => p.employeeId === employee.id && p.effectiveDate <= c.date,
        );
        return p ? commissionCents(c.count, p.threshold, p.rateCents, p.eligible, p) : null;
      });
      if (amounts.some((n) => n === null))
        missing.push("Effective commission policy for every test date");
      const calculated = periodAmounts(
        arrangement && !crosses ? arrangement : null,
        input?.approvedAt && input.emissionsComplete ? input.minutes : null,
        amounts,
        {
          paidDays: input?.paidDays,
          periodDays: Temporal.PlainDate.from(period.startDate).until(period.endDate).days + 1,
        },
      );
      if (calculated.baseCents === null && !missing.length)
        missing.push("Approved paid days or whole weekly period required for configured pay basis");
      const base = calculated.baseCents;
      const commission = calculated.commissionCents;
      const snapshot = period.drafts
        .find((d) => d.status === "APPROVED")
        ?.lines.find((l) => l.employeeId === employee.id);
      periodRows.push({
        periodId: period.id,
        start: period.startDate,
        end: period.endDate,
        employeeId: employee.id,
        employee: employee.user.name,
        arrangement,
        input,
        eligibleCounts: personal
          .filter(
            (c) =>
              periodPolicies.find((p) => p.employeeId === c.employeeId && p.effectiveDate <= c.date)
                ?.eligible,
          )
          .reduce((n, c) => n + c.count, 0),
        baseCents: base,
        commissionCents: commission,
        grossCents: !missing.length ? calculated.totalCents : null,
        status: snapshot
          ? "Approved snapshot"
          : missing.length
            ? "Incomplete"
            : "Provisional calculation — not approved payroll",
        snapshot,
        missing,
        explanation:
          "Base is the entire actual payroll period, rounded half up once. Daily commissions use each effective policy. Never add this period total once per displayed day.",
      });
    }
  }
  return { daily, periods: periodRows, employees, noPeriod: periods.length === 0 };
}
export async function performance(actorId: string, input: unknown, now = new Date()) {
  const query = reportRange(input);
  return stationTransaction(actorId, async (tx, hash) => {
    const all = await currentRecords(tx, hash, query.start, query.end);
    const imports = await tx.stationImport.findMany({
      where: { stationHash: hash },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    const coverage = await tx.stationImport.findMany({
      where: { stationHash: hash, status: "IMPORTED", coverage: "OWNER_ATTESTED" },
      orderBy: { createdAt: "desc" },
    });
    const rules = await tx.stationRule.findMany({
      where: { stationHash: hash },
      orderBy: { effectiveDate: "desc" },
    });
    const mappings = await tx.stationMapping.findMany({
      where: { stationHash: hash },
      orderBy: { effectiveDate: "desc" },
    });
    const settings = await tx.stationSetting.findMany({
      where: { stationHash: hash },
      orderBy: { effectiveDate: "desc" },
    });
    const closures = await tx.closure.findMany();
    const employeeOptions = await tx.employee.findMany({
      select: { id: true, user: { select: { name: true } } },
    });
    const pay = await payEvidence(
      tx,
      query.start,
      query.end,
      query.employeeId,
      all.flatMap((r) => (r.employeeId ? [r.employeeId] : [])),
    );
    const finance = await financeReport(tx, query.start, query.end);
    const pricedAll = all.map((r) => {
      const rule = rules.find(
        (p) => p.outcome === r.source.outcome && p.effectiveDate <= r.source.businessDate,
      );
      const estimatedCents =
        r.state === "CONFIRMED" && r.disposition === "RETAIL" && rule ? rule.priceCents : null;
      return { ...r, rule, estimatedCents };
    });
    const priced = query.employeeId
      ? pricedAll.filter((r) => r.employeeId === query.employeeId)
      : pricedAll;
    const estimated = pricedAll.filter((r) => r.estimatedCents !== null);
    const corrections = await correctionBoundaries(tx, hash);
    const rangeCoverage = (records: typeof all, start: string, end: string) => {
      const result = [];
      for (let date = start; date <= end; date = addDays(date, 1)) {
        const daily = records.filter((r) => r.source.businessDate === date);
        result.push({
          date,
          attested:
            daily.length > 0 &&
            coverage.some(
              (r) =>
                r.startDate <= date &&
                r.endDate >= date &&
                coverageAfterCorrections(r.reviewedAt, date, corrections) &&
                daily.every((v) => v.state === "CONFIRMED" && v.source.observedAt <= r.reviewedAt!),
            ),
          pending: daily.filter((r) => r.state !== "CONFIRMED").length,
        });
      }
      return result;
    };
    const days = rangeCoverage(all, query.start, query.end);
    const priorRange = previousRange(query.start, query.end);
    const priorRecords = priorRange
      ? await currentRecords(tx, hash, priorRange.start, priorRange.end)
      : [];
    const trendInputs = { settings, closures: closures.map((c) => c.date), now };
    const trends = trendPeriod({ ...trendInputs, ...query, records: all, coverage: days });
    const priorTrends = priorRange
      ? trendPeriod({
          ...trendInputs,
          ...priorRange,
          records: priorRecords,
          coverage: rangeCoverage(priorRecords, priorRange.start, priorRange.end),
        })
      : null;
    const latestSettings = settings.find((s) => s.effectiveDate <= businessDate(now));
    const observations = [];
    if (latestSettings) {
      const first = addDays(businessDate(now), -latestSettings.observationDays);
      const history = await currentRecords(tx, hash, first, addDays(businessDate(now), -1));
      for (let date = first; date < businessDate(now); date = addDays(date, 1)) {
        const schedule = settings.find((s) => s.effectiveDate <= date);
        if (!schedule) continue;
        const minutes = operatingMinutes(
          date,
          schedule.hours as Hours,
          closures.map((c) => c.date),
        );
        const daily = history.filter((r) => r.source.businessDate === date);
        if (
          !minutes ||
          !daily.length ||
          !coverage.some(
            (r) =>
              r.startDate <= date &&
              r.endDate >= date &&
              coverageAfterCorrections(r.reviewedAt, date, corrections) &&
              daily.every((v) => v.source.observedAt <= r.reviewedAt!),
          ) ||
          daily.some((r) => r.state !== "CONFIRMED")
        )
          continue;
        observations.push({ date, minutes, tests: daily.length });
      }
    }
    const operating = latestSettings
      ? elapsedMinutes(
          businessDate(now),
          latestSettings.hours as Hours,
          closures.map((c) => c.date),
          now,
        )
      : null;
    // Manual export has no verified query cutoff instant. Current-day completeness cannot be established.
    const projection = estimateTests({
      historicalTests: observations.reduce((n, o) => n + o.tests, 0),
      historicalMinutes: observations.reduce((n, o) => n + o.minutes, 0),
      usableDays: observations.length,
      minimumDays: latestSettings?.minimumDays ?? 1,
      performed: all.filter((r) => r.state === "CONFIRMED").length,
      remainingMinutes: operating?.remaining ?? 0,
      currentCoverage: days.every((d) => d.attested) && query.end < businessDate(now),
      pending: all.filter((r) => r.state !== "CONFIRMED").length,
    });
    // A historical completed range has zero remaining time; do not extend today's time into another scope.
    const safeProjection =
      query.end < businessDate(now) &&
      days.every((d) => d.attested) &&
      all.every((r) => r.state === "CONFIRMED")
        ? { status: "Completed reported range", projected: all.length, additional: 0 }
        : { ...projection, status: "Insufficient data", projected: null, additional: null };
    const reconciliations = await tx.stationReconciliation.findMany({
      where: { stationHash: hash, date: { gte: query.start, lte: query.end } },
      orderBy: { createdAt: "desc" },
    });
    const reconciliationRows = [];
    for (const r of reconciliations) {
      const dailyRecords = await currentRecords(tx, hash, r.date, r.date);
      const evidence = dailyRecords.map((v) => ({
        id: v.id,
        version: v.version,
        revisionId: v.currentRevisionId,
        employeeId: v.employeeId,
        eligible: v.eligible,
      }));
      const count = await tx.dailyEmission.findUnique({ where: { id: r.dailyEmissionId } });
      reconciliationRows.push({
        ...r,
        needsReview:
          digest(JSON.stringify(evidence)) !== r.evidenceHash ||
          !count ||
          count.count !==
            dailyRecords.filter(
              (v) => v.employeeId === r.employeeId && v.eligible && v.state === "CONFIRMED",
            ).length,
        approved: !!count?.approvedAt,
        currentCountVersion: count?.version,
      });
    }
    const groups = new Map<
      string,
      {
        employeeId: string | null;
        label: string;
        confirmed: number;
        pending: number;
        eligible: number;
      }
    >();
    for (const r of all) {
      const key = r.employeeId || `unmapped:${r.source.inspector}`;
      const group = groups.get(key) ?? {
        employeeId: r.employeeId,
        label:
          employeeOptions.find((e) => e.id === r.employeeId)?.user.name ??
          `Unmapped: ${r.source.inspector}`,
        confirmed: 0,
        pending: 0,
        eligible: 0,
      };
      if (r.state === "CONFIRMED") {
        group.confirmed++;
        if (r.eligible) group.eligible++;
      } else group.pending++;
      groups.set(key, group);
    }
    const savedPortal =
      query.start === query.end
        ? await tx.auditLog.findFirst({
            where: {
              action: "STATION_PORTAL_COUNT_RETRIEVED",
              entityId: hash,
              details: { path: ["date"], equals: query.start },
            },
            orderBy: { createdAt: "desc" },
          })
        : null;
    const parsedPortal = portalTotalSchema.safeParse(savedPortal?.details);
    return {
      ...query,
      portalTotal: parsedPortal.success ? parsedPortal.data : null,
      records: priced,
      stationRecorded: all.filter((r) => r.state === "CONFIRMED").length,
      stationPending: all.filter((r) => r.state !== "CONFIRMED").length,
      groups: [...groups.values()],
      breakdown: testBreakdown(all),
      trends,
      priorTrends,
      comparison: compareTrends(trends, priorTrends),
      employeePerformance: employeePerformance({ ...query, records: priced, pay }),
      estimatedRevenueCents: estimated.length
        ? sumCents(estimated.map((r) => r.estimatedCents!))
        : null,
      estimateIncluded: estimated.length,
      excluded: pricedAll.filter((r) => ["EXCLUDED", "DEALER", "FINANCE"].includes(r.disposition))
        .length,
      unresolved: pricedAll.filter(
        (r) =>
          r.disposition === "UNRESOLVED" ||
          r.state !== "CONFIRMED" ||
          (r.disposition === "RETAIL" && !r.rule),
      ).length,
      imports,
      lastSuccessfulImport: await tx.stationImport.findFirst({
        where: { stationHash: hash, status: "IMPORTED" },
        orderBy: { createdAt: "desc" },
      }),
      days,
      rules,
      mappings,
      settings,
      closures,
      pay,
      employeeOptions,
      finance,
      reconciliations: reconciliationRows,
      projection: {
        ...safeProjection,
        observations,
        operating,
        scope: "Station only",
        reason:
          "Manual report timestamps lack a verified current query cutoff. Today/This Week forecasts are insufficient; employee schedules are not approved worked time. No projected revenue/gross pay or profit is asserted.",
      },
      liveAccess:
        "Owner-requested portal export lookup is available for one day. Reviewed history still uses imports; no background sync or guaranteed source cutoff.",
      generatedAt: now,
    };
  });
}
export async function exportPerformance(actorId: string, input: unknown) {
  // Reads and export audit independently recheck the current active owner.
  const p = await performance(actorId, input);
  return stationTransaction(actorId, async (tx) => {
    const rows: (string | number)[][] = [
      [
        "record_id",
        "state",
        "business_date",
        "source_local_time_unverified_timezone",
        "inspector_label",
        "employee_id",
        "vin_last4",
        "result",
        "certificate",
        "eligible",
        "disposition",
        "estimated_cents",
        "revision_id",
        "coverage",
        "start",
        "end",
      ],
      ...p.records.map((r) => [
        r.id,
        r.state,
        r.source.businessDate,
        r.source.sourceDate,
        r.source.inspector,
        r.employeeId ?? "",
        r.source.vehicleSuffix,
        r.source.outcome,
        r.source.certificate,
        r.eligible === null ? "UNRESOLVED" : String(r.eligible),
        r.disposition,
        r.estimatedCents ?? "",
        r.currentRevisionId ?? "",
        "OWNER_REPORT_NOT_LIVE_QUERY",
        p.start,
        p.end,
      ]),
    ];
    await audit(tx, actorId, "STATION_EXPORTED", "station", {
      rows: p.records.length,
      start: p.start,
      end: p.end,
    });
    return "\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  });
}
