import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { businessDate } from "../src/lib/time";
import { digest } from "../src/modules/station/report";
import { BusinessError } from "../src/modules/phase2";
const portal = vi.hoisted(() => ({ export: vi.fn() }));
vi.mock("../src/modules/station/portal-client", async (original) => ({
  ...(await original<typeof import("../src/modules/station/portal-client")>()),
  portalHistoryExport: portal.export,
}));
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Requires an isolated _test database.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
const station = "HISTORY_FIXTURE",
  hash = digest(station),
  other = digest("HISTORY_OTHER");
const today = businessDate(),
  start = Temporal.PlainDate.from(today).with({ day: 1 }).toString();
const earlier = Temporal.PlainDate.from(start).subtract({ months: 1 }).toString();
const priorEnd = Temporal.PlainDate.from(start).subtract({ days: 1 }).toString();
const vinA = "1HGCM82633A004352",
  vinB = "1M8GDM9AXKP042788";
const header = [
  "Inspection ID",
  "VIN",
  "License Plate",
  "Plate State",
  "Test Date",
  "Issued By",
  "Cert Number",
  "Result",
  "Payment Status",
  "Retest Status",
  "Status",
  "Extra source field",
];
type Fixture = Partial<Record<(typeof header)[number], string>>;
const line = (values: string[]) => values.map((v) => `"${v.replaceAll('"', '""')}"`).join(",");
const csv = (rows: Fixture[]) =>
  [line(header), ...rows.map((r) => line(header.map((h) => r[h] || "")))].join("\n");
const row = (key: string, date: string, overrides: Fixture = {}): Fixture => ({
  "Inspection ID": key,
  VIN: vinA,
  "License Plate": "ABC123",
  "Plate State": "GA",
  "Test Date": `${date}T10:00:00`,
  "Issued By": "Fixture Inspector",
  "Cert Number": key,
  Result: "Pass",
  "Payment Status": "PAID",
  "Retest Status": "INITIAL",
  Status: "COMPLETED",
  "Extra source field": "Preserve this source evidence",
  ...overrides,
});

