import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backupDatabase, migrateDatabase, restoreDatabase } from "../src/lib/database-maintenance";
import { checkStorage } from "../src/lib/storage";

const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Storage fixtures require an isolated _test database.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

(enabled ? describe : describe.skip)("Durable PostgreSQL storage and recovery", () => {
  let db: PrismaClient;
  let restored: PrismaClient;
  let temporary: string;
  let ownerId: string;
  let status: typeof import("../src/modules/storage/service").storageStatus;
  const restoreName = `quick_pass_restore_${randomUUID().replaceAll("-", "")}_test`;
  let created = false;
  let env: NodeJS.ProcessEnv;

  // Compare every table (including frozen snapshots, credentials, history and migration
  // metadata), but expose only a digest if an assertion fails.
  async function digest(client: PrismaClient) {
    const tables = await client.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    const hash = createHash("sha256");
    for (const { tablename } of tables) {
      const quoted = tablename.replaceAll('"', '""');
      const [row] = await client.$queryRawUnsafe<{ data: string }[]>(
        `SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb)::text AS data FROM "${quoted}" t`,
      );
      hash.update(tablename).update(row.data);
    }
    return hash.digest("hex");
  }

  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    status = (await import("../src/modules/storage/service")).storageStatus;
    temporary = await mkdtemp(path.join(os.tmpdir(), "quick-pass-storage-"));
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.pathname = `/${restoreName}`;
    env = {
      ...process.env,
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      RESTORE_DATABASE_URL: url.toString(),
      DATA_BACKUP_DIR: temporary,
      EXPECTED_DATABASE_ID: "",
    };
    await db.$executeRawUnsafe(`CREATE DATABASE "${restoreName}"`);
    created = true;
    restored = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    const owner = await db.user.create({
      data: { name: "Storage fixture owner", email: `${randomUUID()}@example.test`, role: "OWNER" },
    });
    ownerId = owner.id;
    await db.employee.create({
      data: { userId: ownerId, managerNotes: "Retained storage fixture" },
    });
    await db.auditLog.create({
      data: { actorId: ownerId, entityId: ownerId, action: "STORAGE_FIXTURE", details: {} },
    });
  });

  afterAll(async () => {
    await restored?.$disconnect();
    if (created) await db.$executeRawUnsafe(`DROP DATABASE "${restoreName}"`);
    if (temporary) await rm(temporary, { recursive: true, force: true });
    await db?.$disconnect();
  });

  it("retains identity and all rows through repeat migrations and a new connection", async () => {
    const before = await digest(db);
    const store = await checkStorage(db, undefined);
    await migrateDatabase(db, { ...env, EXPECTED_DATABASE_ID: store!.instanceId });
    const fresh = new PrismaClient();
    try {
      expect((await checkStorage(fresh, store!.instanceId))?.instanceId).toBe(store!.instanceId);
      expect(await digest(fresh)).toBe(before);
    } finally {
      await fresh.$disconnect();
    }
  });

  it("blocks the wrong database pin before applying migrations or changing data", async () => {
    const before = await digest(db);
    await expect(
      migrateDatabase(db, { ...env, EXPECTED_DATABASE_ID: randomUUID() }),
    ).rejects.toThrow("Storage identity does not match");
    expect(await digest(db)).toBe(before);
    await expect(checkStorage(restored, randomUUID(), true)).rejects.toThrow(
      "Storage identity is missing",
    );
    expect(await checkStorage(restored, undefined, true)).toBeNull();
  });

  it("rechecks owner role and activation before exposing storage counts", async () => {
    expect((await status(ownerId)).auditEntries).toBeGreaterThan(0);
    for (const role of ["ADMIN", "BOOKKEEPER", "EMPLOYEE"] as const) {
      await db.user.update({ where: { id: ownerId }, data: { role } });
      await expect(status(ownerId)).rejects.toThrow("Only an active owner");
    }
    await db.user.update({ where: { id: ownerId }, data: { role: "OWNER", active: false } });
    await expect(status(ownerId)).rejects.toThrow("Only an active owner");
    await db.user.update({ where: { id: ownerId }, data: { active: true } });
  });

  it("backs up an existing release before upgrading and stops the upgrade if its backup fails", async () => {
    const name = `quick_pass_upgrade_${randomUUID().replaceAll("-", "")}_test`;
    const url = new URL(env.DATABASE_URL!);
    url.pathname = `/${name}`;
    const baseline = path.join(temporary, "baseline");
    await mkdir(path.join(baseline, "migrations"), { recursive: true });
    await cp("prisma/schema.prisma", path.join(baseline, "schema.prisma"));
    for (const migration of await readdir("prisma/migrations")) {
      if (!migration.startsWith("202610100007"))
        await cp(
          path.join("prisma/migrations", migration),
          path.join(baseline, "migrations", migration),
          { recursive: true },
        );
    }
    const upgradeEnv = {
      ...env,
      DATABASE_URL: url.toString(),
      DATA_BACKUP_DIR: path.join(temporary, "upgrade-backups"),
    };
    await db.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    const client = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    try {
      const require = createRequire(path.join(process.cwd(), "package.json"));
      const migration = spawnSync(
        process.execPath,
        [
          require.resolve("prisma/build/index.js"),
          "migrate",
          "deploy",
          "--schema",
          path.join(baseline, "schema.prisma"),
        ],
        { env: upgradeEnv, stdio: "ignore" },
      );
      expect(migration.status).toBe(0);
      const user = await client.user.create({
        data: {
          name: "Prior release fixture",
          email: `${randomUUID()}@example.test`,
          role: "OWNER",
          employee: { create: { managerNotes: "Retain original profile" } },
        },
        include: { employee: true },
      });
      await client.auditLog.create({
        data: {
          actorId: user.id,
          entityId: user.id,
          action: "UPGRADE_FIXTURE",
          details: { retained: true },
        },
      });
      await expect(
        migrateDatabase(client, {
          ...upgradeEnv,
          PG_TOOLS_BIN: path.join(temporary, "missing-tools"),
        }),
      ).rejects.toThrow("Backup failed");
      expect(
        (
          await client.$queryRaw<
            { present: boolean }[]
          >`SELECT to_regclass('"DataStore"') IS NOT NULL AS present`
        )[0].present,
      ).toBe(false);
      expect(
        await client.user.findUnique({ where: { id: user.id }, include: { employee: true } }),
      ).toEqual(user);
      await migrateDatabase(client, upgradeEnv);
      expect((await checkStorage(client, undefined))?.instanceId).toMatch(/^[0-9a-f-]{36}$/);
      expect(
        await client.user.findUnique({ where: { id: user.id }, include: { employee: true } }),
      ).toEqual(user);
      expect(await client.auditLog.count()).toBe(1);
      expect(await readdir(upgradeEnv.DATA_BACKUP_DIR)).toHaveLength(1);
      await migrateDatabase(client, upgradeEnv);
      expect(await readdir(upgradeEnv.DATA_BACKUP_DIR)).toHaveLength(1);
    } finally {
      await client.$disconnect();
      await db.$executeRawUnsafe(`DROP DATABASE "${name}"`);
    }
  });

  it("writes a private complete backup and restores all tables into a separate empty database", async () => {
    const before = await digest(db);
    const file = await backupDatabase(env.DATABASE_URL!, env);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await expect(
      restoreDatabase(file, { ...env, RESTORE_DATABASE_URL: env.DATABASE_URL }),
    ).rejects.toThrow("separate empty database");
    await restoreDatabase(file, env);
    expect(await digest(restored)).toBe(before);
    expect(await digest(db)).toBe(before);
    await expect(restoreDatabase(file, env)).rejects.toThrow("not empty");
    expect(await digest(restored)).toBe(before);
  });

  it("cleans incomplete backups and rejects invalid archives without changing stored records", async () => {
    const before = await digest(db);
    await expect(
      backupDatabase(env.DATABASE_URL!, {
        ...env,
        PG_TOOLS_BIN: path.join(temporary, "missing-tools"),
      }),
    ).rejects.toThrow("Backup failed");
    expect((await readdir(temporary)).some((file) => file.endsWith(".partial"))).toBe(false);
    const invalid = path.join(temporary, "invalid.dump");
    await writeFile(invalid, "invalid", { mode: 0o600 });
    await expect(restoreDatabase(invalid, env)).rejects.toThrow("custom-format backup");
    expect(await digest(db)).toBe(before);
  });
});
