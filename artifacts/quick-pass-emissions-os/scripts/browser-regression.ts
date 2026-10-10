import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { request } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, chmod, access } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { assertCompleteReport, assertOwnedDatabase } from "./e2e-safety.mjs";
import { navigationFixtures } from "./navigation-fixtures";
import { stationBrowserFixture } from "./station-browser-fixtures";
import { performanceBrowserFixtures } from "./performance-browser-fixtures";

const app = process.cwd();
let server: ChildProcess | undefined;
let tests: ChildProcess | undefined;
let temporary: string | undefined;
let cache: string | undefined;
let db: PrismaClient | undefined;
let originalTypes: string | undefined;
let originalConfig: string | undefined;
let interrupted = false;
let stage = "isolation and preview-port preflight";
const stop = (child?: ChildProcess) => {
  if (child?.pid && child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* Already stopped. */
    }
  }
};
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    interrupted = true;
    stop(tests);
    stop(server);
  });
}
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort(port: number) {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () =>
      reject(new Error("Pause the managed web workflow before running browser verification.")),
    );
    probe.listen(port, "0.0.0.0", () => probe.close(() => resolve()));
  });
}
async function privatePort() {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") return reject(new Error("No private port."));
      probe.close(() => resolve(address.port));
    });
  });
}
function start(command: string, args: string[], env: NodeJS.ProcessEnv) {
  // Never relay framework, request, or Playwright logs that might contain auth state.
  const child = spawn(command, args, {
    cwd: app,
    env,
    detached: true,
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    // Classify in memory; no raw framework/driver response is saved or relayed.
    const text = chunk.toString();
    for (const [fragment, label] of [
      ["Invalid Server Actions request", "Server action origin validation rejected the request."],
      ["PrismaClient", "Database operation failed in the private preview."],
      ["File is not defined", "Private preview lacks File decoding support."],
    ])
      if (text.includes(fragment)) console.error(label);
  });
  child.on("error", () => {
    interrupted = true;
  });
  return child;
}
async function halt(child?: ChildProcess) {
  stop(child);
  for (let n = 0; child?.exitCode === null && child.signalCode === null && n < 50; n++)
    await delay(100);
  if (child?.pid) {
    // Kill surviving descendants in this runner-owned process group, never another service.
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      /* Group already gone. */
    }
  }
}

