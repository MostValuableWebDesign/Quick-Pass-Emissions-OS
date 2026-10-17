import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import type {
  InspectionHistoryWindow,
  StationInspectionEvidence,
  InspectionHistoryJob,
} from "@prisma/client";
import { id, requiredInteger } from "@/lib/validation";
import { audit, requireRule, BusinessError, type Tx } from "../../phase2";
import { digest } from "../report";
import { withStationTestExport, requireActiveTestExport } from "../test-export-gate";
import { portalHistoryExport, PortalSession, PortalRetryError } from "../portal-client";
import {
  historyTransaction,
  authorizedStations,
  checkStations,
  configuredStation,
  databaseNow,
} from "./transaction";
import {
  historyRange,
  jobInput,
  monthWindows,
  normalizeInspection,
  inspectionMatchKey,
  columns,
  retryDate,
  type RawInspection,
} from "./rules";
import { parseCsv, parseHistoryExport } from "./parser";
import { seal, unseal } from "./crypto";

type Staged = { raw: RawInspection; ambiguous: boolean };
const active = ["PENDING", "RUNNING"];
async function findJob(tx: Tx, jobId: string) {
  const job = await tx.inspectionHistoryJob.findUnique({ where: { id: id.parse(jobId) } });
  requireRule(job, "Historical import was not found.");
  await checkStations(tx, job.stationHashes);
  return job;
}
async function ownedWindow(tx: Tx, jobId: string, windowId: string) {
  const job = await findJob(tx, jobId);
  const window = await tx.inspectionHistoryWindow.findFirst({
    where: { id: id.parse(windowId), jobId },
  });
  requireRule(window, "Choose a window in this authorized import.");
  requireRule(!window.superseded, "This source attempt was replaced. Choose the current window.");
  return { job, window };
}
export function listHistory(actorId: string, jobId?: string, requestedPage = 1) {
  requiredInteger(1, 100000).parse(requestedPage);
  return historyTransaction(actorId, async (tx) => {
    const stations = await authorizedStations(tx);
    const hashes = stations.map((s) => s.stationHash);
    const [total] = await tx.$queryRaw<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM "InspectionHistoryJob" WHERE "stationHashes" <@ ${hashes}::text[] AND cardinality("stationHashes") > 0`;
    const jobPages = Math.max(1, Math.ceil(total.count / 15)),
      jobPage = Math.min(requestedPage, jobPages);
    const jobs = await tx.$queryRaw<
      InspectionHistoryJob[]
    >`SELECT * FROM "InspectionHistoryJob" WHERE "stationHashes" <@ ${hashes}::text[] AND cardinality("stationHashes") > 0 ORDER BY "createdAt" DESC, id DESC LIMIT 15 OFFSET ${(jobPage - 1) * 15}`;
    const selected = jobId ? await findJob(tx, jobId) : (jobs[0] ?? null);
    if (selected) await checkStations(tx, selected.stationHashes);
    const windows = selected
      ? await tx.inspectionHistoryWindow.findMany({
          where: { jobId: selected.id, superseded: false },
          orderBy: [{ startDate: "asc" }, { stationHash: "asc" }],
        })
      : [];
    const snapshotTime = await databaseNow(tx);
    const publicWindow = windows.map(({ leaseToken: _token, ...w }) => {
      void _token;
      return {
        ...w,
        leaseExpired: !!w.leaseUntil && w.leaseUntil <= snapshotTime,
        stagedAt: w.stagedAt?.toISOString() || null,
        nextAttemptAt: w.nextAttemptAt?.toISOString() || null,
        leaseUntil: w.leaseUntil?.toISOString() || null,
        checkpointAt: w.checkpointAt?.toISOString() || null,
      };
    });
    return {
      jobPage,
      jobPages,
      stations,
      jobs: jobs.map((j) => ({ ...j, createdAt: j.createdAt.toISOString() })),
      selected: selected ? { ...selected, createdAt: selected.createdAt.toISOString() } : null,
      windows: publicWindow,
      portalReady: !!(
        process.env.GA_DASHBOARD_USERNAME &&
        process.env.GA_DASHBOARD_PASSWORD &&
        configuredStation()
      ),
    };
  });
}
export function createHistory(actorId: string, input: unknown) {
  const data = jobInput.parse(input);
  historyRange(data.start, data.end);
  return historyTransaction(actorId, async (tx) => {
    await checkStations(tx, data.stations);
    if (data.mode === "PORTAL") {
      requireRule(
        data.stations.every((h) => h === configuredStation()?.hash),
        "Live exports are configured for one station only. Use file imports for other registered stations.",
      );
      requireRule(
        process.env.GA_DASHBOARD_USERNAME && process.env.GA_DASHBOARD_PASSWORD,
        "Configure the existing GA_DASHBOARD_USERNAME and GA_DASHBOARD_PASSWORD or choose a file import.",
      );
      requireRule(
        data.source === "GA_DASHBOARD",
        "Use GA_DASHBOARD for the existing portal integration.",
      );
    }
    const job = await tx.inspectionHistoryJob.create({
      data: {
        createdBy: actorId,
        startDate: data.start,
        endDate: data.end,
        stationHashes: data.stations,
        mode: data.mode,
        source: data.source,
        recordLimit: data.recordLimit,
      },
    });
    await tx.inspectionHistoryWindow.createMany({
      data: data.stations.flatMap((stationHash) =>
        monthWindows(data.start, data.end).map((w) => ({
          jobId: job.id,
          stationHash,
          startDate: w.start,
          endDate: w.end,
        })),
      ),
    });
    await audit(tx, actorId, "INSPECTION_HISTORY_CREATED", job.id, {
      ...data,
      timezone: "America/New_York",
    });
    return job.id;
  });
}
export function controlHistory(actorId: string, jobId: string, command: "START" | "PAUSE") {
  return historyTransaction(actorId, async (tx) => {
    const job = await findJob(tx, jobId);
    const pending = await tx.inspectionHistoryWindow.count({
      where: { jobId, superseded: false, status: { in: active } },
    });
    requireRule(
      command === "PAUSE" || pending > 0,
      "All windows were processed. Retry only the failed or partial window you want to revisit.",
    );
    if (command === "PAUSE" && pending === 0) return;
    await tx.inspectionHistoryJob.update({
      where: { id: job.id },
      data: { status: command === "START" ? "RUNNING" : "PAUSED" },
    });
    await audit(tx, actorId, `INSPECTION_HISTORY_${command}`, job.id, {});
  });
}

async function stage(
  tx: Tx,
  actorId: string,
  window: InspectionHistoryWindow,
  source: string,
  rows: RawInspection[],
  total: number | null,
  totalBasis: string,
  provenance: string,
) {
  requireRule(
    !window.stagedAt,
    "This window already has a saved source. Use Retry or a replacement file; previous decisions are retained.",
  );
  requireRule(
    rows.length <= 10000,
    "Split the source into smaller exports (maximum 10,000 rows per monthly window).",
  );
  const keys = new Map<string, number>();
  const identities = rows.map((raw) => {
    try {
      const n = normalizeInspection(raw, window.stationHash, source);
      const key = n.sourceId ? null : inspectionMatchKey(n);
      if (key) keys.set(key, (keys.get(key) || 0) + 1);
      return key;
    } catch {
      return null;
    }
  });
  const entries = rows.map((raw, index) => ({
    windowId: window.id,
    rowNumber: index + 1,
    payload: seal(
      { raw, ambiguous: !!identities[index] && keys.get(identities[index]!)! > 1 } satisfies Staged,
      `window:${window.id}:${index + 1}`,
    ),
  }));
  if (entries.length) await tx.inspectionHistoryRow.createMany({ data: entries });
  const canonicalImport = await tx.stationImport.create({
    data: {
      stationHash: window.stationHash,
      digest: digest(JSON.stringify(rows)),
      startDate: window.startDate,
      endDate: window.endDate,
      status: "HISTORY_ONLY",
      coverage: "PARTIAL",
      rows: rows.length,
      reason: provenance,
      createdBy: actorId,
    },
  });
  await tx.inspectionHistoryWindow.update({
    where: { id: window.id },
    data: {
      importId: canonicalImport.id,
      stagedAt: new Date(),
      fetched: rows.length,
      sourceTotal: total,
      totalBasis,
      status: "PENDING",
      cursor: 0,
      error: null,
      leaseToken: null,
      leaseUntil: null,
      checkpointAt: new Date(),
    },
  });
  await audit(tx, actorId, "INSPECTION_HISTORY_STAGED", window.id, {
    source,
    rows: rows.length,
    total,
    totalBasis,
    provenance,
  });
}

export async function uploadHistory(actorId: string, input: unknown) {
  const data = z
    .object({
      jobId: id,
      windowId: id,
      body: z.string().max(2_000_000),
      format: z.enum(["CSV", "XLS"]),
      total: requiredInteger(0, 10000).nullable(),
      reference: z.string().trim().min(1).max(500),
      replace: z.boolean().default(false),
    })
    .parse(input);
  // Authenticate before parsing a potentially large source.
  const authorized = await historyTransaction(actorId, (tx) =>
    ownedWindow(tx, data.jobId, data.windowId),
  );
  let parsed: ReturnType<typeof parseHistoryExport> | null = null;
  let rows: RawInspection[];
  try {
    parsed =
      data.format === "XLS" ? parseHistoryExport(data.body, authorized.window.stationHash) : null;
    rows = parsed?.rows ?? parseCsv(data.body);
  } catch (error) {
    await historyTransaction(actorId, async (tx) => {
      const { window } = await ownedWindow(tx, data.jobId, data.windowId);
      requireRule(
        !window.leaseUntil || window.leaseUntil <= (await databaseNow(tx)),
        "A batch is running; wait for its checkpoint before uploading.",
      );
      await tx.inspectionHistoryWindow.update({
        where: { id: window.id },
        data: {
          status: window.stagedAt ? window.status : "FAILED",
          error:
            "Source file was rejected. Check its format, station, date metadata, quoting, headers and size. Previously saved evidence was retained.",
        },
      });
      await tx.inspectionHistoryJob.update({
        where: { id: data.jobId },
        data: { status: "PAUSED" },
      });
      await audit(tx, actorId, "INSPECTION_HISTORY_SOURCE_REJECTED", window.id, {
        format: data.format,
      });
    });
    throw error instanceof BusinessError
      ? error
      : new BusinessError("Source file could not be parsed; check its original format and dates.");
  }
  return historyTransaction(actorId, async (tx) => {
    const { job, window } = await ownedWindow(tx, data.jobId, data.windowId);
    const now = await databaseNow(tx);
    requireRule(
      !window.leaseUntil || window.leaseUntil <= now,
      "A batch is running. Pause and wait for its checkpoint before uploading.",
    );
    if (parsed)
      requireRule(
        parsed.start === window.startDate && parsed.end === window.endDate,
        "Export dates must match this window exactly.",
      );
    // Replacement is additive: old encrypted rows and every decision remain in the database.
    if (window.stagedAt) {
      requireRule(
        data.replace,
        "Select Replace source to retain the prior attempt and upload a correction.",
      );
      await tx.inspectionHistoryWindow.update({
        where: { id: window.id },
        data: {
          status: "PARTIAL",
          superseded: true,
          error: "Superseded by a replacement source window; original decisions retained.",
        },
      });
      const replacement = await tx.inspectionHistoryWindow.create({
        data: {
          jobId: job.id,
          stationHash: window.stationHash,
          startDate: window.startDate,
          endDate: window.endDate,
          revision: window.revision + 1,
        },
      });
      await stage(
        tx,
        actorId,
        replacement,
        job.source,
        rows,
        data.total,
        data.total === null ? "UNVERIFIED" : "OWNER_SOURCE_TOTAL",
        data.reference,
      );
    } else
      await stage(
        tx,
        actorId,
        window,
        job.source,
        rows,
        data.total,
        data.total === null ? "UNVERIFIED" : "OWNER_SOURCE_TOTAL",
        data.reference,
      );
    await tx.inspectionHistoryJob.update({ where: { id: job.id }, data: { status: "PAUSED" } });
  });
}

async function mergeEvidence(
  tx: Tx,
  actorId: string,
  windowId: string,
  old: StationInspectionEvidence,
  n: ReturnType<typeof normalizeInspection>,
) {
  const result = (status: string, reason: string) => ({ status, reason, recordId: old.recordId });
  const revision = await tx.stationRevision.findUniqueOrThrow({
    where: { id: old.revisionId },
    include: { record: true },
  });
  if (
    revision.record.currentRevisionId !== revision.id ||
    revision.record.state === "SUPERSEDED" ||
    revision.fingerprint !== n.fingerprint ||
    old.source !== n.source ||
    (old.sourceId && n.sourceId && old.sourceId !== n.sourceId)
  )
    return result(
      "UNRESOLVED",
      "Source conflicts with canonical identity or a corrected revision. Original evidence was not overwritten.",
    );
  if (old.signature === n.signature)
    return result("DUPLICATE", "Existing station/source inspection evidence matched.");
  for (const key of ["payment", "retest", "completion"] as const)
    if (old[key] !== "UNKNOWN" && n[key] !== "UNKNOWN" && old[key] !== n[key])
      return result(
        "UNRESOLVED",
        "Known payment, retest or completion evidence conflicts. Original evidence was not overwritten.",
      );
  if (
    (old.vinHash && n.vinHash && old.vinHash !== n.vinHash) ||
    (old.plateHash && n.plateHash && old.plateHash !== n.plateHash)
  )
    return result("UNRESOLVED", "Vehicle identifiers conflict with existing evidence.");
  const previous = unseal<{
    original: RawInspection;
    normalized: { vin: string | null; plate: string | null; date: string };
  }>(old.payload, `inspection:${old.recordId}`);
  const extras = (fields: Record<string, string>) =>
    new Map(
      Object.entries(fields)
        .filter(([h]) => !Object.keys(columns({ [h]: "" })).length)
        .map(([h, v]) => [h.trim().toLowerCase(), v]),
    );
  const oldExtras = extras(previous.original.fields),
    newExtras = extras(n.original.fields);
  for (const [key, value] of oldExtras)
    if (value && newExtras.get(key) && value !== newExtras.get(key))
      return result("UNRESOLVED", "Additional source fields conflict with preserved evidence.");
  const payment = old.payment === "UNKNOWN" ? n.payment : old.payment,
    retest = old.retest === "UNKNOWN" ? n.retest : old.retest,
    completion = old.completion === "UNKNOWN" ? n.completion : old.completion;
  const plateHash = old.plateHash || n.plateHash,
    sourceId = old.sourceId || n.sourceId;
  const addedFields = Object.entries(n.original.fields).some(
    ([key, value]) => value && !previous.original.fields[key],
  );
  if (
    payment === old.payment &&
    retest === old.retest &&
    completion === old.completion &&
    plateHash === old.plateHash &&
    sourceId === old.sourceId &&
    !addedFields
  )
    return result("DUPLICATE", "Repeated inspection retained its already known evidence.");
  await audit(tx, actorId, "INSPECTION_HISTORY_EVIDENCE_ENRICHED", old.recordId, {
    windowId,
    before: {
      payload: old.payload,
      signature: old.signature,
      payment: old.payment,
      retest: old.retest,
      completion: old.completion,
      provenance: old.provenance,
    },
    after: { payment, retest, completion },
  });
  await tx.stationInspectionEvidence.update({
    where: { id: old.id },
    data: {
      payment,
      retest,
      completion,
      plateHash,
      sourceId,
      signature: n.signature,
      payload: seal(
        {
          original: n.original,
          normalized: {
            vin: n.normalized.vin || previous.normalized.vin,
            plate: n.normalized.plate || previous.normalized.plate,
            date: n.businessDate,
          },
        },
        `inspection:${old.recordId}`,
      ),
      provenance: `${old.provenance};history-window:${windowId}`,
    },
  });
  if (plateHash && old.vinHash)
    await tx.stationVehiclePlate.upsert({
      where: {
        stationHash_plateHash_vinHash: {
          stationHash: old.stationHash,
          plateHash,
          vinHash: old.vinHash,
        },
      },
      create: { stationHash: old.stationHash, plateHash, vinHash: old.vinHash },
      update: {},
    });
  return result(
    "IMPORTED",
    "Added previously missing evidence; prior encrypted source snapshot retained in audit. No financial posting.",
  );
}

async function persistRow(
  tx: Tx,
  actorId: string,
  window: InspectionHistoryWindow,
  source: string,
  staged: Staged,
) {
  const n = normalizeInspection(staged.raw, window.stationHash, source);
  requireRule(
    n.businessDate >= window.startDate && n.businessDate <= window.endDate,
    "Row date is outside the selected window.",
  );
  if (staged.ambiguous)
    return {
      status: "UNRESOLVED",
      reason:
        "Indistinguishable rows have no source ID. Obtain stable inspection IDs before importing.",
      recordId: null,
    };
  const existingId = n.sourceId
    ? await tx.stationInspectionEvidence.findUnique({
        where: {
          stationHash_source_sourceId: {
            stationHash: window.stationHash,
            source,
            sourceId: n.sourceId,
          },
        },
      })
    : null;
  if (existingId) return mergeEvidence(tx, actorId, window.id, existingId, n);
  const legacy = await tx.stationRevision.findUnique({
    where: {
      stationHash_fingerprint: { stationHash: window.stationHash, fingerprint: n.fingerprint },
    },
    include: { record: { include: { inspectionEvidence: true } } },
  });
  if (legacy) {
    if (legacy.record.currentRevisionId !== legacy.id || legacy.record.state === "SUPERSEDED")
      return {
        status: "UNRESOLVED",
        reason: "Original canonical inspection was corrected or superseded; review its history.",
        recordId: legacy.recordId,
      };
    const evidence = legacy.record.inspectionEvidence;
    if (evidence) return mergeEvidence(tx, actorId, window.id, evidence, n);
  }
  if (!legacy && !n.sourceId && !n.conservativeIdentity)
    return {
      status: "UNRESOLVED",
      reason:
        "Missing stable ID or precise identifying evidence; conservative matching cannot establish a unique inspection.",
      recordId: null,
    };
  if (!legacy && !n.sourceId) {
    // A reformatted export must not create a second inspection merely because its raw fingerprint changed.
    const candidates = n.vinHash
      ? await tx.stationRevision.findMany({
          where: {
            stationHash: window.stationHash,
            vehicleHash: n.vinHash,
            businessDate: n.businessDate,
          },
          include: { record: true },
          take: 100,
        })
      : n.plateHash
        ? (
            await tx.stationInspectionEvidence.findMany({
              where: {
                stationHash: window.stationHash,
                plateHash: n.plateHash,
                businessDate: n.businessDate,
              },
              include: { revision: { include: { record: true } } },
              take: 100,
            })
          ).map((e) => e.revision)
        : [];
    const possible = candidates.find(
      (c) =>
        c.record.currentRevisionId === c.id &&
        c.record.state !== "SUPERSEDED" &&
        inspectionMatchKey({ ...c, vinHash: n.vinHash, plateHash: n.plateHash }) ===
          inspectionMatchKey(n),
    );
    if (possible || candidates.length === 100)
      return {
        status: "UNRESOLVED",
        reason:
          "Normalized vehicle/time evidence may match an existing inspection. Obtain a stable source ID or review the original source; no duplicate was created.",
        recordId: possible?.recordId || null,
      };
  }
  let recordId = legacy?.recordId,
    revisionId = legacy?.id;
  if (!recordId) {
    const mapping = n.inspector
      ? await tx.stationMapping.findFirst({
          where: {
            stationHash: window.stationHash,
            inspector: n.inspector,
            effectiveDate: { lte: n.businessDate },
          },
          orderBy: { effectiveDate: "desc" },
        })
      : null;
    const record = await tx.stationRecord.create({
      data: {
        stationHash: window.stationHash,
        historicalOnly: true,
        employeeId: mapping?.employeeId,
        mappingId: mapping?.id,
      },
    });
    recordId = record.id;
    const revision = await tx.stationRevision.create({
      data: {
        stationHash: window.stationHash,
        fingerprint: n.fingerprint,
        recordId,
        importId: window.importId!,
        sourceDate: n.sourceDate,
        businessDate: n.businessDate,
        inspector: n.inspector,
        outcome: n.outcome,
        certificate: n.certificate,
        vehicleSuffix: n.normalized.vin?.slice(-4) || "",
        vehicleHash: n.vinHash || digest(`unmatched:${n.fingerprint}`),
      },
    });
    revisionId = revision.id;
    await tx.stationRecord.update({
      where: { id: recordId },
      data: { currentRevisionId: revisionId },
    });
  }
  await tx.stationInspectionEvidence.create({
    data: {
      recordId,
      revisionId: revisionId!,
      stationHash: window.stationHash,
      source,
      sourceId: n.sourceId,
      signature: n.signature,
      businessDate: n.businessDate,
      vinHash: n.vinHash,
      plateHash: n.plateHash,
      invalidVin: n.invalidVin,
      payment: n.payment,
      retest: n.retest,
      completion: n.completion,
      payload: seal({ original: n.original, normalized: n.normalized }, `inspection:${recordId}`),
      provenance: `history-window:${window.id}`,
      createdBy: actorId,
    },
  });
  if (n.plateHash && (n.vinHash || n.invalidVin))
    await tx.stationVehiclePlate.upsert({
      where: {
        stationHash_plateHash_vinHash: {
          stationHash: window.stationHash,
          plateHash: n.plateHash,
          vinHash: n.vinHash || "INVALID",
        },
      },
      create: {
        stationHash: window.stationHash,
        plateHash: n.plateHash,
        vinHash: n.vinHash || "INVALID",
      },
      update: {},
    });
  return {
    status: "IMPORTED",
    reason: legacy
      ? "Attached source evidence to the existing canonical inspection."
      : "Created historical evidence only; no operational or financial posting.",
    recordId,
  };
}

async function summarize(tx: Tx, jobId: string, windowId: string, cursor: number) {
  const window = await tx.inspectionHistoryWindow.findUniqueOrThrow({ where: { id: windowId } });
  const counts = await tx.inspectionHistoryRow.groupBy({
    by: ["status"],
    where: { windowId },
    _count: true,
  });
  const count = (status: string) => counts.find((c) => c.status === status)?._count || 0;
  const pending = count("PENDING"),
    rejected = count("REJECTED"),
    unresolved = count("UNRESOLVED");
  let canonicalTotal: number | null = null;
  if (!pending && window.sourceTotal !== null) {
    const job = await tx.inspectionHistoryJob.findUniqueOrThrow({ where: { id: jobId } });
    const [total] = await tx.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM "StationRevision" v
      JOIN "StationRecord" r ON r.id = v."recordId" AND r."currentRevisionId" = v.id
      LEFT JOIN "StationInspectionEvidence" e ON e."recordId" = r.id
      WHERE v."stationHash" = ${window.stationHash} AND v."businessDate" >= ${window.startDate} AND v."businessDate" <= ${window.endDate}
        AND r."state" <> 'SUPERSEDED'
        AND (e."source" = ${job.source} OR (e.id IS NULL AND ${job.source} = 'GA_DASHBOARD'))`;
    canonicalTotal = total.count;
  }
  const reconciled =
    window.sourceTotal !== null &&
    window.sourceTotal === window.fetched &&
    canonicalTotal === window.sourceTotal;
  const status = pending
    ? "PENDING"
    : rejected || unresolved || !reconciled
      ? "PARTIAL"
      : "COMPLETED";
  await tx.inspectionHistoryWindow.update({
    where: { id: windowId },
    data: {
      imported: count("IMPORTED"),
      duplicates: count("DUPLICATE"),
      rejected,
      unresolved,
      cursor,
      status,
      leaseToken: null,
      leaseUntil: null,
      nextAttemptAt: null,
      checkpointAt: new Date(),
      error: pending
        ? null
        : !reconciled
          ? window.sourceTotal === null
            ? "Source totals unavailable; completeness is unverified."
            : `Source reconciliation: ${window.fetched} fetched, ${canonicalTotal} canonical inspections, ${window.sourceTotal} reported by source. Review prior records; no history was overwritten.`
          : rejected || unresolved
            ? "Review rejected or unresolved rows before claiming completeness."
            : null,
    },
  });
  const all = await tx.inspectionHistoryWindow.findMany({
    where: { jobId, superseded: false },
    select: { status: true },
  });
  if (all.every((w) => !active.includes(w.status)))
    await tx.inspectionHistoryJob.update({
      where: { id: jobId },
      data: { status: all.every((w) => w.status === "COMPLETED") ? "COMPLETED" : "PARTIAL" },
    });
}

/** One request performs one source fetch OR at most recordLimit row decisions. Nothing continues after return. */
export async function nextHistoryBatch(actorId: string, jobId: string) {
  const claim = await historyTransaction(actorId, async (tx) => {
    const job = await findJob(tx, jobId),
      now = await databaseNow(tx);
    if (job.status !== "RUNNING") return { state: "STOPPED" as const };
    const windows = await tx.inspectionHistoryWindow.findMany({
      where: { jobId, superseded: false, status: { in: active } },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    });
    if (windows.some((w) => w.leaseUntil && w.leaseUntil > now))
      return { state: "WAIT" as const, nextAt: new Date(now.getTime() + 5000).toISOString() };
    const window = windows.find(
      (w) => (!w.nextAttemptAt || w.nextAttemptAt <= now) && (job.mode === "PORTAL" || w.stagedAt),
    );
    if (!window) {
      if (!windows.length) return { state: "STOPPED" as const };
      const next = windows
        .filter((w) => w.nextAttemptAt && (job.mode === "PORTAL" || w.stagedAt))
        .map((w) => w.nextAttemptAt!)
        .sort((a, b) => +a - +b)[0];
      return next
        ? { state: "WAIT" as const, nextAt: next.toISOString() }
        : { state: "UPLOAD_REQUIRED" as const };
    }
    const token = randomUUID();
    await tx.inspectionHistoryWindow.update({
      where: { id: window.id },
      data: { status: "RUNNING", leaseToken: token, leaseUntil: new Date(now.getTime() + 120000) },
    });
    return { state: "CLAIMED" as const, job, window, token };
  });
  if (claim.state !== "CLAIMED") return claim;
  const { window, job, token } = claim;
  let providerStarted = false;
  const valid = async (tx: Tx) => {
    await findJob(tx, jobId);
    const current = await tx.inspectionHistoryWindow.findUniqueOrThrow({
      where: { id: window.id },
    });
    requireRule(
      current.leaseToken === token &&
        current.leaseUntil &&
        current.leaseUntil > (await databaseNow(tx)),
      "Batch lease expired. Resume from the saved checkpoint.",
    );
    return current;
  };
  try {
    if (!window.stagedAt) {
      await withStationTestExport(actorId, "HISTORY", async (run) => {
        requireRule(
          run.hash === window.stationHash,
          "This station has no configured export credentials. Upload an authorized export instead.",
        );
        providerStarted = true;
        const exported = await portalHistoryExport(
          window.startDate,
          window.endDate,
          {
            station: run.station,
            username: process.env.GA_DASHBOARD_USERNAME || "",
            password: process.env.GA_DASHBOARD_PASSWORD || "",
          },
          new PortalSession(fetch, false, false, run.signal),
        );
        await historyTransaction(actorId, async (tx) => {
          await valid(tx);
          await requireActiveTestExport(tx, run.hash, run);
          await stage(
            tx,
            actorId,
            window,
            job.source,
            exported.rows,
            exported.sourceTotal,
            "PROVIDER_ALL_PAGE_TOTAL",
            "Existing portal bulk export; all-page count and requested dates verified.",
          );
          await summarize(tx, jobId, window.id, 0);
        });
      });
    } else
      await historyTransaction(actorId, async (tx) => {
        const current = await valid(tx);
        const rows = await tx.inspectionHistoryRow.findMany({
          where: { windowId: window.id, status: "PENDING" },
          orderBy: { rowNumber: "asc" },
          take: job.recordLimit,
        });
        let cursor = current.cursor;
        for (const row of rows) {
          let result: { status: string; reason: string; recordId: string | null };
          try {
            result = await persistRow(
              tx,
              actorId,
              current,
              job.source,
              unseal<Staged>(row.payload, `window:${window.id}:${row.rowNumber}`),
            );
          } catch (error) {
            // Never convert a database/runtime failure into a rejection after partial row writes.
            if (!(
              error instanceof BusinessError ||
              error instanceof z.ZodError ||
              error instanceof RangeError
            ))
              throw error;
            result = {
              status: "REJECTED",
              reason:
                error instanceof BusinessError
                  ? error.message
                  : "Invalid inspection fields or calendar date. Correct the source and replace this window.",
              recordId: null,
            };
          }
          await tx.inspectionHistoryRow.update({ where: { id: row.id }, data: result });
          await tx.inspectionHistoryDecision.create({ data: { rowId: row.id, ...result } });
          cursor = Math.max(cursor, row.rowNumber);
        }
        await summarize(tx, jobId, window.id, cursor);
        await audit(tx, actorId, "INSPECTION_HISTORY_CHECKPOINT", window.id, {
          cursor,
          processed: rows.length,
        });
      });
    return { state: "PROGRESSED" as const };
  } catch (error) {
    const temporary =
      error instanceof PortalRetryError ||
      /unavailable|timed out|cooling down|already running|reservation|lease expired|deadlock|transaction/i.test(
        error instanceof Error ? error.message : "",
      );
    await historyTransaction(actorId, async (tx) => {
      const current = await tx.inspectionHistoryWindow.findUnique({ where: { id: window.id } });
      if (current?.leaseToken !== token) return;
      const blocked = !providerStarted && !window.stagedAt && temporary;
      const gate = blocked
        ? await tx.stationTestExportState.findUnique({ where: { stationHash: window.stationHash } })
        : null;
      const now = await databaseNow(tx);
      const blockedUntil = gate
        ? new Date(Math.max(+now + 1000, +(gate.cooldownUntil || now), +(gate.activeUntil || now)))
        : null;
      const attempts = current.attempts + (blocked ? 0 : 1),
        retry = temporary && attempts < 5;
      await tx.inspectionHistoryWindow.update({
        where: { id: window.id },
        data: {
          leaseToken: null,
          leaseUntil: null,
          status: retry ? "PENDING" : "FAILED",
          attempts,
          nextAttemptAt: retry
            ? blockedUntil ||
              retryDate(
                attempts,
                now,
                Math.max(5 * 60000, error instanceof PortalRetryError ? error.retryAfterMs : 0),
              )
            : null,
          error: retry
            ? "Temporary source/batch failure. Retry time is saved; keep this screen open or resume later."
            : "Batch could not be completed. Check source access, report format and size; upload an authorized export or retry this window.",
        },
      });
      await audit(tx, actorId, "INSPECTION_HISTORY_BATCH_FAILED", window.id, { attempts, retry });
      if (!retry) {
        const unfinished = await tx.inspectionHistoryWindow.count({
          where: { jobId, superseded: false, status: { in: active } },
        });
        if (!unfinished)
          await tx.inspectionHistoryJob.update({
            where: { id: jobId },
            data: { status: "PARTIAL" },
          });
      }
    });
    return { state: "PROGRESSED" as const };
  }
}

export function retryHistoryWindow(actorId: string, jobId: string, windowId: string) {
  return historyTransaction(actorId, async (tx) => {
    const { window } = await ownedWindow(tx, jobId, windowId);
    const now = await databaseNow(tx);
    requireRule(
      !window.leaseUntil || window.leaseUntil <= now,
      "Wait for the running batch before retrying.",
    );
    requireRule(
      ["PARTIAL", "FAILED"].includes(window.status),
      "Retry only a partial or failed window.",
    );
    await tx.inspectionHistoryRow.updateMany({
      where: { windowId, status: { in: ["REJECTED", "UNRESOLVED"] } },
      data: { status: "PENDING", reason: null },
    });
    await tx.inspectionHistoryWindow.update({
      where: { id: windowId },
      data: {
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: null,
        error: null,
        leaseToken: null,
        leaseUntil: null,
      },
    });
    await tx.inspectionHistoryJob.update({ where: { id: jobId }, data: { status: "PAUSED" } });
    await audit(tx, actorId, "INSPECTION_HISTORY_TARGETED_RETRY", windowId, {
      previousStatus: window.status,
    });
  });
}

export function splitHistoryWindow(actorId: string, jobId: string, windowId: string) {
  return historyTransaction(actorId, async (tx) => {
    const { window } = await ownedWindow(tx, jobId, windowId),
      now = await databaseNow(tx);
    requireRule(
      !window.leaseUntil || window.leaseUntil <= now,
      "Wait for the running batch before splitting this window.",
    );
    requireRule(
      window.startDate < window.endDate && window.status !== "COMPLETED",
      "Split a pending, partial or failed window spanning more than one day.",
    );
    const start = Temporal.PlainDate.from(window.startDate);
    const midpoint = start.add({ days: Math.floor(start.until(window.endDate).days / 2) });
    await tx.inspectionHistoryWindow.update({
      where: { id: window.id },
      data: {
        superseded: true,
        status: "PARTIAL",
        error: "Replaced by smaller date windows; original rows and decisions retained.",
      },
    });
    for (const [from, end] of [
      [window.startDate, midpoint.toString()],
      [midpoint.add({ days: 1 }).toString(), window.endDate],
    ]) {
      const prior = await tx.inspectionHistoryWindow.aggregate({
        where: { jobId, stationHash: window.stationHash, startDate: from },
        _max: { revision: true },
      });
      await tx.inspectionHistoryWindow.create({
        data: {
          jobId,
          stationHash: window.stationHash,
          startDate: from,
          endDate: end,
          revision: (prior._max.revision || 0) + 1,
        },
      });
    }
    await tx.inspectionHistoryJob.update({ where: { id: jobId }, data: { status: "PAUSED" } });
    await audit(tx, actorId, "INSPECTION_HISTORY_WINDOW_SPLIT", window.id, {
      start: window.startDate,
      end: window.endDate,
      midpoint: midpoint.toString(),
    });
  });
}
export function historyErrors(actorId: string, jobId: string, page = 1) {
  return historyTransaction(actorId, async (tx) => {
    await findJob(tx, jobId);
    return tx.inspectionHistoryRow.findMany({
      where: { window: { jobId }, status: { in: ["REJECTED", "UNRESOLVED"] } },
      orderBy: [{ windowId: "asc" }, { rowNumber: "asc" }],
      skip: (page - 1) * 15,
      take: 15,
      select: {
        id: true,
        windowId: true,
        rowNumber: true,
        status: true,
        reason: true,
        recordId: true,
      },
    });
  });
}
export function windowErrorReport(actorId: string, jobId: string, windowId: string) {
  return historyTransaction(actorId, async (tx) => {
    await ownedWindow(tx, jobId, windowId);
    await audit(tx, actorId, "INSPECTION_HISTORY_ERRORS_EXPORTED", windowId, {});
    return tx.inspectionHistoryRow.findMany({
      where: { windowId, status: { in: ["REJECTED", "UNRESOLVED"] } },
      orderBy: { rowNumber: "asc" },
      select: { rowNumber: true, status: true, reason: true, recordId: true },
    });
  });
}
export type HistoryView = Awaited<ReturnType<typeof listHistory>>;
