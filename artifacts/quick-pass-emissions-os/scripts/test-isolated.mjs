import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const original = process.env.DATABASE_URL;
const name = `quick_pass_verify_${randomUUID().replaceAll("-", "")}_test`;
let testUrl = "";
let created = false;
let admin;
let child;
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    interrupted = true;
    child?.kill("SIGTERM");
  });
}
async function run(script, env) {
  return await new Promise((resolve, reject) => {
    child = script === "test:e2e:owned"
      ? spawn(process.execPath, ["--import", "tsx", "scripts/browser-regression.ts"], {
          cwd: app, env, stdio: ["ignore", "pipe", "pipe"],
        })
      : spawn("pnpm", ["run", script], { cwd: app, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, output }));
  });
}
function redact(value) {
  let text = String(value);
  if (original) text = text.replaceAll(original, "[database URL redacted]");
  if (testUrl) text = text.replaceAll(testUrl, "[database URL redacted]");
  return text.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/g, "[database URL redacted]");
}
try {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--browser") || args.length > 1) {
    throw new Error("Use test:isolated with optional --browser.");
  }
  const browser = args.includes("--browser");
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
  for (const script of ["db:migrate", browser ? "test:e2e:owned" : "test"]) {
    if (interrupted) throw new Error("Isolated verification interrupted.");
    const result = await run(script, {
        ...process.env,
        DATABASE_URL: testUrl,
        TEST_DATABASE_URL: testUrl,
        E2E_OWNED_DATABASE: browser ? name : "",
        DANGEROUSLY_ALLOW_GIT: "1",
    });
    console.log(redact(result.output));
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
