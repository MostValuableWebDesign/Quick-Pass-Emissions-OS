import { randomUUID } from "node:crypto";
import { Prisma, type Role, type DoorAccessCode } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { dueInstant } from "@/lib/time";
import { canManageRole } from "@/lib/policy";
import {
  configured,
  doorConfig,
  fingerprint,
  getDevice,
  checkPin,
  listCodes,
  removalConfirmed,
  seam,
  codeSchema,
  type SeamCode,
} from "@/lib/security/seam";
import { requireRule, type Tx } from "../phase2";

async function audit(
  tx: Tx,
  actorId: string | null,
  action: string,
  entityId: string,
  details: Prisma.InputJsonValue,
) {
  await tx.auditLog.create({ data: { actorId, action, entityId, details } });
}
const terminal = ["REVOKED", "CANCELLED"];
const options = {
  maxWait: 10000,
  timeout: 45000,
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
};
export async function doorLocks(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183508)`;
}
async function transaction<T>(
  actorId: string | null,
  ownerOnly: boolean,
  work: (tx: Tx, deadline: number, role: Role | null) => Promise<T>,
) {
  return db.$transaction(async (tx) => {
    const deadline = Date.now() + 35000;
    await doorLocks(tx);
    let role: Role | null = null;
    if (actorId !== null) {
      const actor = await tx.user.findUnique({ where: { id: actorId } });
      requireRule(
        actor?.active &&
          (ownerOnly ? actor.role === "OWNER" : ["OWNER", "ADMIN"].includes(actor.role)),
        "You do not have permission for this action.",
      );
      role = actor.role;
    }
    return work(tx, deadline, role);
  }, options);
}
async function staffPermission(tx: Tx, role: Role, employeeId: string, active = true) {
  const e = await tx.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
  requireRule(e && (!active || e.user.active), "Choose a current active staff record.");
  requireRule(
    canManageRole(role, e.user.role),
    "Only an owner may manage access for a privileged account.",
  );
  return e;
}
async function mayManageCode(tx: Tx, actorId: string, employeeId: string | null) {
  const actor = await tx.user.findUnique({ where: { id: actorId } });
  if (!actor?.active || !["OWNER", "ADMIN"].includes(actor.role)) return false;
  if (!employeeId) return true;
  const e = await tx.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
  return !!e && canManageRole(actor.role, e.user.role);
}
export async function registerDoor(actorId: string, raw: unknown) {
  const v = z.object({ name: z.string().trim().min(1).max(80), deviceId: z.uuid() }).parse(raw);
  return transaction(actorId, true, async (tx, deadline) => {
    const d = await getDevice(v.deviceId, configured().accountId, deadline);
    requireRule(
      !(await tx.doorLock.findUnique({ where: { deviceId: v.deviceId } })),
      "This door is already registered.",
    );
    const door = await tx.doorLock.create({
      data: {
        ...v,
        accountId: d.connected_account_id,
        createdBy: actorId,
        online: d.properties.online,
        locked: d.properties.locked,
        batteryPercent: d.properties.battery ? Math.round(d.properties.battery.level * 100) : null,
        checkedAt: new Date(),
      },
    });
    await audit(tx, actorId, "DOOR_REGISTERED", door.id, { name: v.name, model: "BE489WB" });
    return door.id;
  });
}
function localTime(value: string | undefined) {
  if (!value) return null;
  requireRule(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value),
    "Enter a valid Eastern date and time.",
  );
  return dueInstant(value.slice(0, 10), value.slice(11));
}
export async function prepareCode(actorId: string, raw: unknown) {
  const v = z
    .object({
      doorId: z.string().min(1).max(200),
      employeeId: z.string().max(200).optional(),
      label: z.string().trim().min(1).max(80),
      pin: z.string().regex(/^\d{4,12}$/),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
      replacesId: z.string().max(200).optional(),
      version: z.coerce.number().int().nonnegative().optional(),
    })
    .parse(raw);
  return transaction(actorId, false, async (tx, deadline, role) => {
    const door = await tx.doorLock.findUniqueOrThrow({ where: { id: v.doorId } });
    const d = await getDevice(door.deviceId, door.accountId, deadline);
    requireRule(
      d.properties.online,
      "The lock is offline. Reconnect it before issuing a new code.",
    );
    checkPin(v.pin, d);
    const existing = await listCodes(door.deviceId, deadline);
    requireRule(
      !existing.some((c) => c.code === v.pin),
      "This code already exists on the lock. Choose a different code.",
    );
    requireRule(
      existing.length < 100,
      "This lock has reached its code limit. Remove unused access first.",
    );
    const startsAt = localTime(v.startsAt),
      endsAt = localTime(v.endsAt),
      now = new Date();
    if (v.employeeId) await staffPermission(tx, role!, v.employeeId);
    else requireRule(startsAt && endsAt, "Temporary access requires a start and an end time.");
    requireRule(
      (!startsAt && !endsAt) ||
        (startsAt &&
          endsAt &&
          endsAt > startsAt &&
          endsAt > now &&
          endsAt.getTime() - startsAt.getTime() <= 30 * 86400000),
      "Use an end time after the start, within a 30-day access window.",
    );
    if (v.replacesId) {
      const old = await tx.doorAccessCode.findUnique({
        where: { id: v.replacesId },
        include: { replacement: true },
      });
      requireRule(
        old &&
          old.doorId === door.id &&
          old.employeeId === (v.employeeId || null) &&
          old.status === "ACTIVE" &&
          old.desiredState === "ACTIVE" &&
          old.version === v.version &&
          !old.replacement,
        "Access changed or already has a replacement. Refresh before changing the code.",
      );
      requireRule(
        !startsAt && !endsAt && !!v.employeeId,
        "Change continuous staff codes here; revoke and reissue temporary access separately.",
      );
    }
    const hash = fingerprint(door.id, v.pin);
    requireRule(
      !(await tx.doorAccessCode.findUnique({
        where: { doorId_fingerprint: { doorId: door.id, fingerprint: hash } },
      })),
      "Choose a different code. Previously issued codes cannot be reused on this door.",
    );
    const saved = await tx.doorAccessCode.create({
      data: {
        doorId: door.id,
        employeeId: v.employeeId || null,
        label: v.label,
        fingerprint: hash,
        providerRef: `QP-${randomUUID()}`,
        requestedBy: actorId,
        submitToken: randomUUID(),
        startsAt,
        endsAt,
        replacesId: v.replacesId || null,
      },
    });
    await audit(tx, actorId, "DOOR_CODE_REQUESTED", saved.id, {
      doorId: door.id,
      employeeId: saved.employeeId,
      temporary: !v.employeeId,
      replacesId: saved.replacesId,
    });
    return { id: saved.id, token: saved.submitToken };
  });
}
// Persist submission intent BEFORE contacting the provider. An ambiguous POST is never replayed.
export async function submitCode(actorId: string, id: string, token: string, pin: string) {
  const intent = await transaction(actorId, false, async (tx, _deadline, role) => {
    const c = await tx.doorAccessCode.findUniqueOrThrow({ where: { id } });
    requireRule(
      c.requestedBy === actorId &&
        c.submitToken === token &&
        c.fingerprint === fingerprint(c.doorId, pin),
      "Invalid access request.",
    );
    if (c.employeeId) await staffPermission(tx, role!, c.employeeId);
    if (c.attemptedAt || c.desiredState !== "ACTIVE" || terminal.includes(c.status)) return false;
    await tx.doorAccessCode.update({
      where: { id },
      data: { attemptedAt: new Date(), version: { increment: 1 } },
    });
    return true;
  });
  if (!intent) return;
  await transaction(actorId, false, async (tx, deadline, role) => {
    const c = await tx.doorAccessCode.findUniqueOrThrow({ where: { id }, include: { door: true } });
    if (c.desiredState !== "ACTIVE" || terminal.includes(c.status)) return;
    if (c.employeeId) await staffPermission(tx, role!, c.employeeId);
    if (c.endsAt && c.endsAt <= new Date()) {
      await state(
        tx,
        c,
        "REVIEW",
        actorId,
        "The access window ended before submission. Revoke this request.",
      );
      return;
    }
    try {
      const d = await getDevice(c.door.deviceId, c.door.accountId, deadline);
      requireRule(d.properties.online, "Lock is offline; submission remains unconfirmed.");
      checkPin(pin, d);
      const existing = await listCodes(c.door.deviceId, deadline);
      requireRule(
        !existing.some((r) => r.code === pin),
        "Code already exists on the lock; inspect Seam.",
      );
      const r = z.object({ access_code: codeSchema }).parse(
        await seam(
          "/access_codes/create",
          "POST",
          {
            device_id: c.door.deviceId,
            name: c.providerRef,
            code: pin,
            ...(c.startsAt
              ? { starts_at: c.startsAt.toISOString(), ends_at: c.endsAt!.toISOString() }
              : {}),
            prefer_native_scheduling: true,
            is_external_modification_allowed: false,
            attempt_for_offline_device: false,
          },
          deadline,
        ),
      );
      requireRule(
        matches(c, r.access_code, c.door.deviceId),
        "Provider returned an unexpected code; review the request in Seam.",
      );
      await tx.doorAccessCode.update({
        where: { id },
        data: { providerId: r.access_code.access_code_id },
      });
      await observe(tx, c, r.access_code, actorId, new Date());
    } catch {
      await tx.doorAccessCode.update({
        where: { id },
        data: {
          status: "REVIEW",
          failure:
            "Submission unconfirmed. Refresh status and inspect Seam before issuing another code.",
          version: { increment: 1 },
        },
      });
      await audit(tx, actorId, "DOOR_CODE_UNCONFIRMED", id, { doorId: c.doorId });
    }
  });
}
function matches(c: DoorAccessCode, r: SeamCode, deviceId: string) {
  const equal = (a: Date | null, b: string | null | undefined) =>
    a ? !!b && a.getTime() === new Date(b).getTime() : !b;
  return (
    r.device_id === deviceId &&
    r.is_managed &&
    r.name === c.providerRef &&
    (!c.providerId || r.access_code_id === c.providerId) &&
    c.fingerprint === fingerprint(c.doorId, r.code) &&
    equal(c.startsAt, r.starts_at) &&
    equal(c.endsAt, r.ends_at)
  );
}
async function state(
  tx: Tx,
  c: DoorAccessCode,
  status: string,
  actorId: string | null,
  failure: string | null = null,
) {
  await tx.doorAccessCode.update({
    where: { id: c.id },
    data: { status, failure, checkedAt: new Date(), version: { increment: 1 } },
  });
  if (status !== c.status || failure !== c.failure)
    await audit(tx, actorId, "DOOR_CODE_STATUS", c.id, { doorId: c.doorId, status, failure });
}
async function observe(tx: Tx, c: DoorAccessCode, r: SeamCode, actorId: string | null, now: Date) {
  const status =
    r.errors?.length || r.warnings?.length || ["unknown", "removing"].includes(r.status)
      ? "REVIEW"
      : r.status === "setting"
        ? "PENDING"
        : c.endsAt && !r.is_scheduled_on_device
          ? "PENDING"
          : r.pending_mutations?.length
            ? "PENDING"
            : c.endsAt && c.endsAt <= now
              ? "REMOVING"
              : c.startsAt && c.startsAt > now
                ? r.is_scheduled_on_device
                  ? "SCHEDULED"
                  : "PENDING"
                : r.status === "set"
                  ? "ACTIVE"
                  : "PENDING";
  await state(
    tx,
    c,
    status,
    actorId,
    status === "REVIEW" ? "Provider reported an issue. Inspect the code in Seam." : null,
  );
  // Preserve old access until its replacement is provider-confirmed, then queue removal.
  if (status === "ACTIVE" && c.replacesId) {
    if (!(await mayManageCode(tx, c.requestedBy, c.employeeId))) {
      await state(
        tx,
        c,
        "REVIEW",
        actorId,
        "Replacement is set, but current owner permission is required to remove the previous code.",
      );
      return;
    }
    await tx.doorAccessCode.updateMany({
      where: { id: c.replacesId, desiredState: "ACTIVE" },
      data: {
        desiredState: "REVOKED",
        status: "REMOVING",
        revokeRequestedAt: now,
        revokeRequestedBy: c.requestedBy,
        nextCheckAt: now,
        version: { increment: 1 },
      },
    });
  }
}
export async function revokeCode(actorId: string, id: string, version: number) {
  return transaction(actorId, false, async (tx, _deadline, role) => {
    const c = await tx.doorAccessCode.findUniqueOrThrow({ where: { id } });
    requireRule(!terminal.includes(c.status), "Access has already ended.");
    requireRule(c.version === version, "Access changed; refresh before revoking.");
    if (c.employeeId) await staffPermission(tx, role!, c.employeeId, false);
    await tx.doorAccessCode.update({
      where: { id },
      data: {
        desiredState: "REVOKED",
        status: !c.attemptedAt ? "CANCELLED" : "REMOVING",
        revokeRequestedAt: c.revokeRequestedAt ?? new Date(),
        revokeRequestedBy: actorId,
        nextCheckAt: new Date(),
        version: { increment: 1 },
      },
    });
    // A queued replacement must not recreate access after a revocation.
    await tx.doorAccessCode.updateMany({
      where: { replacesId: id, desiredState: "ACTIVE" },
      data: {
        desiredState: "REVOKED",
        status: "REMOVING",
        revokeRequestedAt: new Date(),
        revokeRequestedBy: actorId,
        nextCheckAt: new Date(),
        version: { increment: 1 },
      },
    });
    await audit(tx, actorId, "DOOR_CODE_REVOKE_REQUESTED", id, { doorId: c.doorId });
    return c.doorId;
  });
}
// Called within personnel's existing lock. Removing staff queues every assigned code atomically.
export async function revokeStaffCodes(tx: Tx, employeeId: string, actorId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183508)`;
  const result = await tx.doorAccessCode.updateMany({
    where: { employeeId, status: { notIn: terminal } },
    data: {
      desiredState: "REVOKED",
      status: "REMOVING",
      revokeRequestedAt: new Date(),
      revokeRequestedBy: actorId,
      nextCheckAt: new Date(),
      version: { increment: 1 },
    },
  });
  if (result.count)
    await audit(tx, actorId, "DOOR_STAFF_REVOKE_REQUESTED", employeeId, { count: result.count });
}
export async function refreshDoor(actorId: string | null, doorId: string, now = new Date()) {
  return transaction(actorId, false, async (tx, deadline) => {
    const door = await tx.doorLock.findUniqueOrThrow({ where: { id: doorId } });
    if (door.nextCheckAt > now) return;
    // A shared cooldown applies to manual refresh and independent jobs.
    await tx.doorLock.update({
      where: { id: doorId },
      data: { nextCheckAt: new Date(now.getTime() + 15000) },
    });
    try {
      const d = await getDevice(door.deviceId, door.accountId, deadline);
      await tx.doorLock.update({
        where: { id: doorId },
        data: {
          online: d.properties.online,
          locked: d.properties.locked ?? null,
          batteryPercent: d.properties.battery
            ? Math.round(d.properties.battery.level * 100)
            : null,
          checkedAt: now,
          failure: null,
        },
      });
      const remote = await listCodes(door.deviceId, deadline);
      const codes = await tx.doorAccessCode.findMany({
        where: { doorId, status: { notIn: terminal }, nextCheckAt: { lte: now } },
        select: { id: true },
        orderBy: [{ desiredState: "desc" }, { nextCheckAt: "asc" }, { id: "asc" }],
        take: 15,
      });
      for (const candidate of codes) {
        if (Date.now() > deadline - 6500) break;
        const c = await tx.doorAccessCode.findUniqueOrThrow({
          where: { id: candidate.id },
          include: { employee: { include: { user: true } } },
        });
        if (terminal.includes(c.status)) continue;
        await tx.doorAccessCode.update({
          where: { id: c.id },
          data: { nextCheckAt: new Date(now.getTime() + 60000) },
        });
        const actor = actorId;
        const shouldRevoke =
          c.desiredState === "REVOKED" ||
          (c.employee && !c.employee.user.active) ||
          (c.endsAt && c.endsAt <= now);
        if (shouldRevoke && !c.revokeRequestedAt) {
          c.revokeRequestedAt = now;
          await tx.doorAccessCode.update({
            where: { id: c.id },
            data: { desiredState: "REVOKED", revokeRequestedAt: now, revokeRequestedBy: null },
          });
        }
        const candidates = remote.filter(
          (r) => r.name === c.providerRef || r.access_code_id === c.providerId,
        );
        const r = candidates.length === 1 ? candidates[0] : null;
        if (r && !matches(c, r, door.deviceId)) {
          await state(
            tx,
            c,
            "REVIEW",
            actor,
            "Code changed outside Quick Pass. Inspect Seam before changing access.",
          );
          continue;
        }
        if (r && !c.providerId)
          await tx.doorAccessCode.update({
            where: { id: c.id },
            data: { providerId: r.access_code_id },
          });
        if (shouldRevoke) {
          if (!c.attemptedAt && !r) {
            await state(tx, c, "CANCELLED", actor);
            continue;
          }
          if (r) {
            if (
              c.revokeRequestedBy &&
              c.employee?.user.active !== false &&
              !(await mayManageCode(tx, c.revokeRequestedBy, c.employeeId))
            ) {
              await state(
                tx,
                c,
                "REVIEW",
                actor,
                "Current owner approval is required to continue this revocation.",
              );
              continue;
            }
            await seam(
              "/access_codes/delete",
              "DELETE",
              { device_id: door.deviceId, access_code_id: r.access_code_id },
              deadline,
            );
            await state(
              tx,
              c,
              "REMOVING",
              actor,
              "Removal requested; waiting for provider confirmation.",
            );
          } else if (
            c.providerId &&
            c.revokeRequestedAt &&
            (await removalConfirmed(
              door.deviceId,
              c.providerId,
              // A native scheduled expiry can precede our next independent check.
              c.endsAt && c.endsAt < c.revokeRequestedAt ? c.endsAt : c.revokeRequestedAt,
              deadline,
            ))
          ) {
            await state(tx, c, "REVOKED", actor);
          } else
            await state(
              tx,
              c,
              "REMOVING",
              actor,
              "Removal is unconfirmed. Check the lock and Seam.",
            );
        } else if (r) await observe(tx, c, r, actor, now);
        else
          await state(
            tx,
            c,
            c.attemptedAt ? "REVIEW" : "PENDING",
            actor,
            "Code not yet confirmed by the provider. Inspect Seam before issuing another code.",
          );
      }
      return true;
    } catch {
      await tx.doorLock.update({
        where: { id: doorId },
        data: {
          failure:
            "Status check incomplete. Saved access requests remain pending; check Seam and the lock.",
        },
      });
      return false;
    }
  });
}
export async function runDoorAccess(now = new Date()) {
  if (!doorConfig()) return { configured: false, checked: 0, failed: 0 };
  const doors = await db.doorLock.findMany({
    where: { nextCheckAt: { lte: now } },
    orderBy: [{ nextCheckAt: "asc" }, { id: "asc" }],
    take: 1,
    select: { id: true },
  });
  let checked = 0,
    failed = 0;
  for (const d of doors) {
    try {
      const result = await refreshDoor(null, d.id, now);
      if (result === false) failed++;
      else if (result) checked++;
    } catch {
      failed++;
    }
  }
  return { configured: true, checked, failed };
}
export async function doorOverview(actorId: string, page = 1, historyPage = 1) {
  return transaction(actorId, false, async (tx, _deadline, role) => {
    const limit = 15,
      offset = (Math.max(1, Math.min(100000, Math.floor(page) || 1)) - 1) * limit;
    const hOffset = (Math.max(1, Math.min(100000, Math.floor(historyPage) || 1)) - 1) * limit;
    const [doors, staff, codes, total, events, eventTotal] = await Promise.all([
      tx.doorLock.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          online: true,
          locked: true,
          batteryPercent: true,
          checkedAt: true,
          failure: true,
        },
      }),
      tx.employee.findMany({
        where: {
          user: { active: true, ...(role !== "OWNER" ? { role: "EMPLOYEE" as const } : {}) },
        },
        select: { id: true, user: { select: { name: true } } },
        orderBy: { user: { name: "asc" } },
      }),
      tx.doorAccessCode.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: limit,
        select: {
          id: true,
          doorId: true,
          label: true,
          employeeId: true,
          status: true,
          desiredState: true,
          version: true,
          startsAt: true,
          endsAt: true,
          checkedAt: true,
          failure: true,
          replacement: { select: { id: true } },
          door: { select: { name: true } },
          employee: { select: { user: { select: { name: true, role: true } } } },
        },
      }),
      tx.doorAccessCode.count(),
      tx.auditLog.findMany({
        where: { action: { startsWith: "DOOR_" } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: hOffset,
        take: limit,
        select: {
          id: true,
          action: true,
          entityId: true,
          details: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      }),
      tx.auditLog.count({ where: { action: { startsWith: "DOOR_" } } }),
    ]);
    return { configured: !!doorConfig(), role, doors, staff, codes, total, events, eventTotal };
  });
}