(enabled ? describe : describe.skip)("historical imports on isolated PostgreSQL", () => {
  let db: typeof import("../src/lib/db").db;
  let service: typeof import("../src/modules/station/history/service");
  let reports: typeof import("../src/modules/station/history/report");
  let owner: string, manager: string, inactive: string;
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    service = await import("../src/modules/station/history/service");
    reports = await import("../src/modules/station/history/report");
  });
  beforeEach(async () => {
    process.env.GA_STATION_ID = station;
    process.env.GA_DASHBOARD_USERNAME = "fixture";
    process.env.GA_DASHBOARD_PASSWORD = "fixture";
    process.env.BETTER_AUTH_SECRET = "history-fixture-only-not-a-real-secret-123456789";
    await db.$executeRawUnsafe(
      'TRUNCATE "InspectionHistoryJob", "StationRecord", "StationImport", "StationVehiclePlate", "StationTestExportState", "AnalyticsStation", "User" CASCADE',
    );
    owner = (
      await db.user.create({
        data: { email: `${randomUUID()}@example.test`, name: "Fixture owner", role: "OWNER" },
      })
    ).id;
    manager = (
      await db.user.create({
        data: { email: `${randomUUID()}@example.test`, name: "Fixture manager", role: "ADMIN" },
      })
    ).id;
    inactive = (
      await db.user.create({
        data: {
          email: `${randomUUID()}@example.test`,
          name: "Inactive fixture",
          role: "OWNER",
          active: false,
        },
      })
    ).id;
    await db.analyticsStation.create({
      data: { name: "Other fixture station", stationHash: other, createdBy: owner },
    });
    portal.export.mockReset();
  });
  async function create(stations = [hash], mode = "FILE", from = earlier, end = today) {
    return service.createHistory(owner, {
      start: from,
      end,
      stations,
      mode,
      source: "GA_DASHBOARD",
      recordLimit: 25,
      timezoneConfirmed: true,
    });
  }
  async function upload(
    jobId: string,
    date: string,
    rows: Fixture[],
    stationHash = hash,
    total: number | null = rows.length,
  ) {
    const window = (await service.listHistory(owner, jobId)).windows.find(
      (w) => w.stationHash === stationHash && w.startDate <= date && w.endDate >= date,
    )!;
    await service.uploadHistory(owner, {
      jobId,
      windowId: window.id,
      body: csv(rows),
      format: "CSV",
      total,
      reference: "Fixture report total",
    });
    return window.id;
  }
  async function drain(jobId: string) {
    await service.controlHistory(owner, jobId, "START");
    for (let i = 0; i < 30; i++) {
      const result = await service.nextHistoryBatch(owner, jobId);
      if (result.state === "STOPPED" || result.state === "UPLOAD_REQUIRED") return;
      if (result.state === "WAIT") throw new Error("Unexpected wait for file fixture");
    }
    throw new Error("Fixture import did not finish its bounded batches");
  }
  const report = (stations = [hash], begin = start, end = today) =>
    reports.readReturningVehicles(owner, { start: begin, end, stations });

  it("enforces fresh owner access, authorized station selection, and no page-triggered work", async () => {
    const jobsBefore = await db.automationJob.count();
    for (const actor of [manager, inactive]) {
      await expect(service.listHistory(actor)).rejects.toThrow(/owner/i);
      await expect(
        reports.readReturningVehicles(actor, { start, end: today, stations: [hash] }),
      ).rejects.toThrow(/owner/i);
      await expect(
        service.createHistory(actor, {
          start,
          end: today,
          stations: [hash],
          mode: "FILE",
          source: "GA_DASHBOARD",
          recordLimit: 25,
          timezoneConfirmed: true,
        }),
      ).rejects.toThrow(/owner/i);
    }
    await expect(create([digest("NOT_REGISTERED")])).rejects.toThrow(/authorized/);
    await expect(create([hash, other], "PORTAL")).rejects.toThrow(/one station/);
    await service.listHistory(owner);
    await report();
    expect(portal.export).not.toHaveBeenCalled();
    expect(await db.inspectionHistoryJob.count()).toBe(0);
    expect(await db.automationJob.count()).toBe(jobsBefore);
  });
  it("pauses, survives loss of browser state, and resumes from an exact committed row checkpoint", async () => {
    const jobId = await create([hash], "FILE", start, today);
    const windowId = await upload(
      jobId,
      start,
      Array.from({ length: 26 }, (_, i) =>
        row(`id-${i}`, start, { "Test Date": `${start}T10:${String(i).padStart(2, "0")}:00` }),
      ),
    );
    await service.controlHistory(owner, jobId, "START");
    await service.nextHistoryBatch(owner, jobId);
    let w = await db.inspectionHistoryWindow.findUniqueOrThrow({ where: { id: windowId } });
    expect(w.cursor).toBe(25);
    expect(w.imported).toBe(25);
    await service.controlHistory(owner, jobId, "PAUSE");
    expect((await service.nextHistoryBatch(owner, jobId)).state).toBe("STOPPED");
    // A new request/service read has no dependency on the original browser's state.
    expect((await service.listHistory(owner, jobId)).windows[0].cursor).toBe(25);
    await service.controlHistory(owner, jobId, "START");
    await service.nextHistoryBatch(owner, jobId);
    w = await db.inspectionHistoryWindow.findUniqueOrThrow({ where: { id: windowId } });
    expect(w.status).toBe("COMPLETED");
    expect(w.cursor).toBe(26);
    expect(await db.stationRecord.count()).toBe(26);
    expect(await db.inspectionHistoryDecision.count()).toBe(26);
    expect((await service.listHistory(owner, jobId)).windows[0]).not.toHaveProperty("leaseToken");
  });
  it("is idempotent across jobs and preserves all original fields encrypted", async () => {
    const rows = [row("same-source-id", start)];
    for (let i = 0; i < 2; i++) {
      const jobId = await create([hash], "FILE", start);
      await upload(jobId, start, rows);
      await drain(jobId);
    }
    expect(await db.stationRecord.count()).toBe(1);
    expect(await db.stationInspectionEvidence.count()).toBe(1);
    const duplicate = await db.inspectionHistoryRow.findFirst({ where: { status: "DUPLICATE" } });
    expect(duplicate).not.toBeNull();
    const evidence = await db.stationInspectionEvidence.findFirstOrThrow();
    expect(evidence.payload).not.toContain(vinA);
    const { unseal } = await import("../src/modules/station/history/crypto");
    const payload = unseal<{ original: { fields: Fixture }; normalized: { vin: string } }>(
      evidence.payload,
      `inspection:${evidence.recordId}`,
    );
    expect(payload.original.fields["Extra source field"]).toBe("Preserve this source evidence");
    expect(payload.normalized.vin).toBe(vinA);
  });
  it("attaches to existing canonical original-report records instead of duplicating or changing review state", async () => {
    const rows = [row("", start, { "Test Date": `${start}T10:00:00` })];
    const { normalizeInspection } = await import("../src/modules/station/history/rules");
    const n = normalizeInspection(
      { fields: Object.fromEntries(header.map((h) => [h, rows[0][h] || ""])) },
      hash,
      "GA_DASHBOARD",
    );
    const imp = await db.stationImport.create({
      data: {
        stationHash: hash,
        digest: "fixture",
        startDate: start,
        endDate: today,
        status: "IMPORTED",
        reason: "Fixture existing import",
        createdBy: owner,
      },
    });
    const record = await db.stationRecord.create({ data: { stationHash: hash } });
    const revision = await db.stationRevision.create({
      data: {
        recordId: record.id,
        importId: imp.id,
        stationHash: hash,
        fingerprint: n.fingerprint,
        businessDate: start,
        sourceDate: n.sourceDate,
        inspector: n.inspector,
        outcome: n.outcome,
        certificate: n.certificate,
        vehicleSuffix: "4352",
        vehicleHash: digest(vinA),
      },
    });
    await db.stationRecord.update({
      where: { id: record.id },
      data: { currentRevisionId: revision.id },
    });
    const jobId = await create([hash], "FILE", start);
    await upload(jobId, start, rows);
    await drain(jobId);
    expect(await db.stationRecord.count()).toBe(1);
    expect((await db.stationRecord.findUniqueOrThrow({ where: { id: record.id } })).state).toBe(
      "PENDING",
    );
    expect((await db.stationInspectionEvidence.findFirstOrThrow()).recordId).toBe(record.id);
  });
  it("rejects invalid rows, quarantines ambiguous no-ID rows, and never overwrites conflicting source IDs", async () => {
    const jobId = await create([hash], "FILE", start);
    const rows = [
      row("existing", start),
      row("existing", start, { VIN: vinB }),
      row("", start, { "Cert Number": "" }),
      row("", start, { "Cert Number": "" }),
      row("bad-date", start, { "Test Date": "" }),
      row("wrong-station", start, { "Station ID": "NOT_REGISTERED" }),
    ];
    // Station ID is an extra explicit column for cross-station rejection.
    const body = [
      line([...header, "Station ID"]),
      ...rows.map((r) => line([...header, "Station ID"].map((h) => r[h] || ""))),
    ].join("\n");
    const window = (await service.listHistory(owner, jobId)).windows[0];
    await service.uploadHistory(owner, {
      jobId,
      windowId: window.id,
      body,
      format: "CSV",
      total: rows.length,
      reference: "Fixture",
    });
    await drain(jobId);
    const saved = await db.inspectionHistoryWindow.findUniqueOrThrow({ where: { id: window.id } });
    expect(saved.status).toBe("PARTIAL");
    expect(saved.unresolved).toBe(3);
    expect(saved.rejected).toBe(2);
    expect(saved.imported).toBe(1);
    expect((await db.stationInspectionEvidence.findFirstOrThrow()).vinHash).toBe(digest(vinA));
    expect((await service.windowErrorReport(owner, jobId, window.id)).length).toBe(5);
    expect((await report()).coverage.label).toContain("partial coverage");
  });
  it("counts each vehicle once and only considers visits before the period began", async () => {
    const jobId = await create();
    await upload(jobId, earlier, [row("prior-A", earlier)]);
    await upload(jobId, start, [
      row("current-A", start),
      row("current-A2", start, { "Test Date": `${start}T11:00:00` }),
      row("current-B", start, { VIN: vinB, "License Plate": "OTHER" }),
      row("current-B2", start, {
        VIN: vinB,
        "License Plate": "OTHER",
        "Test Date": `${start}T12:00:00`,
      }),
    ]);
    await drain(jobId);
    const r = await report();
    expect(r.returning).toBe(1);
    expect(r.firstObserved).toBe(1);
    expect(r.identifiableVehicles).toBe(2);
    expect(r.rate).toBe(0.5);
    expect(r.qualifyingRecords).toBe(4);
  });
  it("keeps free, unpaid, void, cancelled and unknown-status observations out of the denominator", async () => {
    const jobId = await create([hash], "FILE", start);
    await upload(jobId, start, [
      row("free", start, { "Retest Status": "FREE_RETEST" }),
      row("unpaid", start, { "Payment Status": "UNPAID" }),
      row("void", start, { Status: "VOIDED" }),
      row("cancelled", start, { Status: "CANCELLED" }),
      row("unknown-pay", start, { "Payment Status": "" }),
      row("unknown-retest", start, { "Retest Status": "" }),
      row("unknown-vin", start, { VIN: "", "License Plate": "", "Plate State": "" }),
    ]);
    await drain(jobId);
    const r = await report();
    expect(r.excludedRecords).toBe(4);
    expect(r.unknownStatusRecords).toBe(2);
    expect(r.unmatchedRecords).toBe(1);
    expect(r.rate).toBeNull();
    expect(r.identificationCoverage).toBe(0);
  });
  it("does not merge conflicting VINs by plate; invalid VINs cannot use plate fallback", async () => {
    const jobId = await create();
    await upload(jobId, earlier, [row("prior", earlier)]);
    await upload(jobId, start, [
      row("A", start),
      row("B", start, { VIN: vinB }),
      row("plate-only", start, { VIN: "" }),
      row("invalid-vin", start, { VIN: "INVALID" }),
    ]);
    await drain(jobId);
    const r = await report();
    expect(r.returning).toBe(1);
    expect(r.firstObserved).toBe(1);
    expect(r.unmatchedRecords).toBe(2);
    expect(r.identifiableVehicles).toBe(2);
  });
  it("matches unambiguous plate/state to a prior VIN even when that prior row had no plate", async () => {
    const jobId = await create();
    await upload(jobId, earlier, [
      row("prior", earlier, { "License Plate": "", "Plate State": "" }),
      row("association", earlier, { "Payment Status": "UNKNOWN" }),
    ]);
    await upload(jobId, start, [row("plate-only", start, { VIN: "" })]);
    await drain(jobId);
    const r = await report();
    expect(r.returning).toBe(1);
    expect(r.plateMatchedRecords).toBe(1);
  });
  it("keeps histories isolated by selected authorized station scope", async () => {
    const jobId = await create([hash, other]);
    await upload(jobId, earlier, [row("prior-other", earlier)], other);
    await upload(jobId, start, [row("current-A", start)]);
    await drain(jobId);
    expect((await report([hash])).returning).toBe(0);
    expect((await report([hash, other])).returning).toBe(1);
    await expect(report([digest("UNAUTHORIZED")])).rejects.toThrow(/authorized/);
  });
  it("uses Eastern period boundaries for timestamps supplied with UTC offsets", async () => {
    const jobId = await create();
    await upload(jobId, priorEnd, [
      row("night-before", priorEnd, { "Test Date": `${start}T01:00:00Z` }),
    ]);
    await upload(jobId, start, [row("current", start)]);
    await drain(jobId);
    expect(
      (await db.stationInspectionEvidence.findFirstOrThrow({ where: { sourceId: "night-before" } }))
        .businessDate,
    ).toBe(priorEnd);
    expect((await report()).returning).toBe(1);
  });
  it("discloses unavailable totals and retains errors/decisions through targeted retries", async () => {
    const jobId = await create([hash], "FILE", start);
    const windowId = await upload(jobId, start, [row("x", start)], hash, null);
    await drain(jobId);
    expect((await report()).coverage.unverified).toBe(1);
    const w = await db.inspectionHistoryWindow.findUniqueOrThrow({ where: { id: windowId } });
    expect(w.status).toBe("PARTIAL");
    await service.retryHistoryWindow(owner, jobId, windowId);
    await drain(jobId);
    expect(await db.stationRecord.count()).toBe(1);
    expect(await db.inspectionHistoryDecision.count()).toBe(1);
    await service.uploadHistory(owner, {
      jobId,
      windowId,
      body: csv([row("x", start)]),
      format: "CSV",
      total: 1,
      reference: "Replacement verified total",
      replace: true,
    });
    await drain(jobId);
    expect(await db.inspectionHistoryWindow.count()).toBe(2);
    expect(await db.stationRecord.count()).toBe(1);
    expect((await service.listHistory(owner, jobId)).windows[0].status).toBe("COMPLETED");
    expect(await db.inspectionHistoryDecision.count()).toBe(2);
  });
  it("does not alter operational counts, financial postings, certificates, payroll or notifications", async () => {
    const counts = () =>
      Promise.all([
        db.dailyEmission.count(),
        db.financeEntry.count(),
        db.dealerPayment.count(),
        db.certificateMovement.count(),
        db.notification.count(),
        db.automationJob.count(),
      ]);
    const before = await counts();
    const jobId = await create([hash], "FILE", start);
    await upload(jobId, start, [row("x", start)]);
    await drain(jobId);
    const { currentRecords } = await import("../src/modules/station/service");
    expect(await db.$transaction((tx) => currentRecords(tx, hash, start, today))).toHaveLength(0);
    expect(await counts()).toEqual(before);
  });
  it("serializes provider requests across tabs, then recovers an interrupted expired lease", async () => {
    const jobId = await create([hash], "PORTAL", start);
    let release!: (v: { rows: []; sourceTotal: number }) => void, entered!: () => void;
    const started = new Promise<void>((r) => {
      entered = r;
    });
    portal.export.mockImplementationOnce(() => {
      entered();
      return new Promise((r) => {
        release = r;
      });
    });
    await service.controlHistory(owner, jobId, "START");
    const first = service.nextHistoryBatch(owner, jobId);
    await started;
    expect((await service.nextHistoryBatch(owner, jobId)).state).toBe("WAIT");
    expect(portal.export).toHaveBeenCalledTimes(1);
    release({ rows: [], sourceTotal: 0 });
    await first;
    expect((await service.listHistory(owner, jobId)).windows[0].status).toBe("COMPLETED");
    const otherJob = await create([hash], "FILE", start);
    const w = await upload(otherJob, start, [row("recover", start)]);
    await service.controlHistory(owner, otherJob, "START");
    await db.inspectionHistoryWindow.update({
      where: { id: w },
      data: { status: "RUNNING", leaseToken: "dead-process", leaseUntil: new Date(0) },
    });
    await service.nextHistoryBatch(owner, otherJob);
    expect((await service.listHistory(owner, otherJob)).windows[0].status).toBe("COMPLETED");
  });
  it("persists bounded exponential retries without sleeping in HTTP requests", async () => {
    const jobId = await create([hash], "PORTAL", start);
    portal.export.mockRejectedValueOnce(
      new BusinessError("Station portal unavailable or timed out"),
    );
    await service.controlHistory(owner, jobId, "START");
    await service.nextHistoryBatch(owner, jobId);
    let window = (await service.listHistory(owner, jobId)).windows[0];
    expect(window.attempts).toBe(1);
    expect(Date.parse(window.nextAttemptAt!) - Date.now()).toBeGreaterThan(290000);
    expect((await service.nextHistoryBatch(owner, jobId)).state).toBe("WAIT");
    expect(portal.export).toHaveBeenCalledTimes(1);
    await db.inspectionHistoryWindow.update({
      where: { id: window.id },
      data: { nextAttemptAt: new Date(0), attempts: 4 },
    });
    await db.stationTestExportState.update({
      where: { stationHash: hash },
      data: { cooldownUntil: new Date(0) },
    });
    portal.export.mockRejectedValueOnce(
      new BusinessError("Station portal unavailable or timed out"),
    );
    await service.nextHistoryBatch(owner, jobId);
    window = (await service.listHistory(owner, jobId)).windows[0];
    expect(window.status).toBe("FAILED");
    expect(window.nextAttemptAt).toBeNull();
    expect(window.attempts).toBe(5);
    await service.retryHistoryWindow(owner, jobId, window.id);
    expect((await service.listHistory(owner, jobId)).windows[0].attempts).toBe(0);
  });
  it("rejects concurrent upload/processing replacement and stale/deactivated actors", async () => {
    const jobId = await create([hash], "FILE", start);
    const windowId = await upload(jobId, start, [row("x", start)]);
    await db.inspectionHistoryWindow.update({
      where: { id: windowId },
      data: { leaseUntil: new Date(Date.now() + 60000), leaseToken: "running", status: "RUNNING" },
    });
    await expect(
      service.uploadHistory(owner, {
        jobId,
        windowId,
        body: csv([]),
        format: "CSV",
        total: 0,
        reference: "Fixture",
        replace: true,
      }),
    ).rejects.toThrow(/running/);
    await db.user.update({ where: { id: owner }, data: { active: false } });
    await expect(service.nextHistoryBatch(owner, jobId)).rejects.toThrow(/owner/);
    await expect(service.controlHistory(owner, jobId, "START")).rejects.toThrow(/owner/);
  });
  it("reports an empty period as insufficient data rather than a fabricated zero rate", async () => {
    const r = await report();
    expect(r.rate).toBeNull();
    expect(r.identificationCoverage).toBeNull();
    expect(r.returning).toBe(0);
    expect(r.historyStart).toBeNull();
  });
  it("splits oversized month scopes without gaps or restarting successful windows", async () => {
    const jobId = await create([hash], "FILE", earlier, priorEnd);
    const original = (await service.listHistory(owner, jobId)).windows[0];
    await service.splitHistoryWindow(owner, jobId, original.id);
    const windows = (await service.listHistory(owner, jobId)).windows;
    expect(windows).toHaveLength(2);
    expect(windows[0].startDate).toBe(earlier);
    expect(windows[1].endDate).toBe(priorEnd);
    expect(Temporal.PlainDate.from(windows[0].endDate).add({ days: 1 }).toString()).toBe(
      windows[1].startDate,
    );
    expect(
      (await db.inspectionHistoryWindow.findUniqueOrThrow({ where: { id: original.id } }))
        .superseded,
    ).toBe(true);
  });
  it("preserves each rejection decision when a targeted retry is attempted", async () => {
    const jobId = await create([hash], "FILE", start);
    const windowId = await upload(jobId, start, [row("bad", start, { "Test Date": "bad-date" })]);
    await drain(jobId);
    await service.retryHistoryWindow(owner, jobId, windowId);
    await drain(jobId);
    expect(await db.inspectionHistoryDecision.count()).toBe(2);
    expect((await service.listHistory(owner, jobId)).windows[0].rejected).toBe(1);
  });
  it("does not consume retry attempts for the normal shared export cooldown", async () => {
    portal.export.mockResolvedValue({ rows: [], sourceTotal: 0 });
    const first = await create([hash], "PORTAL", start);
    await drain(first);
    const second = await create([hash], "PORTAL", start);
    await service.controlHistory(owner, second, "START");
    await service.nextHistoryBatch(owner, second);
    const window = (await service.listHistory(owner, second)).windows[0];
    expect(window.attempts).toBe(0);
    expect(window.nextAttemptAt).not.toBeNull();
    expect(portal.export).toHaveBeenCalledTimes(1);
    expect((await service.nextHistoryBatch(owner, second)).state).toBe("WAIT");
  });
  it("honors provider Retry-After without waiting inside a batch request", async () => {
    const { PortalRetryError } = await import("../src/modules/station/portal-client");
    portal.export.mockRejectedValue(new PortalRetryError(900000));
    const jobId = await create([hash], "PORTAL", start);
    await service.controlHistory(owner, jobId, "START");
    await service.nextHistoryBatch(owner, jobId);
    expect(
      Date.parse((await service.listHistory(owner, jobId)).windows[0].nextAttemptAt!) - Date.now(),
    ).toBeGreaterThan(890000);
  });
  it("persists source-file failures without losing a prior checkpoint", async () => {
    const jobId = await create([hash], "FILE", start),
      window = (await service.listHistory(owner, jobId)).windows[0];
    await expect(
      service.uploadHistory(owner, {
        jobId,
        windowId: window.id,
        body: 'Test Date,VIN\n"unclosed',
        format: "CSV",
        total: null,
        reference: "Malformed synthetic export",
      }),
    ).rejects.toThrow(/unclosed/);
    expect((await service.listHistory(owner, jobId)).windows[0].status).toBe("FAILED");
    expect((await service.listHistory(owner, jobId)).windows[0].error).toContain(
      "Source file was rejected",
    );
    await upload(jobId, start, [row("valid", start)]);
    await drain(jobId);
    expect((await service.listHistory(owner, jobId)).windows[0].status).toBe("COMPLETED");
  });
  it("rechecks actor authorization after a source request finishes", async () => {
    const jobId = await create([hash], "PORTAL", start);
    let release!: (v: { rows: []; sourceTotal: number }) => void, entered!: () => void;
    const started = new Promise<void>((r) => {
      entered = r;
    });
    portal.export.mockImplementationOnce(() => {
      entered();
      return new Promise((r) => {
        release = r;
      });
    });
    await service.controlHistory(owner, jobId, "START");
    const pending = service.nextHistoryBatch(owner, jobId);
    await started;
    await db.user.update({ where: { id: owner }, data: { active: false } });
    release({ rows: [], sourceTotal: 0 });
    await expect(pending).rejects.toThrow(/owner/);
    expect(await db.stationInspectionEvidence.count()).toBe(0);
    expect(await db.stationImport.count()).toBe(0);
  });
  it("does not claim completeness when a replacement omits preserved canonical inspections", async () => {
    const jobId = await create([hash], "FILE", start);
    const windowId = await upload(jobId, start, [
      row("keep", start),
      row("omitted", start, { "Test Date": `${start}T11:00:00` }),
    ]);
    await drain(jobId);
    await service.uploadHistory(owner, {
      jobId,
      windowId,
      body: csv([row("keep", start)]),
      format: "CSV",
      total: 1,
      reference: "Smaller replacement export",
      replace: true,
    });
    await drain(jobId);
    expect((await service.listHistory(owner, jobId)).windows[0].status).toBe("PARTIAL");
    expect((await service.listHistory(owner, jobId)).windows[0].error).toContain(
      "2 canonical inspections",
    );
    expect(await db.stationRecord.count()).toBe(2);
  });
  it("quarantines no-ID matches across reformatted exports instead of creating duplicate canonical inspections", async () => {
    const first = await create([hash], "FILE", start);
    await upload(first, start, [row("", start)]);
    await drain(first);
    const second = await create([hash], "FILE", start);
    await upload(second, start, [row("", start, { VIN: vinA.toLowerCase(), Result: "PASS" })]);
    await drain(second);
    expect(await db.stationRecord.count()).toBe(1);
    expect((await service.listHistory(owner, second)).windows[0].unresolved).toBe(1);
    const third = await create([hash], "FILE", start);
    await upload(third, start, [row("", start), row("", start, { VIN: vinA.toLowerCase() })]);
    await drain(third);
    expect((await service.listHistory(owner, third)).windows[0].unresolved).toBe(2);
    expect(await db.stationRecord.count()).toBe(1);
  });
  it("adds missing paid/retest evidence without overwriting known facts or losing the original source", async () => {
    const first = await create([hash], "FILE", start);
    await upload(first, start, [
      row("enrich", start, { "Payment Status": "UNKNOWN", "Retest Status": "UNKNOWN" }),
    ]);
    await drain(first);
    expect((await report()).rate).toBeNull();
    const second = await create([hash], "FILE", start);
    await upload(second, start, [row("enrich", start)]);
    await drain(second);
    expect(await db.stationRecord.count()).toBe(1);
    expect((await report()).identifiableVehicles).toBe(1);
    expect((await db.stationInspectionEvidence.findFirstOrThrow()).payment).toBe("PAID");
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "INSPECTION_HISTORY_EVIDENCE_ENRICHED" },
    });
    expect(JSON.stringify(audit.details)).not.toContain(vinA);
    const third = await create([hash], "FILE", start);
    await upload(third, start, [row("enrich", start, { "Payment Status": "UNPAID" })]);
    await drain(third);
    expect((await service.listHistory(owner, third)).windows[0].unresolved).toBe(1);
    expect((await db.stationInspectionEvidence.findFirstOrThrow()).payment).toBe("PAID");
  });
  it("paginates saved jobs so older checkpoints remain accessible", async () => {
    const first = await create([hash], "FILE", start);
    for (let i = 0; i < 15; i++) await create([hash], "FILE", start);
    const recent = await service.listHistory(owner);
    expect(recent.jobs).toHaveLength(15);
    expect(recent.jobPages).toBe(2);
    const older = await service.listHistory(owner, undefined, 2);
    expect(older.jobs).toHaveLength(1);
    expect(older.jobs[0].id).toBe(first);
    expect((await service.listHistory(owner, first)).selected?.id).toBe(first);
  });
});
