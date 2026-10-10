import { PrismaClient } from "@prisma/client";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, open, readdir, rename, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { checkStorage, StorageError } from "./storage";

const require = createRequire(path.join(process.cwd(), "package.json"));

export function databaseUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.pathname.length < 2)
      throw new Error();
    return url;
  } catch {
    throw new StorageError("Configure a persistent PostgreSQL DATABASE_URL in server secrets.");
  }
}

// libpq rejects Prisma-only parameters. Keep credentials in the subprocess environment,
// never in its command line, output, manifests or source control.
export function postgresEnvironment(value: string, env: NodeJS.ProcessEnv) {
  const url = databaseUrl(value);
  const clean = { ...env };
  for (const key of Object.keys(clean)) if (key.startsWith("PG")) delete clean[key];
  const connection: Record<string, string> = {
    PGHOST: url.searchParams.get("host") ?? url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  };
  for (const [parameter, variable] of Object.entries({
    sslmode: "PGSSLMODE",
    sslcert: "PGSSLCERT",
    sslkey: "PGSSLKEY",
    sslrootcert: "PGSSLROOTCERT",
    sslcrl: "PGSSLCRL",
    connect_timeout: "PGCONNECT_TIMEOUT",
    application_name: "PGAPPNAME",
    options: "PGOPTIONS",
  })) {
    const value = url.searchParams.get(parameter);
    if (value) connection[variable] = value;
  }
  return { ...clean, ...connection };
}

async function run(command: string, args: string[], env: NodeJS.ProcessEnv, message: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "ignore" });
    child.once("error", () => reject(new StorageError(message)));
    child.once("close", (code) => (code === 0 ? resolve() : reject(new StorageError(message))));
  });
}

function tool(name: string, env: NodeJS.ProcessEnv) {
  return env.PG_TOOLS_BIN ? path.join(env.PG_TOOLS_BIN, name) : name;
}

export async function backupDatabase(value: string, env: NodeJS.ProcessEnv) {
  if (!env.DATA_BACKUP_DIR)
    throw new StorageError("Set DATA_BACKUP_DIR to private, persistent backup storage first.");
  const directory = path.resolve(env.DATA_BACKUP_DIR);
  for (const served of ["public", ".next"]) {
    const relative = path.relative(path.resolve(served), directory);
    if (relative === "" || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)))
      throw new StorageError("Backups must be outside public and application build directories.");
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = `quick-pass-${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID()}.dump`;
  const destination = path.join(directory, filename);
  const partial = `${destination}.partial`;
  const handle = await open(partial, "wx", 0o600);
  await handle.close();
  try {
    await run(
      tool("pg_dump", env),
      ["--format=custom", "--no-owner", "--no-privileges", "--file", partial],
      postgresEnvironment(value, env),
      "Backup failed. Check connectivity, private backup storage and matching PostgreSQL client tools. Migration was not started.",
    );
    if ((await stat(partial)).size < 5) throw new StorageError("Backup archive is empty.");
    await chmod(partial, 0o600);
    const completed = await open(partial, "r+");
    try {
      await completed.sync();
    } finally {
      await completed.close();
    }
    await rename(partial, destination);
    return destination;
  } finally {
    await rm(partial, { force: true });
  }
}

export async function migrateDatabase(client: PrismaClient, env: NodeJS.ProcessEnv) {
  const value = env.DATABASE_URL!;
  databaseUrl(value);
  // When pinned, reject a new/incorrect database before applying any migrations.
  await checkStorage(client, env.EXPECTED_DATABASE_ID, true);
  const [history] = await client.$queryRaw<{ present: boolean }[]>`
    SELECT to_regclass('"_prisma_migrations"') IS NOT NULL AS present
  `;
  const applied = history?.present
    ? await client.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      `
    : [];
  const pending = (
    await readdir(path.join(process.cwd(), "prisma/migrations"), { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .some((entry) => !applied.some((row) => row.migration_name === entry.name));
  if (pending && env.DATA_BACKUP_DIR) {
    await backupDatabase(value, env);
    console.log("Private database backup completed before migration.");
  }
  await run(
    process.execPath,
    [require.resolve("prisma/build/index.js"), "migrate", "deploy"],
    env,
    "Migration failed. Check database connectivity and migration status; do not reset the database.",
  );
  const store = await checkStorage(client, env.EXPECTED_DATABASE_ID);
  console.log(`Persistent storage verified: ${store!.instanceId}.`);
}

export async function restoreDatabase(file: string, env: NodeJS.ProcessEnv) {
  const source = databaseUrl(env.DATABASE_URL);
  const target = databaseUrl(env.RESTORE_DATABASE_URL);
  if (
    source.hostname === target.hostname &&
    source.port === target.port &&
    source.pathname === target.pathname
  )
    throw new StorageError(
      "Restore must use a separate empty database, never the current database.",
    );
  const archive = path.resolve(file);
  const header = await open(archive, "r");
  try {
    const signature = Buffer.alloc(5);
    await header.read(signature, 0, 5, 0);
    if (signature.toString() !== "PGDMP")
      throw new StorageError("Select a PostgreSQL custom-format backup.");
  } finally {
    await header.close();
  }
  const targetUrl = target.toString();
  const client = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const [objects] = await client.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
        AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
    `;
    if (objects.count !== 0n)
      throw new StorageError("Restore target is not empty. Existing data was not changed.");
    await run(
      tool("pg_restore", env),
      [
        "--exit-on-error",
        "--single-transaction",
        "--no-owner",
        "--no-privileges",
        "--dbname",
        decodeURIComponent(target.pathname.slice(1)),
        archive,
      ],
      postgresEnvironment(targetUrl, env),
      "Restore failed and its transaction was rolled back. Check the backup and PostgreSQL client tools.",
    );
  } finally {
    await client.$disconnect();
  }
}