async function main() {
  assertOwnedDatabase(process.env);
  const definition = await readFile(path.join(app, ".replit-artifact/artifact.toml"), "utf8");
  const direct = process.env.E2E_DIRECT === "1";
  const port = direct
    ? await privatePort()
    : Number(definition.match(/localPort\s*=\s*(\d+)/)?.[1]);
  if (!port || (!direct && process.env.PORT && Number(process.env.PORT) !== port)) {
    throw new Error("Browser server must use the registered preview service port.");
  }
  const domain = process.env.REPLIT_DEV_DOMAIN!;
  if (!direct && !/^[a-z0-9.-]+\.replit\.dev$/i.test(domain))
    throw new Error("A Replit development preview domain is required.");
  const baseURL = direct ? `http://127.0.0.1:${port}` : `https://${domain}`;
  await freePort(port);
  stage = "private fixture setup";
  temporary = await mkdtemp(path.join(os.tmpdir(), "quick-pass-browser-"));
  await chmod(temporary, 0o700);
  cache = `.next-e2e-${randomUUID()}`;
  originalTypes = await readFile(path.join(app, "next-env.d.ts"), "utf8");
  originalConfig = await readFile(path.join(app, "tsconfig.json"), "utf8");
  const state = path.join(temporary, "session.json");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "development",
    PORT: String(port),
    BETTER_AUTH_URL: baseURL,
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    E2E_NEXT_DIST_DIR: cache,
    E2E_BASE_URL: baseURL,
    E2E_PRIVATE_DIR: temporary,
    E2E_STORAGE_STATE: state,
    ...(process.env.E2E_IMPORT_ONLY === "1"
      ? { DATA_BACKUP_DIR: path.join(temporary, "backups") }
      : {}),
    // NixOS workspace Chromium; other machines may use Playwright's installed browser.
    E2E_CHROMIUM_PATH: process.env.E2E_CHROMIUM_PATH ?? "/repl/tools/bin/chromium",
    ...(process.env.E2E_STATION_HISTORY === "1" ? { GA_STATION_ID: "SYNTHETIC" } : {}),
  };
  db = new PrismaClient();
  stage = "owned owner creation";
  const email = `regression-${randomUUID()}@example.test`;
  const password = randomBytes(32).toString("base64url");
  const user = await db.user.create({
    data: { name: "Regression Owner", email, role: "OWNER", emailVerified: true },
  });
  stage = "owned credential setup";
  await db.account.create({
    data: {
      id: randomUUID(),
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await hashPassword(password),
    },
  });
  stage = "owned navigation fixtures";
  const fixtures = await navigationFixtures(db, password, user.id, (value) => {
    stage = value;
  });
  if (process.env.E2E_PORTAL_LIVE !== "1") {
    stage = "owned performance cache fixtures";
    env.GA_STATION_ID = process.env.E2E_STATION_HISTORY === "1" ? "SYNTHETIC" : "PERFORMANCE_FIXTURE";
    env.GA_DASHBOARD_USERNAME = "";
    env.GA_DASHBOARD_PASSWORD = "";
    await performanceBrowserFixtures(db, user.id, env.GA_STATION_ID);
  }
  stage = "owned station fixture configuration";
  const station =
    process.env.E2E_STATION_HISTORY === "1"
      ? await stationBrowserFixture(db, user.id, temporary)
      : undefined;
  stage = "owned import continuation fixture";
  const businessImport =
    process.env.E2E_IMPORT_REMAINDER === "1" && process.env.E2E_IMPORT_ONLY === "1"
      ? await (
          await import("./business-import-browser-fixtures")
        ).businessImportBrowserFixture(user.id, env)
      : undefined;
  server = start(
    "pnpm",
    ["exec", "next", "dev", "--hostname", "0.0.0.0", "--port", String(port)],
    env,
  );
  stage = "isolated preview startup";
  const api = await request.newContext({ baseURL });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120 && !interrupted; attempt++) {
      if (server.exitCode !== null || server.signalCode !== null) break;
      try {
        const response = await api.get("/login", { timeout: 3000 });
        ready = response.status() === 200;
        await response.dispose();
        if (ready) break;
      } catch {
        /* Bounded startup polling; no request/error logging. */
      }
      await delay(500);
    }
    if (!ready || interrupted) throw new Error("Isolated preview server did not become ready.");
    // Native form POST through the real proxy, with cookies so CSRF checks cannot be bypassed.
    // All credentials remain in this process, outside browser snapshots and test reports.
    stage = "native login with stale cookie through preview";
    const login = await api.post("/api/sign-in", {
      form: { email, password },
      maxRedirects: 0,
      headers: {
        Origin: baseURL,
        Cookie: "regression_probe=harmless; better-auth.session_token=stale",
      },
    });
    if (login.status() !== 303 || login.headers().location !== "/dashboard") {
      throw new Error("Native preview sign-in with a stale cookie failed.");
    }
    await login.dispose();
    stage = "native private session usability";
    const dashboard = await api.get("/dashboard", { maxRedirects: 0 });
    if (dashboard.status() !== 200)
      throw new Error("Native sign-in did not create a usable private session.");
    await dashboard.dispose();
    stage = "unrelated-origin rejection";
    const blocked = await api.post("/api/sign-in", {
      form: { email, password },
      maxRedirects: 0,
      headers: { Origin: "https://unrelated.example", Cookie: "regression_probe=harmless" },
    });
    if (blocked.status() !== 303 || blocked.headers().location !== "/login?error=security") {
      throw new Error("Unrelated native login origin was not blocked.");
    }
    await blocked.dispose();
    await api.storageState({ path: state });
    await chmod(state, 0o600);
    console.log(
      "Native preview login and unrelated-origin rejection passed; private session prepared.",
    );
  } finally {
    await api.dispose();
  }
  stage = "private role authentication";
  for (const fixture of fixtures.users) {
    const roleApi = await request.newContext({ baseURL });
    try {
      const response = await roleApi.post("/api/sign-in", {
        form: { email: fixture.email, password },
        maxRedirects: 0,
        headers: { Origin: baseURL },
      });
      if (response.status() !== 303 || response.headers().location !== "/dashboard")
        throw new Error("Private role authentication failed.");
      await response.dispose();
      const statePath = path.join(temporary, `${fixture.role}.json`);
      await roleApi.storageState({ path: statePath });
      await chmod(statePath, 0o600);
    } finally {
      await roleApi.dispose();
    }
  }
  const fixturePath = path.join(temporary, "navigation.json");
  await writeFile(
    fixturePath,
    JSON.stringify({
      baseURL,
      directory: temporary,
      records: fixtures.records,
      station,
      businessImport,
    }),
    { mode: 0o600 },
  );
  if (process.env.E2E_MANUAL_TEST === "1") {
    console.log(`Private navigation preview ready: ${baseURL}`);
    console.log(`Private fixture metadata: ${fixturePath}. Never print session files.`);
    while (!interrupted && server.exitCode === null && server.signalCode === null) {
      try {
        await access(path.join(temporary, "run-tests"));
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await delay(250);
    }
    if (interrupted) throw new Error("Interactive verification stopped before coverage completed.");
    if (server.exitCode !== null || server.signalCode !== null)
      throw new Error("Private navigation preview stopped unexpectedly.");
  }
  if (interrupted) throw new Error("Browser verification interrupted.");
  stage = "signed-in browser navigation and form persistence";
  tests = start("pnpm", ["exec", "playwright", "test"], env);
  const status = await new Promise<number | null>((resolve) => {
    tests!.once("close", resolve);
    tests!.once("error", () => resolve(null));
  });
  const report = JSON.parse(await readFile(path.join(temporary, "report.json"), "utf8"));
  // Emit only test-file line numbers and statuses, never serialized errors or request state.
  function summarize(
    suites: Array<{
      suites?: unknown[];
      specs?: Array<{
        line: number;
        ok: boolean;
        tests?: Array<{
          annotations?: Array<{ type: string; description?: string }>;
          results?: Array<{
            error?: { stack?: string; message?: string; location?: { line?: number } };
            errors?: Array<{ stack?: string; message?: string; location?: { line?: number } }>;
          }>;
        }>;
      }>;
    }>,
  ) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        if (!spec.ok) {
          const result = spec.tests
            ?.flatMap((test) => test.results ?? [])
            .find((result) => result.error || result.errors?.length);
          const error = result?.error ?? result?.errors?.[0];
          const stack = error?.stack || error?.message || "";
          const line =
            error?.location?.line ??
            stack.match(/(?:regression|navigation)\.spec\.ts:(\d+):\d+/)?.[1];
          console.error(
            `Regression check at test line ${Number(spec.line)} failed${line ? ` at assertion line ${Number(line)}` : ""}.`,
          );
          const stages = spec.tests
            ?.flatMap((test) => test.annotations ?? [])
            .filter(
              (a) =>
                a.type === "regression-stage" &&
                [
                  "opening",
                  "form",
                  "form-found",
                  "name",
                  "contact",
                  "phone",
                  "services",
                  "reference",
                  "submit",
                  "confirm",
                  "reload",
                ].includes(a.description ?? ""),
            );
          console.error(
            `Last completed protected-form stage: ${stages?.at(-1)?.description ?? "not recorded"}.`,
          );
          for (const [fragment, diagnosis] of [
            ["waitForResponse", "Protected POST response was not observed."],
            ["toHaveText", "Saved-success confirmation was not observed."],
            ["getByLabel", "A required fixture form field was not found."],
            ["toHaveCount", "Reloaded fixture record was not found uniquely."],
            ["toBe", "Protected POST did not return a successful status."],
          ])
            if (stages?.length && stack.includes(fragment)) console.error(diagnosis);
        }
      }
      summarize((suite.suites ?? []) as Parameters<typeof summarize>[0]);
    }
  }
  summarize(report.suites ?? []);
  if (status !== 0 && process.env.E2E_MANUAL_TEST === "1" && !interrupted) {
    console.error("Incomplete private browser coverage; preview retained for safe diagnosis.");
    while (!interrupted && server.exitCode === null && server.signalCode === null) await delay(250);
  }
  if (status !== 0 || interrupted)
    throw new Error("Signed-in browser regression failed; sensitive diagnostics were not printed.");
  assertCompleteReport(
    report,
    process.env.E2E_SUPPORT_ONLY === "1"
      ? 1
      : process.env.E2E_CERTIFICATES_ONLY === "1"
        ? 4
        : process.env.E2E_IMPORT_ONLY === "1"
          ? 1
          : process.env.E2E_DAY_ONLY === "1"
            ? 1
            : process.env.E2E_STATION_ONLY === "1"
              ? 1
              : process.env.E2E_STATION_HISTORY === "1"
                ? 12
                : 10,
  );
  console.log(
    process.env.E2E_SUPPORT_ONLY === "1"
      ? "Passed: 1 complete Service & Support desktop/mobile flow with directory management, contact history, narrow employee provider association and private role exclusions; no skips."
      : process.env.E2E_CERTIFICATES_ONLY === "1"
        ? "Passed: 4 manual certificate navigation role checks including intercepted new tabs/reopening, same-tab records, desktop/mobile, keyboard and unchanged purchase/stock/alert snapshots; no skips."
        : process.env.E2E_IMPORT_ONLY === "1"
          ? process.env.E2E_IMPORT_REMAINDER === "1"
            ? "Passed: 1 targeted remaining import UI flow including supplier verification/dropdowns, saved staff changes, mobile repeat conflicts and role restrictions; no skips."
            : "Passed: 1 complete owner import desktop/mobile journey including backup, reloads, unknown configuration, verification gates, staff-edit conflicts and role restrictions; no skips."
          : process.env.E2E_DAY_ONLY === "1"
            ? "Passed: 1 daily performance date selection and reload check; no skips."
            : process.env.E2E_STATION_ONLY === "1"
              ? "Passed: 1 targeted station lifecycle check; no skips."
              : process.env.E2E_STATION_HISTORY === "1"
                ? "Passed: 12 signed-in browser checks including daily date selection, station report review, reconciliation, coverage, export and access restrictions; no skips."
                : "Passed: 10 signed-in browser checks, including four-role desktop/mobile navigation, daily performance date selection, return context, history, authorization and vendor persistence; no skips.",
  );
  if (process.env.E2E_MANUAL_TEST === "1") {
    console.log("Private browser checks completed; preview remains available for visual review.");
    while (!interrupted && server.exitCode === null && server.signalCode === null) await delay(250);
    if (!interrupted) throw new Error("Private navigation preview stopped unexpectedly.");
  }
}
main()
  .catch((error: unknown) => {
    // Exceptions from adapters/drivers may contain credentials; emit only a fixed failure.
    console.error(
      `Browser regression failed during ${stage}. Check the owned fixture, available server port and browser. No coverage was counted as passing.`,
    );
    const code = (error as { code?: unknown })?.code;
    if (typeof code === "string" && /^(P\d{4}|ENOENT|EACCES|EADDRINUSE)$/.test(code))
      console.error(`Sanitized failure code: ${code}.`);
    const name = (error as { name?: unknown })?.name;
    if (
      typeof name === "string" &&
      /^(TypeError|PrismaClientValidationError|PrismaClientUnknownRequestError)$/.test(name)
    )
      console.error(`Sanitized failure class: ${name}.`);
    // Local source positions only; never serialize exceptions, URLs or request state.
    if (error instanceof Error) {
      const positions =
        error.stack?.match(
          /(?:src\/modules\/station\/[\w-]+\.ts|scripts\/station-browser-fixtures\.ts):\d+:\d+/g,
        ) ?? [];
      if (positions.length)
        console.error(`Owned station fixture source positions: ${positions.join(", ")}`);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    async function cleanup(work: () => Promise<unknown>) {
      try {
        await work();
      } catch {
        console.error(
          "Runner-owned cleanup failed; no business data or other service was targeted.",
        );
        process.exitCode = 1;
      }
    }
    await cleanup(() => halt(tests));
    await cleanup(() => halt(server));
    await cleanup(async () => db?.$disconnect());
    // Next writes generated type paths in these shared files. Remove only this run's
    // paths; restore exact formatting only if no other semantic edit was made.
    await cleanup(async () => {
      if (!cache || !originalConfig || !originalTypes) return;
      const configFile = path.join(app, "tsconfig.json");
      const config = JSON.parse(await readFile(configFile, "utf8"));
      config.include = config.include.filter((entry: string) => !entry.startsWith(`${cache}/`));
      await writeFile(
        configFile,
        JSON.stringify(config) === JSON.stringify(JSON.parse(originalConfig))
          ? originalConfig
          : JSON.stringify(config, null, 2) + "\n",
      );
      const typesFile = path.join(app, "next-env.d.ts");
      const currentTypes = await readFile(typesFile, "utf8");
      const originalCache = originalTypes.match(/import "\.\/([^/]+)\//)?.[1] ?? ".next";
      await writeFile(typesFile, currentTypes.replaceAll(`./${cache}/`, `./${originalCache}/`));
    });
    await cleanup(async () => {
      if (temporary) await rm(temporary, { recursive: true, force: true });
    });
    await cleanup(async () => {
      if (cache) await rm(path.join(app, cache), { recursive: true, force: true });
    });
    console.log(
      process.exitCode
        ? "Runner-owned cleanup attempted; any cleanup failure is reported above."
        : "Removed only runner-owned browser state and build cache.",
    );
  });
