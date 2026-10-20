import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tx } from "../src/modules/phase2";
import type { DashboardQuery, PortalDay } from "../src/modules/station/dashboard-types";

const state = vi.hoisted(() => ({ hash: "", tx: null as unknown }));
vi.mock("../src/modules/phase2", () => ({
  requireRule: (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  },
}));
vi.mock("../src/modules/station/service", () => ({
  stationTransaction: vi.fn(
    async (actorId: string, work: (tx: unknown, hash: string) => unknown) => {
      if (actorId !== "active-owner") throw new Error("Active owner access required");
      return work(state.tx, state.hash);
    },
  ),
}));
import {
  readRetentionDetails,
  retentionInTransaction,
} from "../src/modules/station/vehicle-retention-service";
import { stationTransaction } from "../src/modules/station/service";

const query: DashboardQuery = { start: "2025-12-31", end: "2025-12-31", trendDays: "all" };
const scope = { label: "All inspectors", inspector: null };
const day: PortalDay = {
  date: "2025-12-31",
  retrievedAt: "2026-01-01T00:00:00Z",
  total: 1,
  passed: 1,
  failed: 0,
  aborted: 0,
  other: 0,
  verifiedEmpty: false,
  inspectors: [{ inspector: "A", total: 1, passed: 1, failed: 0, aborted: 0, other: 0 }],
  testTimes: [
    {
      inspector: "A",
      minute: 600,
      vinHash: "unvalidated-cache-hash",
      recordKey: "row-key",
      outcome: "passed",
    },
  ],
};
function evidence(extra = {}) {
  return {
    id: "canonical-record",
    key: "row-key",
    source: "GA_DASHBOARD",
    sourceId: "provider-id",
    date: day.date,
    inspector: "A",
    outcome: "PASS",
    vinHash: "validated-vin-hash",
    plateHash: null,
    invalidVin: false,
    identityStatus: "VALID_VIN",
    suffix: "1234",
    payment: "UNKNOWN",
    retest: "INITIAL",
    completion: "COMPLETED",
    sourceKind: "VIR",
    sourceDate: "12/31/2025 10:00 AM",
    provenance: "history-window:window",
    ...extra,
  };
}
function setup(rows = [evidence()]) {
  const tx = {
    auditLog: {
      aggregate: vi
        .fn()
        .mockResolvedValue({ _count: 1, _max: { createdAt: new Date("2026-01-01") } }),
    },
    $queryRaw: vi.fn().mockResolvedValue(rows),
    inspectionHistoryWindow: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "window",
          jobId: "job",
          reportDigest: "digest",
          startDate: day.date,
          endDate: day.date,
          status: "COMPLETED",
          unresolved: 0,
          rejected: 0,
          identityReview: 0,
          sourceTotal: 1,
        },
      ]),
    },
  };
  state.tx = tx;
  return tx;
}
beforeEach(() => {
  state.hash = `owned-station-${Math.random()}`;
  vi.clearAllMocks();
});

