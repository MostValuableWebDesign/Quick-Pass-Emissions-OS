import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import os from "node:os";

let temporary: string, remote: string, wrapper: string, app: string, baseline: string;
const env = { ...process.env, DANGEROUSLY_ALLOW_GIT: "1" };
function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function write(root: string, name: string, content: string) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function commit() {
  git(remote, "add", ".");
  git(remote, "commit", "-m", "Fixture update");
  return git(remote, "rev-parse", "HEAD");
}
function run(...args: string[]) {
  return spawnSync(process.execPath, [path.join(app, "scripts/sync-upstream.mjs"), ...args], {
    cwd: wrapper,
    env,
    encoding: "utf8",
  });
}

beforeEach(() => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), "upstream-fixture-"));
  remote = path.join(temporary, "remote");
  wrapper = path.join(temporary, "wrapper");
  app = path.join(wrapper, "artifacts/app");
  fs.mkdirSync(remote);
  fs.mkdirSync(wrapper);
  git(remote, "init", "-b", "main");
  git(remote, "config", "user.name", "Fixture");
  git(remote, "config", "user.email", "fixture@example.invalid");
  write(remote, "src/feature.txt", "baseline\n");
  write(remote, "package.json", '{"name":"original"}\n');
  baseline = commit();
  git(wrapper, "init", "-b", "main");
  git(wrapper, "remote", "add", "origin", remote);
  write(app, "src/feature.txt", "baseline\n");
  write(app, "src/local-fix.txt", "preserve this\n");
  write(app, "package.json", '{"name":"adapted"}\n');
  write(
    app,
    ".upstream.json",
    JSON.stringify({ repository: remote, remote: "origin", branch: "main", baseline }),
  );
  write(app, "scripts/sync-upstream.mjs", fs.readFileSync("scripts/sync-upstream.mjs", "utf8"));
});
afterEach(() => fs.rmSync(temporary, { recursive: true, force: true }));

describe("Mapped upstream updates", () => {
  it("previews without writing, then imports only a pinned reviewed snapshot", () => {
    write(remote, "src/feature.txt", "upstream\n");
    const reviewed = commit();
    expect(run("--check").status).toBe(0);
    expect(fs.readFileSync(path.join(app, "src/feature.txt"), "utf8")).toBe("baseline\n");
    write(remote, "src/feature.txt", "later unreviewed update\n");
    commit();
    expect(run("--apply", `--revision=${reviewed}`).status).toBe(0);
    expect(fs.readFileSync(path.join(app, "src/feature.txt"), "utf8")).toBe("upstream\n");
    expect(fs.readFileSync(path.join(app, "src/local-fix.txt"), "utf8")).toBe("preserve this\n");
  });

  it("stops all writes when any local edit conflicts", () => {
    write(app, "src/feature.txt", "local change\n");
    write(remote, "src/feature.txt", "remote change\n");
    write(remote, "src/new.txt", "new file\n");
    const result = run("--apply", `--revision=${commit()}`);
    expect(result.status).toBe(1);
    expect(fs.existsSync(path.join(app, "src/new.txt"))).toBe(false);
    expect(fs.readFileSync(path.join(app, "src/feature.txt"), "utf8")).toBe("local change\n");
    expect(JSON.parse(fs.readFileSync(path.join(app, ".upstream.json"), "utf8")).baseline).toBe(
      baseline,
    );
  });

  it("merges nonoverlapping local and upstream changes", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n") + "\n";
    write(remote, "src/feature.txt", lines);
    baseline = commit();
    write(
      app,
      ".upstream.json",
      JSON.stringify({ repository: remote, remote: "origin", branch: "main", baseline }),
    );
    write(app, "src/feature.txt", lines.replace("line 0\n", "local fix\n"));
    write(remote, "src/feature.txt", lines.replace("line 19\n", "upstream fix\n"));
    expect(run("--apply", `--revision=${commit()}`).status).toBe(0);
    const merged = fs.readFileSync(path.join(app, "src/feature.txt"), "utf8");
    expect(merged).toContain("local fix\n");
    expect(merged).toContain("upstream fix\n");
  });

  it("refuses automatic replacement of adapted configuration", () => {
    write(remote, "package.json", '{"name":"new-config"}\n');
    expect(run("--apply", `--revision=${commit()}`).status).toBe(1);
    expect(fs.readFileSync(path.join(app, "package.json"), "utf8")).toBe('{"name":"adapted"}\n');
  });

  it("requires an explicit reviewed revision before applying", () => {
    expect(run("--apply").status).toBe(1);
    expect(fs.readFileSync(path.join(app, "src/feature.txt"), "utf8")).toBe("baseline\n");
  });
});
