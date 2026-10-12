import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Isolated database required.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
(enabled ? describe : describe.skip)(
  "Door access persistence, permission races and provider confirmation",
  () => {
    let db: PrismaClient, s: typeof import("../src/modules/security/service");
    let owner: string,
      manager: string,
      staff: string,
      door: string,
      deviceId: string,
      accountId: string;
    let remote: Record<string, unknown>[],
      events: Record<string, unknown>[],
      online: boolean,
      createStatus: string,
      throwAfterCreate: boolean,
      pages: boolean;
    let elapsed: number;
    const tick = () => new Date(Date.now() + ++elapsed * 120000);
    beforeAll(async () => {
      db = (await import("../src/lib/db")).db;
      s = await import("../src/modules/security/service");
    });
    beforeEach(async () => {
      await db.$executeRawUnsafe('TRUNCATE "DoorLock","User" CASCADE');
      owner = (
        await db.user.create({
          data: { name: "Owner", email: `${randomUUID()}@example.test`, role: "OWNER" },
        })
      ).id;
      manager = (
        await db.user.create({
          data: { name: "Manager", email: `${randomUUID()}@example.test`, role: "ADMIN" },
        })
      ).id;
      staff = (
        await db.employee.create({
          data: {
            user: {
              create: { name: "Staff", email: `${randomUUID()}@example.test`, role: "EMPLOYEE" },
            },
          },
        })
      ).id;
      deviceId = randomUUID();
      accountId = randomUUID();
      remote = [];
      events = [];
      online = true;
      createStatus = "setting";
      throwAfterCreate = false;
      pages = false;
      elapsed = 0;
      vi.stubEnv("SEAM_API_KEY", "fixture-api-key");
      vi.stubEnv("SEAM_CONNECTED_ACCOUNT_ID", accountId);
      vi.stubEnv("DOOR_CODE_HMAC_KEY", "a".repeat(64));
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (input, init) => {
          const url = new URL(String(input));
          expect(url.origin).toBe("https://connect.getseam.com");
          if (url.pathname === "/devices/get")
            return Response.json({
              device: {
                device_id: deviceId,
                connected_account_id: accountId,
                device_type: "schlage_lock",
                is_managed: true,
                can_program_online_access_codes: true,
                properties: {
                  online,
                  locked: true,
                  battery: { level: 0.75 },
                  schlage_metadata: { model: "BE489WB" },
                  supported_code_lengths: [6],
                },
              },
            });
          if (url.pathname === "/access_codes/list")
            return Response.json({ access_codes: remote, pagination: { has_next_page: pages } });
          if (url.pathname === "/access_codes/create") {
            const p = JSON.parse(init.body);
            const c = {
              access_code_id: randomUUID(),
              device_id: deviceId,
              name: p.name,
              code: p.code,
              status: createStatus,
              is_managed: true,
              starts_at: p.starts_at ?? null,
              ends_at: p.ends_at ?? null,
              errors: [],
              warnings: [],
              pending_mutations: [],
              is_scheduled_on_device: false,
            };
            remote.push(c);
            if (throwAfterCreate) throw new Error(`private ${p.code}`);
            return Response.json({ access_code: c });
          }
          if (url.pathname === "/access_codes/delete") {
            expect(init.method).toBe("DELETE");
            return Response.json({});
          }
          if (url.pathname === "/events/list") return Response.json({ events });
          throw new Error("Unexpected provider endpoint");
        }),
      );
      door = await s.registerDoor(owner, { name: "Front door", deviceId });
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });
    afterAll(async () => {
      await db.$executeRawUnsafe('TRUNCATE "DoorLock" CASCADE');
    });
    const request = (pin = "684921", extra = {}) =>
      s.prepareCode(manager, {
        doorId: door,
        employeeId: staff,
        label: "Staff access",
        pin,
        ...extra,
      });
    const submit = async (pin = "684921", extra = {}) => {
      const c = await request(pin, extra);
      await s.submitCode(manager, c.id, c.token, pin);
      return c;
    };
    const code = (id: string) => db.doorAccessCode.findUniqueOrThrow({ where: { id } });
    const creates = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(([u]) => new URL(String(u)).pathname === "/access_codes/create");
    it("allows only active owners to register hardware and only management to read or issue", async () => {
      await expect(
        s.registerDoor(manager, { name: "Other", deviceId: randomUUID() }),
      ).rejects.toThrow("permission");
      const user = (await db.employee.findUniqueOrThrow({ where: { id: staff } })).userId;
      await expect(s.doorOverview(user)).rejects.toThrow("permission");
      await db.user.update({ where: { id: manager }, data: { active: false } });
      await expect(request()).rejects.toThrow("permission");
      expect(creates()).toHaveLength(0);
    });
    it("rechecks an actor deactivated after queueing and never submits their grant", async () => {
      const c = await request();
      await db.user.update({ where: { id: manager }, data: { active: false } });
      await expect(s.submitCode(manager, c.id, c.token, "684921")).rejects.toThrow("permission");
      expect(creates()).toHaveLength(0);
    });
    it("rechecks a target promoted to owner after queueing and rejects manager control", async () => {
      const c = await request();
      const e = await db.employee.findUniqueOrThrow({ where: { id: staff } });
      await db.user.update({ where: { id: e.userId }, data: { role: "OWNER" } });
      await expect(s.submitCode(manager, c.id, c.token, "684921")).rejects.toThrow("owner");
      await expect(s.revokeCode(manager, c.id, (await code(c.id)).version)).rejects.toThrow(
        "owner",
      );
      expect(creates()).toHaveLength(0);
    });
    it("serializes the personnel race and rereads permissions after acquiring the lock", async () => {
      const c = await request();
      let entered!: () => void, release!: () => void;
      const ready = new Promise<void>((r) => (entered = r)),
        hold = new Promise<void>((r) => (release = r));
      const promotion = db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
        entered();
        await hold;
        await tx.user.update({ where: { id: manager }, data: { active: false } });
      });
      await ready;
      const queued = s.submitCode(manager, c.id, c.token, "684921");
      release();
      await promotion;
      await expect(queued).rejects.toThrow("permission");
      expect(creates()).toHaveLength(0);
    });
    it("rechecks the revoking actor and target again before a queued provider removal", async () => {
      const c = await submit();
      await s.revokeCode(manager, c.id, (await code(c.id)).version);
      const e = await db.employee.findUniqueOrThrow({ where: { id: staff } });
      await db.user.update({ where: { id: e.userId }, data: { role: "OWNER" } });
      await s.runDoorAccess(tick());
      expect((await code(c.id)).status).toBe("REVIEW");
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([u]) => new URL(String(u)).pathname === "/access_codes/delete"),
      ).toBe(false);
      await s.revokeCode(owner, c.id, (await code(c.id)).version);
      await s.runDoorAccess(tick());
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([u]) => new URL(String(u)).pathname === "/access_codes/delete"),
      ).toBe(true);
    });
    it("blocks a queued revocation after the acting manager is deactivated", async () => {
      const c = await submit();
      await s.revokeCode(manager, c.id, (await code(c.id)).version);
      await db.user.update({ where: { id: manager }, data: { active: false } });
      await s.runDoorAccess(tick());
      expect((await code(c.id)).status).toBe("REVIEW");
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([u]) => new URL(String(u)).pathname === "/access_codes/delete"),
      ).toBe(false);
    });
    it("persists metadata without the PIN and shows pending until the provider confirms", async () => {
      const c = await submit();
      expect((await code(c.id)).status).toBe("PENDING");
      expect(JSON.stringify(await code(c.id))).not.toContain("684921");
      remote[0].status = "set";
      await s.refreshDoor(owner, door, tick());
      const reopened = await s.doorOverview(manager);
      expect(reopened.codes[0]).toMatchObject({ id: c.id, status: "ACTIVE" });
      expect(JSON.stringify(reopened)).not.toContain("684921");
      expect(JSON.stringify(reopened)).not.toContain("fingerprint");
      expect(JSON.stringify(await db.auditLog.findMany())).not.toContain("684921");
      expect(reopened.doors[0]).toMatchObject({ batteryPercent: 75, locked: true, online: true });
      remote[0].status = "unknown";
      await s.refreshDoor(owner, door, tick());
      expect((await code(c.id)).status).toBe("REVIEW");
    });
    it("never replays an ambiguous create and recovers it by its exact opaque reference", async () => {
      throwAfterCreate = true;
      const c = await submit();
      expect((await code(c.id)).status).toBe("REVIEW");
      await s.submitCode(manager, c.id, c.token, "684921");
      remote[0].status = "set";
      await s.runDoorAccess(tick());
      await s.runDoorAccess(tick());
      expect(creates()).toHaveLength(1);
      expect((await code(c.id)).status).toBe("ACTIVE");
    });
    it("serializes concurrent duplicate submissions and rejects token/PIN substitution", async () => {
      const c = await request();
      await expect(s.submitCode(manager, c.id, "wrong", "684921")).rejects.toThrow("Invalid");
      await expect(s.submitCode(manager, c.id, c.token, "684922")).rejects.toThrow("Invalid");
      await Promise.all([
        s.submitCode(manager, c.id, c.token, "684921"),
        s.submitCode(manager, c.id, c.token, "684921"),
      ]);
      expect(creates()).toHaveLength(1);
    });
    it("rejects blanks, nonnumeric/unsupported PIN lengths and local or hardware duplicates", async () => {
      for (const pin of ["", "1234", "false", "68492a"])
        await expect(request(pin)).rejects.toThrow();
      await submit();
      await expect(request()).rejects.toThrow("already exists");
      remote = [];
      await expect(request()).rejects.toThrow("cannot be reused");
    });
    it("refuses new grants offline, mismatched accounts and unverified provider responses", async () => {
      online = false;
      await expect(request()).rejects.toThrow("offline");
      online = true;
      vi.stubEnv("SEAM_CONNECTED_ACCOUNT_ID", randomUUID());
      await expect(request()).rejects.toThrow("account");
      vi.stubEnv("SEAM_CONNECTED_ACCOUNT_ID", accountId);
      pages = true;
      await expect(request()).rejects.toThrow("complete");
      expect(creates()).toHaveLength(0);
    });
    it("keeps an API-accepted removal pending until the exact dated removal event arrives", async () => {
      const c = await submit();
      const stored = await code(c.id);
      await s.revokeCode(manager, c.id, stored.version);
      await s.refreshDoor(manager, door, tick());
      expect((await code(c.id)).status).toBe("REMOVING");
      const providerId = remote[0].access_code_id;
      remote = [];
      await s.refreshDoor(owner, door, tick());
      expect((await code(c.id)).status).toBe("REMOVING");
      const revoked = await code(c.id);
      events = [
        {
          device_id: deviceId,
          access_code_id: providerId,
          event_type: "access_code.removed_from_device",
          occurred_at: new Date(revoked.revokeRequestedAt!.getTime() - 1).toISOString(),
        },
      ];
      await s.refreshDoor(owner, door, tick());
      expect((await code(c.id)).status).toBe("REMOVING");
      events[0].occurred_at = new Date(revoked.revokeRequestedAt!.getTime() + 1).toISOString();
      await s.refreshDoor(owner, door, tick());
      expect((await code(c.id)).status).toBe("REVOKED");
    });
    it("does not confirm removal from a truncated list or a different device event", async () => {
      const c = await submit();
      await s.revokeCode(manager, c.id, (await code(c.id)).version);
      const providerId = remote[0].access_code_id;
      remote = [];
      pages = true;
      events = [
        {
          device_id: randomUUID(),
          access_code_id: providerId,
          event_type: "access_code.removed_from_device",
          occurred_at: tick().toISOString(),
        },
      ];
      await s.refreshDoor(owner, door, tick());
      expect((await code(c.id)).status).toBe("REMOVING");
      pages = false;
      await s.refreshDoor(owner, door, tick());
      expect((await code(c.id)).status).toBe("REMOVING");
    });
    it("cancels an unsent request without pretending an ambiguous submission was removed", async () => {
      const c = await request();
      await s.revokeCode(manager, c.id, (await code(c.id)).version);
      expect((await code(c.id)).status).toBe("CANCELLED");
      await s.submitCode(manager, c.id, c.token, "684921");
      expect(creates()).toHaveLength(0);
    });
    it("keeps the old staff code until its replacement is confirmed and rejects stale edits", async () => {
      createStatus = "set";
      const old = await submit();
      createStatus = "setting";
      const replacement = await submit("684922", {
        replacesId: old.id,
        version: (await code(old.id)).version,
      });
      expect((await code(old.id)).desiredState).toBe("ACTIVE");
      await expect(s.revokeCode(manager, old.id, 1)).rejects.toThrow("changed");
      remote[1].status = "set";
      await s.refreshDoor(owner, door, tick());
      expect((await code(replacement.id)).status).toBe("ACTIVE");
      expect((await code(old.id)).desiredState).toBe("REVOKED");
      expect((await code(old.id)).status).toBe("REMOVING");
    });
    it("a delayed replacement cannot remove owner access using a manager's old authority", async () => {
      createStatus = "set";
      const old = await submit();
      createStatus = "setting";
      const replacement = await submit("684922", {
        replacesId: old.id,
        version: (await code(old.id)).version,
      });
      const e = await db.employee.findUniqueOrThrow({ where: { id: staff } });
      await db.user.update({ where: { id: e.userId }, data: { role: "OWNER" } });
      remote[1].status = "set";
      await s.runDoorAccess(tick());
      expect((await code(replacement.id)).status).toBe("REVIEW");
      expect((await code(old.id)).desiredState).toBe("ACTIVE");
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([u]) => new URL(String(u)).pathname === "/access_codes/delete"),
      ).toBe(false);
    });
    it("revoking original access also revokes a pending replacement", async () => {
      createStatus = "set";
      const old = await submit();
      createStatus = "setting";
      const next = await submit("684922", {
        replacesId: old.id,
        version: (await code(old.id)).version,
      });
      await s.revokeCode(manager, old.id, (await code(old.id)).version);
      expect((await code(next.id)).desiredState).toBe("REVOKED");
    });
    it("staff removal atomically queues every assigned code for revocation", async () => {
      const c = await submit();
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
        const e = await tx.employee.findUniqueOrThrow({ where: { id: staff } });
        await tx.user.update({ where: { id: e.userId }, data: { active: false } });
        await s.revokeStaffCodes(tx, staff, owner);
      });
      expect((await code(c.id)).desiredState).toBe("REVOKED");
      await s.refreshDoor(owner, door, tick());
      expect((await code(c.id)).status).toBe("REMOVING");
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([u]) => new URL(String(u)).pathname === "/access_codes/delete"),
      ).toBe(true);
    });
    it("uses a shared refresh cooldown, records sanitized failure and never mutates from reads", async () => {
      const c = await submit();
      await s.refreshDoor(owner, door, tick());
      const calls = vi.mocked(fetch).mock.calls.length;
      await s.refreshDoor(manager, door, new Date());
      await s.doorOverview(manager);
      expect(fetch).toHaveBeenCalledTimes(calls);
      vi.mocked(fetch).mockRejectedValue(new Error("secret 684921"));
      expect(await s.runDoorAccess(tick())).toMatchObject({ failed: 1 });
      const d = await s.doorOverview(owner);
      expect(d.doors[0].failure).toContain("incomplete");
      expect(JSON.stringify(d)).not.toContain("684921");
      expect((await code(c.id)).status).not.toBe("REVOKED");
    });
    it("requires bounded temporary windows, confirms scheduling and retains 15-item pages", async () => {
      await expect(request("684921", { employeeId: "" })).rejects.toThrow("start");
      const start = new Date(Date.now() + 3600000),
        end = new Date(Date.now() + 7200000);
      const local = (d: Date) =>
        new Intl.DateTimeFormat("sv-SE", {
          timeZone: "America/New_York",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
          .format(d)
          .replace(" ", "T");
      const c = await submit("684921", {
        employeeId: "",
        label: "Plumber",
        startsAt: local(start),
        endsAt: local(end),
      });
      remote[0].is_scheduled_on_device = true;
      remote[0].status = "unset";
      await s.refreshDoor(owner, door, tick());
      expect((await code(c.id)).status).toBe("SCHEDULED");
      for (let i = 0; i < 15; i++) await request(String(700000 + i));
      expect((await s.doorOverview(owner)).codes).toHaveLength(15);
      expect((await s.doorOverview(owner, 2)).codes).toHaveLength(1);
      expect((await s.doorOverview(owner)).events).toHaveLength(15);
    });
    it("confirms native expiration even when its removal event predates the next worker check", async () => {
      const local = (d: Date) =>
        new Intl.DateTimeFormat("sv-SE", {
          timeZone: "America/New_York",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
          .format(d)
          .replace(" ", "T");
      const start = new Date(Date.now() + 3600000),
        end = new Date(Date.now() + 7200000);
      const c = await submit("684921", {
        employeeId: "",
        label: "Scheduled vendor",
        startsAt: local(start),
        endsAt: local(end),
      });
      const stored = await code(c.id);
      const providerId = remote[0].access_code_id;
      remote = [];
      events = [
        {
          device_id: deviceId,
          access_code_id: providerId,
          event_type: "access_code.removed_from_device",
          occurred_at: new Date(stored.endsAt!.getTime() + 1).toISOString(),
        },
      ];
      await s.refreshDoor(owner, door, new Date(stored.endsAt!.getTime() + 60000));
      expect((await code(c.id)).status).toBe("REVOKED");
    });
    it("leaves existing saved state available without integration credentials", async () => {
      await submit();
      vi.stubEnv("SEAM_API_KEY", "");
      expect(await s.runDoorAccess()).toMatchObject({ configured: false });
      const read = await s.doorOverview(owner);
      expect(read.configured).toBe(false);
      expect(read.codes).toHaveLength(1);
      await s.revokeCode(manager, read.codes[0].id, read.codes[0].version);
      expect((await code(read.codes[0].id)).status).toBe("REMOVING");
    });
  },
);
