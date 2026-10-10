// Private fixture setup only. No credential, session, connection URL or financial payload is printed.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = path.resolve(app, "../../.cache/phase5-browser-fixture.json");
const mode = process.argv[2];
if (
  process.env.NODE_ENV === "production" ||
  !process.env.REPLIT_DEV_DOMAIN ||
  !process.env.DATABASE_URL
)
  throw new Error("Private fixtures require this development workspace.");
const admin = new PrismaClient();
let fixture;
try {
  if (mode === "create") {
    try {
      await fs.access(registry);
      throw new Error("An existing private fixture must be cleaned up first.");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const name = `quick_pass_browser_${randomUUID().replaceAll("-", "")}_test`;
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${name}`;
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    const password = randomBytes(24).toString("base64url"),
      cronSecret = randomBytes(32).toString("hex");
    const configuration = { name, databaseUrl: url.toString(), password, cronSecret };
    await fs.mkdir(path.dirname(registry), { recursive: true });
    await fs.writeFile(registry, JSON.stringify(configuration), { mode: 0o600 });
    const migration = spawnSync("pnpm", ["run", "db:migrate"], {
      cwd: app,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: configuration.databaseUrl },
    });
    if (migration.status !== 0) throw new Error("Private fixture migration failed; run cleanup.");
    fixture = new PrismaClient({ datasources: { db: { url: configuration.databaseUrl } } });
    const hash = await hashPassword(password);
    const ids = {};
    for (const [name, role] of [
      ["owner", "OWNER"],
      ["manager", "ADMIN"],
      ["bookkeeper", "BOOKKEEPER"],
      ["employee", "EMPLOYEE"],
    ]) {
      const user = await fixture.user.create({
        data: {
          name: `Phase 5 Fixture ${name}`,
          email: `phase5-${name}@example.test`,
          role,
          employee: {
            create: {
              demo: true,
              certificationExpires: "2026-01-01",
              managerNotes: "Private fixture management notes",
            },
          },
        },
        include: { employee: true },
      });
      await fixture.account.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: hash,
        },
      });
      ids[name] = user;
    }
    await fixture.businessSetting.create({
      data: { configured: true, operatingDays: [1, 2, 3, 4, 5, 6, 7] },
    });
    const template = await fixture.taskTemplate.create({
      data: {
        title: "Phase 5 Fixture responsibility",
        frequency: "ONCE",
        startDate: "2026-01-01",
        dueTime: "09:00",
        employeeId: ids.employee.employee.id,
      },
    });
    await fixture.taskInstance.createMany({
      data: Array.from({ length: 125 }, (_, i) => ({
        templateId: template.id,
        occurrenceDate: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
        id: `phase5-report-${i}`,
        title: i === 0 ? "=Fixture formula" : "Phase 5 Fixture responsibility",
        description: "Fixture only",
        employeeId: ids.employee.employee.id,
        dueAt: new Date("2026-01-01T14:00Z"),
        priority: "NORMAL",
        reviewRequired: true,
        escalationHours: 0,
        // Different templates are not needed: make the unique calendar date span >100 days.
      })).map((r, i) => ({
        ...r,
        occurrenceDate: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      })),
    });
    const bay = await fixture.carwashBay.create({
      data: { slot: 1, identifier: "Phase 5 Fixture bay", type: "SELF_SERVICE" },
    });
    await fixture.maintenanceTicket.create({
      data: {
        bayId: bay.id,
        title: "Phase 5 Fixture inspection",
        description: "Fixture only",
        priority: "NORMAL",
        assignedId: ids.employee.employee.id,
        targetDate: "2026-01-01",
        dueAt: new Date("2026-01-01T22:00Z"),
        reportedBy: ids.manager.id,
      },
    });
    await fixture.chemicalItem.create({
      data: { name: "Phase 5 Fixture chemical", unit: "ML", reorderPoint: 0 },
    });
    console.log(
      "Private browser database created and migrated. Configuration is in the ignored private registry; do not print its content.",
    );
  } else if (mode === "jobs") {
    const c = JSON.parse(await fs.readFile(registry, "utf8"));
    const run = spawnSync("pnpm", ["run", "jobs"], {
      cwd: app,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: c.databaseUrl },
    });
    if (run.status !== 0) throw new Error("Private fixture job failed.");
    console.log("Private fixture independent jobs completed.");
  } else if (mode === "cleanup") {
    const c = JSON.parse(await fs.readFile(registry, "utf8"));
    if (!/^quick_pass_browser_[a-f0-9]{32}_test$/.test(c.name))
      throw new Error("Invalid private fixture name.");
    await admin.$queryRaw`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=${c.name} AND pid<>pg_backend_pid()`;
    await admin.$executeRawUnsafe(`DROP DATABASE "${c.name}"`);
    await fs.rm(registry);
    console.log("Removed only the private Phase 5 browser database and registry.");
  } else throw new Error("Use create, jobs or cleanup.");
} catch {
  console.error(
    "Private browser fixture operation failed. Inspect code and retry cleanup; no credentials were logged.",
  );
  process.exitCode = 1;
} finally {
  await fixture?.$disconnect();
  await admin.$disconnect();
}
