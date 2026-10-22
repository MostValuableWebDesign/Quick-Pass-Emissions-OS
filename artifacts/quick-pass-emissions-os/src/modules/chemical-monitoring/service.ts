import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { ChemicalSensor } from "@prisma/client";
import { db } from "@/lib/db";
import { businessDate } from "@/lib/time";
import { id, requiredInteger } from "@/lib/validation";
import { audit, requireRule, type Tx } from "../phase2";
import { automationLocks } from "../automation/transaction";
import { stationAccess } from "../analytics/transaction";
import {
  normalizedEvent,
  sensorInput,
  hash,
  eventIdentity,
  ordering,
  sensorDisplay,
} from "./rules";
export class IngestionError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
// Personnel -> stock/automation -> manager tasks -> sensor. Shared with edits and task completion.
async function locked<T>(work: (tx: Tx) => Promise<T>) {
  return db.$transaction(
    async (tx) => {
      await automationLocks(tx);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183519)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183520)`;
      return work(tx);
    },
    { timeout: 30000, maxWait: 10000 },
  );
}
async function actor(tx: Tx, actorId: string, owner = false) {
  const a = await tx.user.findUnique({ where: { id: actorId }, include: { employee: true } });
  requireRule(
    a?.active && (owner ? a.role === "OWNER" : ["OWNER", "ADMIN"].includes(a.role)),
    "Active authorized management access required.",
  );
  return a;
}
async function authorized(tx: Tx, actorId: string, sensorId: string, owner = false) {
  const a = await actor(tx, actorId, owner);
  const s = await tx.chemicalSensor.findUnique({ where: { id: id.parse(sensorId) } });
  requireRule(s, "Sensor not found.");
  await stationAccess(tx, a, s.stationId);
  return { a, s };
}
async function now(tx: Tx) {
  return (await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0].now;
}
async function closeIncident(
  tx: Tx,
  sensorId: string,
  resolution: string,
  at: Date,
  actorId?: string,
) {
  const open = await tx.chemicalSensorIncident.findFirst({ where: { sensorId, closedAt: null } });
  if (!open) return;
  await tx.chemicalSensorIncident.update({
    where: { id: open.id },
    data: { closedAt: at, resolution },
  });
  await tx.notification.updateMany({
    where: { sensorIncidentId: open.id, resolvedAt: null },
    data: { resolvedAt: at },
  });
  if (open.taskId) {
    const task = await tx.taskInstance.findUniqueOrThrow({ where: { id: open.taskId } });
    if (!["COMPLETED", "CANCELLED"].includes(task.status))
      await tx.taskInstance.update({
        where: { id: task.id },
        data: {
          status: resolution === "OWNER_REPORTED_REFILL" ? "COMPLETED" : "CANCELLED",
          completedAt: resolution === "OWNER_REPORTED_REFILL" ? at : null,
          version: { increment: 1 },
        },
      });
    const name = actorId
      ? (await tx.user.findUniqueOrThrow({ where: { id: actorId } })).name
      : "Chemical level receiver";
    await tx.taskEvent.create({
      data: {
        taskId: task.id,
        actorId: actorId || "chemical-level-receiver",
        actorName: name,
        action: resolution,
        note:
          resolution === "SENSOR_RESTORED"
            ? "Device-reported restoration. Task closed without claiming a manual refill."
            : resolution === "OWNER_REPORTED_REFILL"
              ? "Owner-reported refill; last sensor observation retained unchanged."
              : "Sensor deactivated; history retained.",
      },
    });
  }
}
export async function saveSensor(actorId: string, input: unknown) {
  const d = sensorInput.parse(input);
  return locked(async (tx) => {
    const a = await actor(tx, actorId, true);
    await stationAccess(tx, a, d.stationId);
    const chemical = await tx.chemicalItem.findUnique({ where: { id: d.chemicalId } });
    requireRule(
      chemical && (chemical.active || !d.active),
      "Choose an active existing chemical, or deactivate the sensor.",
    );
    const old = d.id ? (await authorized(tx, actorId, d.id, true)).s : null;
    requireRule(!old || old.version === d.version, "Sensor changed. Refresh before editing.");
    requireRule(
      !old?.lastReceivedAt || (old.stationId === d.stationId && old.chemicalId === d.chemicalId),
      "A sensor with real history cannot be remapped. Deactivate it and register a new mapping; prior evidence is retained.",
    );
    const { id: sensorId, version: _v, periodicTransportVerified: _p, ...data } = d;
    void _v;
    void _p;
    const profile =
      a.employee ||
      (await tx.employee.create({
        data: { userId: a.id, jobRole: "Management", duties: "Chemical-level refill oversight" },
      }));
    const s = sensorId
      ? await tx.chemicalSensor.update({
          where: { id: sensorId },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.chemicalSensor.create({
          data: { ...data, registeredBy: a.id, assigneeId: profile.id },
        });
    if (!s.active) {
      const at = await now(tx);
      await tx.chemicalSensorCredential.updateMany({
        where: { sensorId: s.id, revokedAt: null },
        data: { revokedAt: at },
      });
      await closeIncident(tx, s.id, "SENSOR_DEACTIVATED", at, a.id);
      await tx.chemicalSensor.update({ where: { id: s.id }, data: { stateFenceAt: at } });
    }
    await audit(tx, a.id, "CHEMICAL_SENSOR_SAVED", s.id, {
      name: s.name,
      chemicalId: s.chemicalId,
      stationId: s.stationId,
      active: s.active,
      heartbeatMinutes: s.heartbeatMinutes,
    });
    return s.id;
  });
}
export async function rotateCredential(actorId: string, sensorId: string, revokeOnly = false) {
  return locked(async (tx) => {
    const { s } = await authorized(tx, actorId, sensorId, true);
    requireRule(s.active || revokeOnly, "Activate the sensor before generating a credential.");
    const at = await now(tx);
    await tx.chemicalSensorCredential.updateMany({
      where: { sensorId, revokedAt: null },
      data: { revokedAt: at },
    });
    const token = revokeOnly ? null : `qpcs_${randomBytes(32).toString("base64url")}`;
    if (token)
      await tx.chemicalSensorCredential.create({
        data: { sensorId, tokenHash: hash(token), createdBy: actorId },
      });
    await audit(
      tx,
      actorId,
      revokeOnly ? "CHEMICAL_SENSOR_CREDENTIAL_REVOKED" : "CHEMICAL_SENSOR_CREDENTIAL_ROTATED",
      sensorId,
      {},
    );
    return token; // Only this authenticated no-store response contains the token. Never audit it.
  });
}
export async function recordRefill(actorId: string, sensorId: string) {
  return locked(async (tx) => {
    const { s, a } = await authorized(tx, actorId, sensorId, true);
    requireRule(s.active, "This sensor is deactivated.");
    const at = await now(tx);
    await closeIncident(tx, s.id, "OWNER_REPORTED_REFILL", at, a.id);
    await tx.chemicalSensor.update({
      where: { id: s.id },
      data: { manualRefilledAt: at, stateFenceAt: at, version: { increment: 1 } },
    });
    await tx.chemicalSensorEvent.create({
      data: {
        sensorId,
        dedupeKey: randomUUID(),
        payloadHash: hash("OWNER_REPORTED_REFILL"),
        source: "MANUAL",
        state: "REFILLED",
        disposition: "OWNER_REPORTED",
        chemicalId: s.chemicalId,
        stationId: s.stationId,
        receivedAt: at,
        actorId,
      },
    });
    await audit(tx, actorId, "CHEMICAL_SENSOR_MANUAL_REFILL", sensorId, {
      observedStateUnchanged: s.lastState,
      inventoryUnchanged: true,
    });
  });
}
async function openIncident(tx: Tx, s: ChemicalSensor, eventId: string, at: Date) {
  if (await tx.chemicalSensorIncident.count({ where: { sensorId: s.id, closedAt: null } })) return;
  const chemical = await tx.chemicalItem.findUniqueOrThrow({ where: { id: s.chemicalId } });
  const station = await tx.analyticsStation.findUniqueOrThrow({
    where: { id: s.stationId },
    include: { grants: true },
  });
  const incident = await tx.chemicalSensorIncident.create({
    data: { sensorId: s.id, openedByEventId: eventId, openedAt: at },
  });
  const date = businessDate(at),
    title = `Refill ${chemical.name} · ${s.name}`,
    href = `/chemicals?sensorId=${s.id}#sensor-${s.id}`;
  const template = await tx.taskTemplate.create({
    data: {
      workspaceKey: `chemical-low:${incident.id}`,
      title,
      description: `Single-point Low report at ${station.name}. Verify/refill the container. Manual task completion does not confirm sensor recovery.`,
      frequency: "ONCE",
      startDate: date,
      dueTime: "17:00",
      employeeId: s.assigneeId,
      priority: "HIGH",
      managerTask: true,
      area: "CARWASH",
      station: station.name,
      sourceHref: href,
      active: false,
    },
  });
  const task = await tx.taskInstance.create({
    data: {
      templateId: template.id,
      occurrenceDate: date,
      title,
      description: template.description,
      dueAt: at,
      employeeId: s.assigneeId,
      priority: "HIGH",
      reviewRequired: false,
      escalationHours: 0,
      managerTask: true,
      area: "CARWASH",
      station: station.name,
      sourceHref: href,
    },
  });
  await tx.chemicalSensorIncident.update({ where: { id: incident.id }, data: { taskId: task.id } });
  await tx.taskEvent.create({
    data: {
      taskId: task.id,
      actorId: "chemical-level-receiver",
      actorName: "Chemical level receiver",
      action: "SENSOR_LOW",
      note: "Valid normalized Low event. Inventory quantities are unchanged.",
    },
  });
  const recipients = await tx.user.findMany({
    where: {
      active: true,
      OR: [{ role: "OWNER" }, { role: "ADMIN", id: { in: station.grants.map((g) => g.userId) } }],
    },
    select: { id: true },
  });
  if (recipients.length)
    await tx.notification.createMany({
      data: recipients.map((u) => ({
        key: `chemical-low:${incident.id}:${u.id}`,
        userId: u.id,
        sensorIncidentId: incident.id,
        title: `Low chemical level: ${chemical.name} · ${s.name}`,
      })),
    });
}
async function limit(tx: Tx, key: string, cap: number, at: Date) {
  const minute = BigInt(Math.floor(+at / 60000));
  const old = await tx.chemicalSensorRate.findUnique({ where: { key } });
  if (old?.minute === minute && old.count >= cap) return false;
  await tx.chemicalSensorRate.upsert({
    where: { key },
    create: { key, minute, count: 1 },
    update: { minute, count: old?.minute === minute ? old.count + 1 : 1 },
  });
  return true;
}
export async function ingestNormalized(token: string, input: unknown) {
  // Global abuse budget commits even when authorization/payload validation fails.
  const allowed = await locked(async (tx) => limit(tx, "ingress-global", 600, await now(tx)));
  if (!allowed) throw new IngestionError(429, "Receiver rate limit reached.", 60);
  const result = await locked(async (tx) => {
    const credential = await tx.chemicalSensorCredential.findUnique({
      where: { tokenHash: hash(token) },
      include: { sensor: { include: { chemical: true } } },
    });
    if (
      !credential ||
      credential.revokedAt ||
      !credential.sensor.active ||
      !credential.sensor.chemical.active
    )
      return { error: new IngestionError(401, "Invalid credential or inactive sensor.") };
    const at = await now(tx);
    if (!(await limit(tx, `sensor:${credential.sensorId}`, 60, at)))
      return { error: new IngestionError(429, "Sensor rate limit reached.", 60) };
    const parsed = normalizedEvent.safeParse(input);
    if (!parsed.success)
      return {
        error: new IngestionError(
          422,
          "Invalid Quick Pass normalized event. Check the documented contract.",
        ),
      };
    if (parsed.data.sensorId !== credential.sensorId)
      return { error: new IngestionError(401, "Invalid credential or inactive sensor.") };
    const e = parsed.data,
      s = credential.sensor,
      identity = eventIdentity(e);
    const prior = await tx.chemicalSensorEvent.findUnique({
      where: {
        sensorId_source_dedupeKey: {
          sensorId: s.id,
          source: "LIVE",
          dedupeKey: identity.dedupeKey,
        },
      },
    });
    if (prior)
      return prior.payloadHash === identity.payloadHash
        ? { duplicate: true, eventId: prior.id, disposition: prior.disposition }
        : { error: new IngestionError(409, "Event identity conflicts with an earlier payload.") };
    const observedAt = e.observedAt ? new Date(e.observedAt) : null;
    const disposition =
      e.state === "HEARTBEAT"
        ? observedAt && +observedAt > +at + 60000
          ? "FUTURE"
          : "COMMUNICATION_ONLY"
        : ordering(s, observedAt, at);
    if (disposition === "FUTURE")
      return { error: new IngestionError(422, "Observation timestamp is too far in the future.") };
    const event = await tx.chemicalSensorEvent.create({
      data: {
        sensorId: s.id,
        source: "LIVE",
        eventIdentity: e.eventId,
        state: e.state,
        fault: e.fault,
        observedAt,
        receivedAt: at,
        disposition,
        chemicalId: s.chemicalId,
        stationId: s.stationId,
        ...identity,
      },
    });
    await tx.chemicalSensor.update({
      where: { id: s.id },
      data: {
        lastReceivedAt: at,
        ...(disposition === "APPLIED"
          ? { lastState: e.state, lastObservedAt: observedAt, lastAppliedAt: at }
          : {}),
      },
    });
    if (disposition === "APPLIED" && e.state === "LOW") await openIncident(tx, s, event.id, at);
    if (disposition === "APPLIED" && e.state === "ABOVE_THRESHOLD")
      await closeIncident(tx, s.id, "SENSOR_RESTORED", at);
    return { duplicate: false, eventId: event.id, disposition };
  });
  if ("error" in result && result.error) throw result.error;
  return result;
}
export async function syntheticEvent(actorId: string, input: unknown) {
  const e = normalizedEvent.parse(input);
  return locked(async (tx) => {
    const { s } = await authorized(tx, actorId, e.sensorId, true);
    await tx.chemicalSensorEvent.create({
      data: {
        sensorId: s.id,
        ...eventIdentity(e),
        dedupeKey: randomUUID(),
        source: "SYNTHETIC",
        eventIdentity: e.eventId,
        state: e.state,
        fault: e.fault,
        observedAt: e.observedAt ? new Date(e.observedAt) : null,
        disposition: "TEST_ONLY",
        chemicalId: s.chemicalId,
        stationId: s.stationId,
        actorId,
      },
    });
    await audit(tx, actorId, "CHEMICAL_SENSOR_SYNTHETIC_TEST", s.id, {
      state: e.state,
      liveStateUnchanged: true,
    });
  });
}
export async function monitoringOverview(actorId: string, input: unknown = {}) {
  const q = z
    .object({
      sensorId: id.optional(),
      page: requiredInteger(1, 100000).default(1),
      sensorPage: requiredInteger(1, 100000).default(1),
      source: z.enum(["LIVE", "SYNTHETIC", "MANUAL"]).default("LIVE"),
    })
    .parse(input);
  return locked(async (tx) => {
    const a = await actor(tx, actorId),
      at = await now(tx);
    const stations = await tx.analyticsStation.findMany({
      where: a.role === "OWNER" ? {} : { grants: { some: { userId: a.id } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const where = {
      stationId: { in: stations.map((s) => s.id) },
      ...(q.sensorId ? { id: q.sensorId } : {}),
    };
    const totalSensors = await tx.chemicalSensor.count({ where });
    const sensorPages = Math.max(1, Math.ceil(totalSensors / 15)),
      sensorPage = Math.min(q.sensorPage, sensorPages);
    const sensors = await tx.chemicalSensor.findMany({
      where,
      include: {
        chemical: { select: { name: true } },
        station: { select: { name: true } },
        credentials: { where: { revokedAt: null }, select: { id: true, createdAt: true } },
        incidents: { where: { closedAt: null }, select: { id: true, taskId: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (sensorPage - 1) * 15,
      take: 15,
    });
    if (q.sensorId) await authorized(tx, actorId, q.sensorId);
    const eventWhere = {
      sensor: { stationId: { in: stations.map((s) => s.id) } },
      ...(q.sensorId ? { sensorId: q.sensorId } : {}),
      source: q.source,
    };
    const total = await tx.chemicalSensorEvent.count({ where: eventWhere }),
      pages = Math.max(1, Math.ceil(total / 15)),
      page = Math.min(q.page, pages);
    const events = await tx.chemicalSensorEvent.findMany({
      where: eventWhere,
      include: { sensor: { select: { name: true } } },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 15,
      take: 15,
    });
    return JSON.parse(
      JSON.stringify({
        owner: a.role === "OWNER",
        stations,
        chemicals: await tx.chemicalItem.findMany({
          where: { active: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        sensors: sensors.map((s) => ({ ...s, display: sensorDisplay(s, at) })),
        events,
        total,
        page,
        pages,
        totalSensors,
        sensorPage,
        sensorPages,
        query: q,
        serverTime: at.toISOString(),
      }),
    ) as MonitoringView;
  });
}
// JSON boundary deliberately excludes credential hashes and raw secrets.
export type MonitoringView = {
  owner: boolean;
  stations: { id: string; name: string }[];
  chemicals: { id: string; name: string }[];
  sensors: (Omit<
    ChemicalSensor,
    | "createdAt"
    | "lastObservedAt"
    | "lastAppliedAt"
    | "lastReceivedAt"
    | "stateFenceAt"
    | "manualRefilledAt"
  > & {
    createdAt: string;
    lastObservedAt: string | null;
    lastAppliedAt: string | null;
    lastReceivedAt: string | null;
    stateFenceAt: string | null;
    manualRefilledAt: string | null;
    chemical: { name: string };
    station: { name: string };
    credentials: { id: string; createdAt: string }[];
    incidents: { id: string; taskId: string | null }[];
    display: { level: string; communication: string };
  })[];
  events: {
    id: string;
    sensorId: string;
    source: string;
    state: string;
    fault: string | null;
    disposition: string;
    observedAt: string | null;
    receivedAt: string;
    sensor: { name: string };
  }[];
  total: number;
  page: number;
  pages: number;
  totalSensors: number;
  sensorPage: number;
  sensorPages: number;
  query: { sensorId?: string; page: number; source: "LIVE" | "SYNTHETIC" | "MANUAL" };
  serverTime: string;
};
