import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const original = process.env.DATABASE_URL;
const name = `quick_pass_verify_${randomUUID().replaceAll("-", "")}_test`;
let testUrl = "";
let created = false;
let admin;
function redact(value) {
  let text = String(value);
  if (original) text = text.replaceAll(original, "[database URL redacted]");
  if (testUrl) text = text.replaceAll(testUrl, "[database URL redacted]");
  return text.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/g, "[database URL redacted]");
}
try {
  if (process.env.NODE_ENV === "production" || !process.env.REPLIT_DEV_DOMAIN || !original) {
    throw new Error("Isolated verification is restricted to this development workspace.");
  }
  const url = new URL(original);
  url.pathname = `/${name}`;
  testUrl = url.toString();
  admin = new PrismaClient({ datasources: { db: { url: original } } });
  // The identifier is generated here, never accepted from user input.
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  created = true;
  console.log("Created a separate temporary test database. Business data is not used.");
  for (const script of ["db:migrate", "test"]) {
    const result = spawnSync("npm", ["run", script], {
      cwd: app,
      encoding: "utf8",
      maxBuffer: 20_000_000,
      env: {
        ...process.env,
        DATABASE_URL: testUrl,
        TEST_DATABASE_URL: testUrl,
        DANGEROUSLY_ALLOW_GIT: "1",
      },
    });
    console.log(redact(result.stdout || ""));
    if (result.stderr) console.error(redact(result.stderr));
    if (result.status !== 0) throw new Error(`Isolated ${script} failed.`);
  }
} catch (error) {
  console.error(redact(error.message));
  process.exitCode = 1;
} finally {
  if (created && admin) {
    try {
      await admin.$queryRaw`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${name} AND pid <> pg_backend_pid()`;
      await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`);
      console.log("Removed only the temporary test database.");
    } catch {
      console.error("Temporary test database cleanup failed; business data was not touched.");
      process.exitCode = 1;
    }
  }
  await admin?.$disconnect();
}
