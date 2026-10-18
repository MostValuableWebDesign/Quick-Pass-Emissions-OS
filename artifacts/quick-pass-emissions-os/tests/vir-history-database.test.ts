import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { businessDate } from "../src/lib/time";
import { digest } from "../src/modules/station/report";
import type { RawInspection } from "../src/modules/station/history/rules";
const provider = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../src/modules/station/portal-client", async (original) => ({
  ...(await original<typeof import("../src/modules/station/portal-client")>()),
  portalHistoryExport: provider.fetch,
}));
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Isolated test database required");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
const today = businessDate(),
  month = Temporal.PlainDate.from(today).with({ day: 1 }).toString();
const older = Temporal.PlainDate.from(month).subtract({ months: 18 }).toString();
const hash = digest("VIR_FIXTURE"),
  vin = "1HGCM82633A004352",
  otherVin = "1M8GDM9AXKP042788";
const raw = (id: string, date: string, fields: Record<string, string> = {}): RawInspection => ({
  fields: {
    "Cert Number": id,
    "Inspection ID": id,
    "Test Date": `${date}T10:00:00`,
    VIN: vin,
    "License Plate": "AAA123",
    "Plate State": "GA",
    Result: "Pass",
    "Payment Status": "PAID",
    "Retest Status": "INITIAL",
    ...fields,
  },
});
(enabled ? describe : describe.skip)("authenticated VIR history persistence", () => {
  let db: typeof import("../src/lib/db").db,
    service: typeof import("../src/modules/station/history/service");
  let returning: typeof import("../src/modules/station/history/report").readReturningVehicles,
    owner: string;
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    service = await import("../src/modules/station/history/service");
    returning = (await import("../src/modules/station/history/report")).readReturningVehicles;
  });
  beforeEach(async () => {
    process.env.GA_STATION_ID = "VIR_FIXTURE";
    process.env.GA_DASHBOARD_USERNAME = "fixture";
    process.env.GA_DASHBOARD_PASSWORD = "fixture";
    process.env.BETTER_AUTH_SECRET = "vir-fixture-only-secret-12345678901234567890";
    await db.$executeRawUnsafe(
      'TRUNCATE "InspectionHistoryJob", "StationRecord", "StationImport", "StationVehiclePlate", "StationTestExportState", "AnalyticsStation", "User" CASCADE',
    );
    owner = (
      await db.user.create({
        data: { email: `${randomUUID()}@example.test`, name: "Fixture owner", role: "OWNER" },
      })
    ).id;
    provider.fetch.mockReset();
  });
  const create = (start = month, end = today) =>
    service.createHistory(owner, {
      start,
      end,
      stations: [hash],
      mode: "PORTAL",
      recordLimit: 25,
      timezoneConfirmed: true,
    });
  const report = () => returning(owner, { start: month, end: today, stations: [hash] });
  async function capture(
    rows: RawInspection[],
    start = month,
    end = today,
    original = JSON.stringify(rows),
  ) {
    const token = randomUUID();
    await db.stationTestExportState.upsert({
      where: { stationHash: hash },
      create: {
        stationHash: hash,
        activeToken: token,
        activeUntil: new Date(Date.now() + 120000),
        cooldownUntil: new Date(0),
      },
      update: { activeToken: token, activeUntil: new Date(Date.now() + 120000) },
    });
    await service.captureRefreshHistory(
      owner,
      { hash, station: "VIR_FIXTURE", token, signal: AbortSignal.timeout(45000) },
      start,
      end,
      { rows, original, sourceTotal: rows.length },
    );
    await db.stationTestExportState.update({
      where: { stationHash: hash },
      data: { activeUntil: null, activeToken: null },
    });
  }
  it("persists old and current VIR sources and matches a prior visit before the period", async () => {
    await capture([raw("old", older)], older, older);
    await capture([raw("new", month)]);
    expect(await report()).toMatchObject({
      returning: 1,
      firstObserved: 0,
      rate: 1,
      historyStart: older,
      historyEnd: month,
    });
    expect(await db.stationRecord.count({ where: { historicalOnly: true } })).toBe(2);
    const window = await db.inspectionHistoryWindow.findFirstOrThrow();
    expect(window.reportPayload).not.toContain(vin);
    const { unseal } = await import("../src/modules/station/history/crypto");
    expect(unseal<{ body: string }>(window.reportPayload!, `report:${window.id}`).body).toContain(
      vin,
    );
    expect((await service.listHistory(owner)).windows[0]).not.toHaveProperty("reportPayload");
  });
  it("bounds incremental extraction, resumes after reload, and is idempotent across duplicate refreshes", async () => {
    const rows = Array.from({ length: 105 }, (_, i) => raw(`id-${i}`, month));
    await capture(rows);
    let view = await service.listHistory(owner);
    expect(view.windows[0]).toMatchObject({
      cursor: 100,
      fetched: 105,
      retrievalComplete: true,
      status: "PENDING",
    });
    const job = view.selected!.id;
    await service.controlHistory(owner, job, "PAUSE");
    expect((await service.drainRefreshHistory(owner)).state).toBe("STOPPED");
    await capture(rows); // A normal refresh cannot silently undo the owner's pause.
    expect(await db.stationRecord.count()).toBe(100);
    await service.controlHistory(owner, job, "START");
    await Promise.all([service.drainRefreshHistory(owner), service.drainRefreshHistory(owner)]);
    await capture(rows);
    expect(await db.stationRecord.count()).toBe(105);
    expect(await db.inspectionHistoryJob.count()).toBe(1);
    view = await service.listHistory(owner, job);
    expect(view.windows[0]).toMatchObject({ cursor: 105, status: "COMPLETED" });
  });
  it("prevents overlapping historical jobs and rejects revoked actor access during incremental capture", async () => {
    await create();
    await expect(create()).rejects.toThrow(/overlapping/);
    await db.user.update({ where: { id: owner }, data: { active: false } });
    await expect(capture([raw("x", month)])).rejects.toThrow(/owner/);
    expect(await db.stationRecord.count()).toBe(0);
  });
  it("uses all-page structured retrieval, then processes saved rows without re-fetching", async () => {
    const job = await create();
    const rows = Array.from({ length: 26 }, (_, i) => raw(`id-${i}`, month));
    provider.fetch.mockResolvedValue({
      rows,
      sourceTotal: 26,
      original: "Original provider fixture with 26 VIR rows across 3 pages",
    });
    await service.controlHistory(owner, job, "START");
    await service.nextHistoryBatch(owner, job);
    await service.nextHistoryBatch(owner, job);
    expect((await service.listHistory(owner, job)).windows[0].cursor).toBe(25);
    await service.controlHistory(owner, job, "PAUSE");
    await service.controlHistory(owner, job, "START");
    await service.nextHistoryBatch(owner, job);
    expect(provider.fetch).toHaveBeenCalledTimes(1);
    expect((await service.listHistory(owner, job)).windows[0]).toMatchObject({
      status: "COMPLETED",
      retrievalComplete: true,
      cursor: 26,
    });
  });
  it("does not trust uploaded legacy data as VIR-derived history", async () => {
    const job = await service.createHistory(owner, {
      start: month,
      end: today,
      stations: [hash],
      mode: "FILE",
      timezoneConfirmed: true,
    });
    const w = (await service.listHistory(owner, job)).windows[0];
    await service.uploadHistory(owner, {
      jobId: job,
      windowId: w.id,
      body: `Inspection ID,VIN,Test Date,Result,Payment Status,Retest Status\nx,${vin},${month}T10:00:00,Pass,PAID,INITIAL`,
      format: "CSV",
      total: 1,
      reference: "Legacy fixture",
    });
    await service.controlHistory(owner, job, "START");
    await service.nextHistoryBatch(owner, job);
    expect(await db.stationRecord.count()).toBe(1);
    expect(await report()).toMatchObject({
      identifiableVehicles: 0,
      rate: null,
      historyStart: null,
    });
  });
  it("quarantines OCR uncertainty and conflicting VINs without plate-only or missing-state guessing", async () => {
    await capture([raw("old", older)], older, older);
    await capture([
      raw("a", month, { "License Plate": "CHANGED" }),
      raw("b", month, { VIN: otherVin }),
      raw("plate", month, { VIN: "" }),
      raw("no-state", month, { VIN: "", "Plate State": "" }),
      { ...raw("ocr", month), extraction: { method: "OCR", confidence: "UNCERTAIN" } },
    ]);
    expect(await report()).toMatchObject({
      returning: 1,
      firstObserved: 1,
      unmatchedRecords: 3,
      rate: 0.5,
    });
    const evidence = await db.stationInspectionEvidence.findFirstOrThrow({
      where: { sourceId: "ocr" },
    });
    expect(evidence).toMatchObject({
      vinHash: null,
      plateHash: null,
      identityStatus: "NEEDS_REVIEW",
      extractionMethod: "OCR",
    });
    expect((await service.listHistory(owner)).windows[0]).toMatchObject({
      retrievalComplete: true,
      status: "PARTIAL",
      identityReview: 2,
    });
  });
  it("separates unknown payment, excludes every known retest, and exposes missing months", async () => {
    const businessCounts = () =>
      Promise.all([
        db.financeEntry.count(),
        db.certificateMovement.count(),
        db.dailyEmission.count(),
        db.automationJob.count(),
      ]);
    const before = await businessCounts();
    await capture([raw("old", older)], older, older);
    await capture([
      raw("free", month, { "Retest Status": "FREE_RETEST" }),
      raw("paid-retest", month, { "Retest Status": "PAID_RETEST" }),
      raw("unknown", month, { "Payment Status": "", "Retest Status": "" }),
    ]);
    const r = await report();
    expect(r).toMatchObject({
      returning: 0,
      rate: null,
      excludedRecords: 2,
      unknownStatusRecords: 1,
    });
    expect(r.coverage.missingMonths).toBeGreaterThan(20);
    expect(r.coverage.label).toContain("partial coverage");
    expect(await businessCounts()).toEqual(before);
  });
  it("automatically splits oversized retrieval windows without claiming missing rows are zero", async () => {
    const job = await create();
    provider.fetch.mockRejectedValue(new Error("Station report exceeds the safe 2 MB limit"));
    await service.controlHistory(owner, job, "START");
    await service.nextHistoryBatch(owner, job);
    const view = await service.listHistory(owner, job);
    expect(view.selected!.status).toBe("RUNNING");
    expect(view.windows).toHaveLength(2);
    expect(view.windows.every((w) => w.sourceTotal === null && !w.retrievalComplete)).toBe(true);
    expect(view.windows[0].startDate).toBe(month);
    expect(view.windows[1].endDate).toBe(today);
    expect(Temporal.PlainDate.from(view.windows[0].endDate).add({ days: 1 }).toString()).toBe(
      view.windows[1].startDate,
    );
  });
  it("retains older than two-year VIR history and protects original source reads with fresh permissions", async () => {
    const date = Temporal.PlainDate.from(month).subtract({ months: 36 }).toString();
    await capture([raw("older", date)], date, date);
    const view = await service.listHistory(owner);
    const body = await service.historySourceReport(owner, view.selected!.id, view.windows[0].id);
    expect(body).toContain(vin);
    expect((await report()).historyStart).toBe(date);
    expect(
      (await returning(owner, { start: date, end: date, stations: [hash] })).identifiableVehicles,
    ).toBe(1);
    await db.user.update({ where: { id: owner }, data: { role: "ADMIN" } });
    await expect(
      service.historySourceReport(owner, view.selected!.id, view.windows[0].id),
    ).rejects.toThrow(/owner/);
  });
});
