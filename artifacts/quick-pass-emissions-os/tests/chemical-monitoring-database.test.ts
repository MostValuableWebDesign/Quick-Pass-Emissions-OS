import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hash } from "../src/modules/chemical-monitoring/rules";
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Isolated test DB required");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
(enabled ? describe : describe.skip)("chemical monitoring on isolated PostgreSQL", () => {
  let db: typeof import("../src/lib/db").db,
    service: typeof import("../src/modules/chemical-monitoring/service");
  let owner: string,
    manager: string,
    other: string,
    staff: string,
    inactive: string,
    station: string,
    chemical: string,
    sensorId: string,
    token: string;
  const event = (state = "LOW", offset = 0, eventId = randomUUID()) => ({
    schemaVersion: 1,
    sensorId,
    eventId,
    state,
    observedAt: new Date(Date.now() - 1000 + offset).toISOString(),
  });
  const ingest = (state = "LOW", offset = 0) =>
    service.ingestNormalized(token, event(state, offset));
  async function counts() {
    return Promise.all([
      db.chemicalMovement.count(),
      db.financeEntry.count(),
      db.dailyEmission.count(),
      db.certificateMovement.count(),
    ]);
  }
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    service = await import("../src/modules/chemical-monitoring/service");
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "ChemicalSensor", "ChemicalSensorRate", "ChemicalItem", "AnalyticsStation", "User" CASCADE',
    );
    const user = async (role: "OWNER" | "ADMIN" | "EMPLOYEE", active = true) =>
      (
        await db.user.create({
          data: { email: `${randomUUID()}@example.test`, name: "Fixture management", role, active },
        })
      ).id;
    owner = await user("OWNER");
    manager = await user("ADMIN");
    other = await user("ADMIN");
    staff = await user("EMPLOYEE");
    inactive = await user("OWNER", false);
    station = (
      await db.analyticsStation.create({
        data: { name: "Fixture station", stationHash: randomUUID(), createdBy: owner },
      })
    ).id;
    await db.analyticsStationGrant.create({ data: { stationId: station, userId: manager } });
    chemical = (
      await db.chemicalItem.create({
        data: { name: "Fixture foam soap", unit: "ML", balance: 5000, reorderPoint: 500 },
      })
    ).id;
    sensorId = await service.saveSensor(owner, {
      name: "Foam container",
      chemicalId: chemical,
      stationId: station,
      containerSize: "5-gallon container",
      staleAfterMinutes: 1440,
    });
    token = (await service.rotateCredential(owner, sensorId))!;
  });
  it("enforces fresh owner controls and explicit station grants without staff login", async () => {
    for (const who of [staff, inactive])
      await expect(service.monitoringOverview(who)).rejects.toThrow(/access/i);
    expect((await service.monitoringOverview(other)).sensors).toHaveLength(0);
    await expect(service.monitoringOverview(other, { sensorId })).rejects.toThrow(/authorized/);
    expect((await service.monitoringOverview(manager)).sensors).toHaveLength(1);
    await expect(service.rotateCredential(manager, sensorId)).rejects.toThrow(/access/);
    await expect(service.recordRefill(manager, sensorId)).rejects.toThrow(/access/);
    await db.user.update({ where: { id: owner }, data: { active: false } });
    await expect(service.rotateCredential(owner, sensorId)).rejects.toThrow(/access/);
  });
  it("keeps registrations and credentials Not connected, storing only hashes", async () => {
    const view = await service.monitoringOverview(owner);
    expect(view.sensors[0].display.level).toBe("Not connected");
    expect(JSON.stringify(view)).not.toContain(token);
    const cred = await db.chemicalSensorCredential.findFirstOrThrow();
    expect(cred.tokenHash).toBe(hash(token));
    expect(JSON.stringify(cred)).not.toContain(token);
    expect(await db.chemicalSensorEvent.count()).toBe(0);
  });
  it("creates one persistent task/warning per low episode under concurrent delivery", async () => {
    const before = await counts();
    await Promise.all([ingest(), ingest("LOW", 10), ingest("LOW", 20)]);
    expect(await db.chemicalSensorIncident.count({ where: { closedAt: null } })).toBe(1);
    expect(await db.taskInstance.count({ where: { sourceHref: { contains: sensorId } } })).toBe(1);
    const alerts = await db.notification.findMany({ where: { sensorIncidentId: { not: null } } });
    expect(alerts.map((a) => a.userId).sort()).toEqual([owner, manager].sort());
    expect(alerts.every((a) => !a.taskId && !a.resolvedAt)).toBe(true);
    expect(await counts()).toEqual(before);
  });
  it("deduplicates event identities and rejects conflicting reuses without changing state", async () => {
    const e = event();
    await service.ingestNormalized(token, e);
    expect(await service.ingestNormalized(token, e)).toMatchObject({ duplicate: true });
    await expect(
      service.ingestNormalized(token, { ...e, state: "ABOVE_THRESHOLD" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await db.chemicalSensorEvent.count()).toBe(1);
    expect((await service.monitoringOverview(owner)).sensors[0].lastState).toBe("LOW");
  });
  it("records delayed messages but never lets them overwrite newer observations", async () => {
    const latest = event("ABOVE_THRESHOLD", 0);
    await service.ingestNormalized(token, latest);
    const delayed = {
      ...event(),
      observedAt: new Date(Date.parse(latest.observedAt) - 10000).toISOString(),
    };
    expect(await service.ingestNormalized(token, delayed)).toMatchObject({
      disposition: "OUT_OF_ORDER",
    });
    expect((await service.monitoringOverview(owner)).sensors[0].lastState).toBe("ABOVE_THRESHOLD");
    expect(await db.chemicalSensorIncident.count()).toBe(0);
    await expect(ingest("LOW", 120000)).rejects.toMatchObject({ status: 422 });
    expect(
      await service.ingestNormalized(token, {
        schemaVersion: 1,
        sensorId,
        state: "LOW",
        eventId: "untimed",
      }),
    ).toMatchObject({ disposition: "UNORDERED" });
  });
  it("distinguishes explicit faults, sensor recovery and manual task completion", async () => {
    await ingest();
    const incident = await db.chemicalSensorIncident.findFirstOrThrow();
    const task = await db.taskInstance.findUniqueOrThrow({ where: { id: incident.taskId! } });
    const a = await db.user.findUniqueOrThrow({ where: { id: owner } });
    await (
      await import("../src/modules/tasks/service")
    ).changeTask(a, {
      taskId: task.id,
      version: task.version,
      status: "COMPLETED",
      note: "Work checked manually; no device reading",
    });
    expect(
      await db.notification.count({ where: { sensorIncidentId: incident.id, resolvedAt: null } }),
    ).toBe(2);
    await ingest("FAULT", 1000);
    expect((await service.monitoringOverview(owner)).sensors[0].display.level).toBe("Sensor fault");
    expect(await db.chemicalSensorIncident.count({ where: { closedAt: null } })).toBe(1);
    await ingest("ABOVE_THRESHOLD", 2000);
    expect(
      (await db.chemicalSensorIncident.findUniqueOrThrow({ where: { id: incident.id } }))
        .resolution,
    ).toBe("SENSOR_RESTORED");
    expect(
      await db.notification.count({ where: { sensorIncidentId: incident.id, resolvedAt: null } }),
    ).toBe(0);
    expect((await db.taskInstance.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
      "COMPLETED",
    );
  });
  it("records manual refill provenance without fabricating recovery and only reopens for a newer Low", async () => {
    await ingest();
    const before = await db.chemicalSensor.findUniqueOrThrow({ where: { id: sensorId } });
    await service.recordRefill(owner, sensorId);
    const after = await db.chemicalSensor.findUniqueOrThrow({ where: { id: sensorId } });
    expect(after.lastState).toBe(before.lastState);
    expect(after.lastObservedAt).toEqual(before.lastObservedAt);
    expect(after.manualRefilledAt).not.toBeNull();
    expect(
      await db.notification.count({ where: { sensorIncidentId: { not: null }, resolvedAt: null } }),
    ).toBe(0);
    expect(await service.ingestNormalized(token, event("LOW", -10000))).toMatchObject({
      disposition: "OUT_OF_ORDER",
    });
    expect(
      await service.ingestNormalized(token, {
        schemaVersion: 1,
        sensorId,
        state: "LOW",
        eventId: "no-time-after-refill",
      }),
    ).toMatchObject({ disposition: "UNORDERED" });
    await ingest("LOW", 3000);
    expect(await db.chemicalSensorIncident.count()).toBe(2);
    expect(await db.taskInstance.count({ where: { sourceHref: { contains: sensorId } } })).toBe(2);
    expect(await db.chemicalMovement.count()).toBe(0);
  });
  it("cancels an open task on detected recovery without claiming manual work", async () => {
    await ingest();
    await ingest("ABOVE_THRESHOLD", 1000);
    const incident = await db.chemicalSensorIncident.findFirstOrThrow();
    expect(
      (await db.taskInstance.findUniqueOrThrow({ where: { id: incident.taskId! } })).status,
    ).toBe("CANCELLED");
    expect(
      await db.taskEvent.count({ where: { taskId: incident.taskId!, action: "SENSOR_RESTORED" } }),
    ).toBe(1);
  });
  it("rejects wrong, rotated, revoked, mismatched and inactive sensor credentials", async () => {
    await expect(service.ingestNormalized("qpcs_wrong", event())).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      service.ingestNormalized(token, { ...event(), sensorId: "unknown" }),
    ).rejects.toMatchObject({ status: 401 });
    const replacement = (await service.rotateCredential(owner, sensorId))!;
    await expect(ingest()).rejects.toMatchObject({ status: 401 });
    token = replacement;
    await ingest();
    await service.rotateCredential(owner, sensorId, true);
    await expect(ingest()).rejects.toMatchObject({ status: 401 });
    token = (await service.rotateCredential(owner, sensorId))!;
    await db.chemicalSensor.update({ where: { id: sensorId }, data: { active: false } });
    await expect(ingest()).rejects.toMatchObject({ status: 401 });
  });
  it("isolates synthetic events and paginates durable history after reopening", async () => {
    const before = await counts();
    for (let i = 0; i < 31; i++) await service.syntheticEvent(owner, event("LOW"));
    const reopened = await service.monitoringOverview(owner, { source: "SYNTHETIC", page: 2 });
    expect(reopened.events).toHaveLength(15);
    expect(reopened.pages).toBe(3);
    expect(reopened.total).toBe(31);
    expect(reopened.sensors[0].display.level).toBe("Not connected");
    expect(await db.notification.count({ where: { sensorIncidentId: { not: null } } })).toBe(0);
    expect(await db.chemicalSensorIncident.count()).toBe(0);
    expect(await counts()).toEqual(before);
    const s = reopened.sensors[0];
    await service.saveSensor(owner, {
      id: s.id,
      version: s.version,
      name: s.name,
      chemicalId: chemical,
      stationId: station,
      containerSize: s.containerSize,
      active: false,
    });
    expect((await service.monitoringOverview(owner, { source: "SYNTHETIC" })).total).toBe(31);
  });
  it("stores heartbeat communication without inventing a level and enforces configured freshness", async () => {
    await ingest("HEARTBEAT");
    let s = (await service.monitoringOverview(owner)).sensors[0];
    expect(s.display.level).toBe("Unknown/stale");
    expect(s.lastAppliedAt).toBeNull();
    expect(s.display.communication).toContain("heartbeat not configured");
    await ingest("LOW", 1000);
    await db.chemicalSensor.update({
      where: { id: sensorId },
      data: { lastObservedAt: new Date(Date.now() - 2 * 86400000) },
    });
    s = (await service.monitoringOverview(owner)).sensors[0];
    expect(s.display.level).toBe("Unknown/stale");
    expect(s.display.communication).toContain("Event-driven");
    expect(s.incidents).toHaveLength(1);
  });
  it("enforces persistent rate limits and strict payloads without leaking data", async () => {
    await expect(
      service.ingestNormalized(token, { ...event(), percent: 15 }),
    ).rejects.toMatchObject({ status: 422 });
    await db.chemicalSensorRate.upsert({
      where: { key: `sensor:${sensorId}` },
      create: {
        key: `sensor:${sensorId}`,
        minute: BigInt(Math.floor(Date.now() / 60000)),
        count: 60,
      },
      update: { count: 60 },
    });
    await expect(ingest()).rejects.toMatchObject({ status: 429, retryAfter: 60 });
    expect(await db.chemicalSensorEvent.count()).toBe(0);
    expect(JSON.stringify(await db.auditLog.findMany())).not.toContain(token);
  });
  it("retains deactivated history, revokes access, and permits deactivation after the mapped chemical is archived", async () => {
    await ingest();
    const old = (await service.monitoringOverview(owner)).sensors[0];
    const another = await db.chemicalItem.create({ data: { name: "Different fixture chemical" } });
    await expect(
      service.saveSensor(owner, {
        id: sensorId,
        version: old.version,
        name: old.name,
        stationId: station,
        chemicalId: another.id,
        containerSize: old.containerSize,
      }),
    ).rejects.toThrow(/cannot be remapped/);
    await db.chemicalItem.update({ where: { id: chemical }, data: { active: false } });
    await service.saveSensor(owner, {
      id: sensorId,
      version: old.version,
      name: old.name,
      stationId: station,
      chemicalId: chemical,
      containerSize: old.containerSize,
      active: false,
    });
    const reopened = (await service.monitoringOverview(owner)).sensors[0];
    expect(reopened.active).toBe(false);
    expect(reopened.credentials).toHaveLength(0);
    expect(reopened.incidents).toHaveLength(0);
    expect(reopened.lastState).toBe("LOW");
    expect(await db.chemicalSensorEvent.count()).toBe(1);
    await expect(ingest()).rejects.toMatchObject({ status: 401 });
    expect(
      await db.notification.count({ where: { sensorIncidentId: { not: null }, resolvedAt: null } }),
    ).toBe(0);
  });
});
