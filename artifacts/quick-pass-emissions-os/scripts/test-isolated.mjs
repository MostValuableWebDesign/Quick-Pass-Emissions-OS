import { PrismaClient } from "@prisma/client";
import { randomUUID, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import os from "node:os";
import { isolatedDatabaseEnvironment } from "./e2e-safety.mjs";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const original = process.env.DATABASE_URL;
const name = `quick_pass_verify_${randomUUID().replaceAll("-", "")}_test`;
let testUrl = "";
let isolatedEnv;
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
    child =
      script === "test:e2e:owned"
        ? spawn(process.execPath, ["--import", "tsx", "scripts/browser-regression.ts"], {
            cwd: app,
            env,
            stdio: ["ignore", "pipe", "pipe"],
          })
        : spawn("pnpm", ["run", script], { cwd: app, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const receive = (chunk) => {
      output += chunk;
      // The owned browser runner emits sanitized status only; it never relays
      // framework/request logs or cookie state. Interactive readiness cannot
      // wait for the child to exit, otherwise the private preview appears stuck.
      if (script === "test:e2e:owned" && env.E2E_MANUAL_TEST === "1")
        process.stdout.write(redact(chunk));
    };
    child.stdout.on("data", (chunk) => {
      receive(chunk);
    });
    child.stderr.on("data", (chunk) => {
      receive(chunk);
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, output }));
  });
}
let upgradeDir;
let fixture;
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
  if (
    process.env.NODE_ENV === "production" ||
    (!process.env.REPLIT_DEV_DOMAIN && process.env.E2E_DIRECT !== "1") ||
    !original
  ) {
    throw new Error("Isolated verification is restricted to this development workspace.");
  }
  const url = new URL(original);
  url.pathname = `/${name}`;
  testUrl = url.toString();
  isolatedEnv = {
    ...isolatedDatabaseEnvironment(process.env, testUrl),
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  };
  admin = new PrismaClient({ datasources: { db: { url: original } } });
  // The identifier is generated here, never accepted from user input.
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  created = true;
  console.log("Created a separate temporary test database. Business data is not used.");
  if (!browser) {
    // Apply the unchanged Phase 4 baseline first, retain genuine-shaped sentinel snapshots,
    // then upgrade with the additive Phase 5 migration. Never move/remove workspace migrations.
    upgradeDir = await fs.mkdtemp(path.join(os.tmpdir(), "quick-pass-upgrade-"));
    await fs.copyFile(
      path.join(app, "prisma/schema.prisma"),
      path.join(upgradeDir, "schema.prisma"),
    );
    await fs.mkdir(path.join(upgradeDir, "migrations"));
    for (const entry of await fs.readdir(path.join(app, "prisma/migrations"))) {
      if (/^\d{12}_.+$/.test(entry) && entry >= "202610100006_") continue;
      await fs.cp(
        path.join(app, "prisma/migrations", entry),
        path.join(upgradeDir, "migrations", entry),
        { recursive: true },
      );
    }
    const baseline = spawnSync(
      "pnpm",
      ["exec", "prisma", "migrate", "deploy", "--schema", path.join(upgradeDir, "schema.prisma")],
      {
        cwd: app,
        encoding: "utf8",
        env: isolatedEnv,
        maxBuffer: 2000000,
      },
    );
    if (baseline.status !== 0) throw new Error("Isolated baseline migration failed.");
    fixture = new PrismaClient({ datasources: { db: { url: testUrl } } });
    const user = await fixture.user.create({
      data: {
        name: "Migration sentinel owner",
        email: "migration-sentinel@example.test",
        role: "OWNER",
      },
    });
    const employee = await fixture.employee.create({ data: { userId: user.id } });
    const period = await fixture.payrollPeriod.create({
      data: {
        startDate: "2026-01-01",
        endDate: "2026-01-07",
        label: "Migration sentinel",
        createdBy: user.id,
      },
    });
    const payroll = await fixture.payrollDraft.create({
      data: {
        periodId: period.id,
        revision: 1,
        status: "APPROVED",
        preparedBy: user.id,
        totalCents: 1234,
        reviewedBy: "independent-sentinel",
        reviewedAt: new Date("2026-01-08T12:00Z"),
        lines: {
          create: {
            employeeId: employee.id,
            employeeName: "Migration sentinel",
            baseCents: 1234,
            commissionCents: 0,
            totalCents: 1234,
            snapshot: { sentinel: "approved payroll evidence" },
          },
        },
      },
    });
    const dealership = await fixture.dealership.create({
      data: { code: "SENTINEL", name: "Migration sentinel", billingAddress: "Fixture only" },
    });
    const invoice = await fixture.dealerInvoice.create({
      data: {
        number: "SENTINEL",
        dealershipId: dealership.id,
        issueDate: "2026-01-01",
        dueDate: "2026-01-31",
        state: "APPROVED",
        subtotalCents: 1000,
        taxBps: 0,
        taxCents: 0,
        totalCents: 1000,
        snapshot: { sentinel: "immutable approved invoice" },
        notes: "Fixture only",
        createdBy: user.id,
        approvedBy: "independent-sentinel",
        approvedAt: new Date("2026-01-02T12:00Z"),
      },
    });
    const payment = await fixture.dealerPayment.create({
      data: {
        invoiceId: invoice.id,
        date: "2026-01-03",
        amountCents: 1000,
        reference: "sentinel-receipt",
        evidence: "Fixture only",
        createdBy: user.id,
      },
    });
    await fixture.dealerPayment.create({
      data: {
        invoiceId: invoice.id,
        date: "2026-01-04",
        amountCents: -1000,
        reference: "sentinel-reversal",
        evidence: "Fixture only",
        createdBy: user.id,
        reversesId: payment.id,
      },
    });
    const before = JSON.stringify({
      payroll: await fixture.payrollDraft.findUnique({
        where: { id: payroll.id },
        include: { lines: true },
      }),
      invoice: await fixture.dealerInvoice.findUnique({
        where: { id: invoice.id },
        include: { payments: { orderBy: { reference: "asc" } } },
      }),
      employee: employee.id,
    });
    const upgrade = spawnSync("npm", ["run", "db:migrate"], {
      cwd: app,
      encoding: "utf8",
      env: isolatedEnv,
      maxBuffer: 2000000,
    });
    if (upgrade.status !== 0) throw new Error("Isolated Phase 5 upgrade failed.");
    const after = JSON.stringify({
      payroll: await fixture.payrollDraft.findUnique({
        where: { id: payroll.id },
        include: { lines: true },
      }),
      invoice: await fixture.dealerInvoice.findUnique({
        where: { id: invoice.id },
        include: { payments: { orderBy: { reference: "asc" } } },
      }),
      employee: employee.id,
    });
    if (before !== after) throw new Error("Upgrade changed a sentinel snapshot.");
    console.log(
      "Phase 4 → Phase 5 + storage + station history + business import upgrade retained approved payroll, approved invoice and signed reversal sentinel snapshots.",
    );
    await fixture.$disconnect();
  }
  for (const script of ["db:migrate", browser ? "test:e2e:owned" : "test"]) {
    if (interrupted) throw new Error("Isolated verification interrupted.");
    const result = await run(script, {
      ...isolatedEnv,
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
  await fixture?.$disconnect();
  if (upgradeDir) await fs.rm(upgradeDir, { recursive: true, force: true });
}
