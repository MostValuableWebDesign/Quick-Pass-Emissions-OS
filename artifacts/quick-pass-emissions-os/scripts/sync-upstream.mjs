import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const statePath = path.join(app, ".upstream.json");
const protectedFiles = new Set([
  ".replit", ".gitignore", "package.json", "package-lock.json",
  "next.config.ts", "tsconfig.json",
]);

async function readOptional(file) {
  try { return await fs.readFile(file); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function same(a, b) {
  return a === null ? b === null : b !== null && a.equals(b);
}

async function safeDestination(name) {
  if (!name || path.isAbsolute(name) || name.split("/").some(p => p === ".." || p === "")) {
    throw new Error("Unsafe upstream path; import stopped.");
  }
  const allowed = /^(src|prisma|scripts|tests|public|docs)\//.test(name)
    || /^[A-Za-z0-9_-]+\.md$/.test(name)
    || [".env.example", ".prettierignore", ".prettierrc.json", "components.json",
      "eslint.config.mjs", "next-env.d.ts", "playwright.config.ts",
      "postcss.config.mjs", "vitest.config.ts"].includes(name)
    || protectedFiles.has(name);
  if (!allowed) throw new Error(`New unsupported upstream path needs manual review: ${name}`);
  const destination = path.resolve(app, name);
  let current = app;
  for (const part of name.split("/")) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch(error => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw new Error(`Symlink needs manual review: ${name}`);
  }
  return destination;
}

async function atomicWrite(file, content, mode = 0o644) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.upstream-${randomUUID()}`;
  try {
    await fs.writeFile(temporary, content, { mode });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}

async function main() {
  const args = process.argv.slice(2);
  const revisionArg = args.find(arg => arg.startsWith("--revision="));
  const revision = revisionArg?.slice("--revision=".length);
  if (args.some(arg => !["--check", "--apply"].includes(arg) && !arg.startsWith("--revision="))
    || args.filter(arg => arg.startsWith("--revision=")).length > 1
    || (revision !== undefined && !/^[a-f0-9]{40}$/.test(revision))
    || (args.includes("--check") && args.includes("--apply"))) {
    throw new Error("Use --check, or --apply --revision=<40-character reviewed commit>.");
  }
  const apply = args.includes("--apply");
  if (apply && !revision) throw new Error("Apply requires --revision=<commit shown by the preview>. Review first.");
  const state = JSON.parse(await fs.readFile(statePath, "utf8"));
  if (!/^[a-f0-9]{40}$/.test(state.baseline)
    || !/^[A-Za-z0-9_-]+$/.test(state.remote)
    || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(state.branch)
    || state.branch.includes("..")) throw new Error("Invalid upstream configuration.");
  const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: app, encoding: "utf8" }).trim();
  function git(args, options = {}) {
    try { return execFileSync("git", args, { cwd: repo, maxBuffer: 20_000_000, stdio: ["ignore", "pipe", "pipe"], ...options }); }
    catch { throw new Error(`Git operation failed (${args[0]}). No project files were imported.`); }
  }
  const actualRemote = git(["remote", "get-url", state.remote]).toString().trim();
  if (actualRemote !== state.repository) throw new Error("Remote URL changed; review .upstream.json before updating.");
  // Fetch only updates remote references. Never merge, reset, rebase, commit or push.
  git(["fetch", "--no-tags", state.remote, state.branch], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", DANGEROUSLY_ALLOW_GIT: "1" },
  });
  const fetched = git(["rev-parse", `refs/remotes/${state.remote}/${state.branch}`]).toString().trim();
  const latest = revision || fetched;
  git(["merge-base", "--is-ancestor", latest, fetched]);
  git(["merge-base", "--is-ancestor", state.baseline, latest]);
  const changes = git(["diff", "--no-renames", "--name-status", "-z", state.baseline, latest])
    .toString().split("\0").filter(Boolean);
  const plan = [];
  const problems = [];
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "quick-pass-sync-"));
  function blob(revision, name) {
    const entry = git(["ls-tree", "-z", revision, "--", name]).toString();
    if (!entry) return null;
    if (!/^100(644|755) blob /.test(entry)) throw new Error(`Nonregular upstream file needs manual review: ${name}`);
    return git(["show", `${revision}:${name}`]);
  }
  try {
    for (let index = 0; index < changes.length; index += 2) {
      const status = changes[index];
      const name = changes[index + 1];
      const destination = await safeDestination(name);
      if (protectedFiles.has(name)
        || (name.startsWith("prisma/migrations/") && status !== "A")) {
        problems.push(`${name}: protected configuration or existing migration; manual review required`);
        continue;
      }
      const base = blob(state.baseline, name);
      const remote = blob(latest, name);
      const local = await readOptional(destination);
      let content = remote;
      if (same(local, remote)) content = local;
      else if (!same(local, base)) {
        if (!base || !local || !remote) {
          problems.push(`${name}: local addition/deletion conflicts with upstream`);
          continue;
        }
        const filenames = ["local", "base", "remote"].map(p => path.join(temp, p));
        await Promise.all([local, base, remote].map((buffer, i) => fs.writeFile(filenames[i], buffer)));
        const merged = spawnSync("git", ["merge-file", "-p", ...filenames], { maxBuffer: 20_000_000 });
        if (merged.status !== 0) {
          problems.push(`${name}: overlapping edits need manual resolution`);
          continue;
        }
        content = merged.stdout;
      }
      if (!same(local, content)) {
        const stat = await fs.stat(destination).catch(() => null);
        const mode = remote && git(["ls-tree", latest, "--", name]).toString().startsWith("100755") ? 0o755 : 0o644;
        plan.push({ name, destination, content, original: local, originalMode: stat?.mode, mode });
      }
    }
    console.log(`${apply ? "Apply" : "Preview"}: ${plan.length} mapped file changes; ${problems.length} blockers.`);
    console.log(`Reviewed revision: ${latest}`);
    for (const item of plan) console.log(`${item.content === null ? "DELETE" : item.original === null ? "ADD" : "UPDATE"} ${item.name}`);
    if (problems.length) throw new Error(`Nothing imported:\n${problems.join("\n")}`);
    if (!apply) {
      console.log(`No app files changed. After review, use --apply --revision=${latest}`);
      return;
    }
    const applied = [];
    try {
      for (const item of plan) {
        applied.push(item);
        if (item.content === null) await fs.rm(item.destination);
        else await atomicWrite(item.destination, item.content, item.mode);
      }
      await atomicWrite(statePath, JSON.stringify({ ...state, baseline: latest }, null, 2) + "\n");
    } catch (error) {
      for (const item of applied.reverse()) {
        if (item.original === null) await fs.rm(item.destination, { force: true });
        else await atomicWrite(item.destination, item.original, item.originalMode);
      }
      throw error;
    }
    console.log("Import complete. Review the diff, regenerate Prisma, apply reviewed DEVELOPMENT migrations, and verify the app. Nothing pushed.");
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