describe("retention server aggregation and protected drilldowns", () => {
  it("supports every trend timeframe and keeps differently scoped cached models separate", async () => {
    const tx = setup([
      evidence({ id: "prior", key: "prior", sourceId: "prior", date: "2025-11-30" }),
      evidence(),
    ]);
    const timeframes = [7, 30, 365, 730, 1095, 1460, 1825, 2190, "all"] as const;
    for (const trendDays of timeframes) {
      const q = { ...query, trendDays };
      const start = trendDays === 7 ? "2025-12-25" : "2025-11-30";
      const report = await retentionInTransaction(tx as unknown as Tx, state.hash, {
        start,
        end: day.date,
        days: [day],
        query: q,
        scope,
      });
      expect(report.start).toBe(start);
      expect(report.qualifyingInspections).toBe(trendDays === 7 ? 1 : 2);
      if (trendDays === 7) {
        expect(report.selectedPeriod.returning).toBe(1);
        expect(report.repeatVehicles).toBe(0);
      }
      const details = await readRetentionDetails("active-owner", q, { metric: "repeat" });
      expect(details?.total).toBe(trendDays === 7 ? 0 : 1);
    }
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it("merges the cache and canonical VIR once, and reuses aggregation without scanning history again", async () => {
    const tx = setup(),
      input = { start: day.date, end: day.date, days: [day], query, scope };
    const report = await retentionInTransaction(tx as unknown as Tx, state.hash, input);
    const repeat = await retentionInTransaction(tx as unknown as Tx, state.hash, input);
    expect(report.coverage).toMatchObject({
      sourceRecords: 1,
      vinMatchedRecords: 1,
      identifierCoverage: 1,
    });
    expect(repeat).toEqual(report);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const detail = await readRetentionDetails("active-owner", query, { metric: "review" });
    expect(detail?.total).toBe(1); // unknown payment remains visible
    expect(detail?.visits[0]).toMatchObject({
      id: "canonical-record",
      payment: "UNKNOWN",
      retest: "INITIAL",
    });
    expect(detail?.visits[0].sourceUrl).toContain("jobId=job&windowId=window");
    expect(JSON.stringify(detail)).not.toContain("validated-vin-hash");
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it("invalidates source results when the append-only audit generation changes", async () => {
    const tx = setup(),
      input = { start: day.date, end: day.date, days: [day], query, scope };
    await retentionInTransaction(tx as unknown as Tx, state.hash, input);
    tx.auditLog.aggregate.mockResolvedValue({
      _count: 2,
      _max: { createdAt: new Date("2026-01-02") },
    });
    expect(await readRetentionDetails("active-owner", query, { metric: "review" })).toBeNull();
    tx.$queryRaw.mockResolvedValue([evidence({ retest: "FREE_RETEST" })]);
    const next = await retentionInTransaction(tx as unknown as Tx, state.hash, input);
    expect(next.qualifyingInspections).toBe(0);
    expect(next.classifications.knownRetestsExcluded).toBe(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it("does not treat an unprocessed Performance hash as a validated VIN or infer paid status", async () => {
    const tx = setup([]);
    const report = await retentionInTransaction(tx as unknown as Tx, state.hash, {
      start: day.date,
      end: day.date,
      days: [day],
      query,
      scope,
    });
    expect(report.identifiableVehicles).toBe(0);
    expect(report.repeatPercentage).toBeNull();
    expect(report.coverage).toMatchObject({
      sourceRecords: 1,
      vinMatchedRecords: 0,
      identifierCoverage: 0,
      reviewableVisits: 1,
    });
    const details = await readRetentionDetails("active-owner", query, { metric: "review" });
    expect(details?.visits[0]).toMatchObject({
      payment: "UNKNOWN",
      retest: "UNKNOWN",
      sourceUrl: null,
      qualifying: false,
    });
    expect(JSON.stringify(details)).not.toContain("unvalidated-cache-hash");
    expect(JSON.stringify(details)).not.toContain("row-key");
  });
  it("keeps owner authorization and station scope around every drilldown", async () => {
    const tx = setup();
    await retentionInTransaction(tx as unknown as Tx, state.hash, {
      start: day.date,
      end: day.date,
      days: [day],
      query,
      scope,
    });
    await expect(
      readRetentionDetails("inactive-or-manager", query, { metric: "repeat" }),
    ).rejects.toThrow("Active owner");
    expect(stationTransaction).toHaveBeenCalledWith("inactive-or-manager", expect.any(Function));
    await expect(
      readRetentionDetails("active-owner", query, {
        metric: "repeat",
        vehicleId: "foreign-station-record",
      }),
    ).rejects.toThrow("this station");
  });
  it("does not fabricate source-report links for records without a retained original", async () => {
    const tx = setup();
    tx.inspectionHistoryWindow.findMany.mockResolvedValue([]);
    await retentionInTransaction(tx as unknown as Tx, state.hash, {
      start: day.date,
      end: day.date,
      days: [day],
      query,
      scope,
    });
    const detail = await readRetentionDetails("active-owner", query, { metric: "review" });
    expect(detail?.visits[0].sourceUrl).toBeNull();
  });
});
