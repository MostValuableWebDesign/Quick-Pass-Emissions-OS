import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ReplitConnectors } from "@replit/connectors-sdk";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const repo = "/repos/MostValuableWebDesign/Quick-Pass-Emissions-OS";
const remoteUrl =
  "https://github.com/MostValuableWebDesign/Quick-Pass-Emissions-OS.git";
function git(...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 30_000_000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
export function commitPayload(raw) {
  const split = raw.indexOf("\n\n");
  if (split < 0) throw new Error("Invalid Git commit.");
  const headers = raw.slice(0, split).split("\n");
  if (headers.some((line) => !/^(tree|parent|author|committer) /.test(line)))
    throw new Error(
      "Custom or signed commits require native Git; no history rewritten.",
    );
  const identity = (kind) => {
    const value = headers.find((line) => line.startsWith(`${kind} `));
    const match = value?.match(/^\w+ (.+) <([^>]+)> (\d+) ([+-]\d{4})$/);
    if (!match || match[4] !== "+0000")
      throw new Error(
        "This safe API bridge supports unsigned UTC commits only.",
      );
    return {
      name: match[1],
      email: match[2],
      date: new Date(Number(match[3]) * 1000).toISOString(),
    };
  };
  const message = raw.slice(split + 2);
  if (!message.endsWith("\n"))
    throw new Error("Unsupported Git message format.");
  return {
    tree: headers.find((line) => line.startsWith("tree ")).slice(5),
    parents: headers
      .filter((line) => line.startsWith("parent "))
      .map((line) => line.slice(7)),
    author: identity("author"),
    committer: identity("committer"),
    message: message.slice(0, -1),
  };
}
export function isUtf8(buffer) {
  return (
    !buffer.includes(0) && Buffer.from(buffer.toString("utf8")).equals(buffer)
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length > 1 ||
    args.some((arg) => !["--check", "--apply"].includes(arg))
  )
    throw new Error(
      "Use --check (default), or --apply to upload committed changes.",
    );
  if (
    git("branch", "--show-current") !== "main" ||
    git("remote", "get-url", "origin") !== remoteUrl
  )
    throw new Error(
      "Expected this repository's main branch and configured GitHub origin.",
    );
  if (git("status", "--porcelain"))
    throw new Error(
      "Review and commit all source changes before synchronizing.",
    );
  const target = git("rev-parse", "HEAD");
  const connectors = new ReplitConnectors();
  const api = async (suffix, method = "GET", body) => {
    const response = await connectors.proxy("github", repo + suffix, {
      method,
      ...(body === undefined ? {} : { body }),
    });
    if (!response.ok)
      throw new Error(
        `GitHub ${method} ${suffix}: HTTP ${response.status}. Main not force-updated.`,
      );
    return response.json();
  };
  const ref = await api("/git/ref/heads/main");
  const before = ref.object.sha;
  try {
    git("merge-base", "--is-ancestor", before, target);
  } catch {
    throw new Error(
      "Fetch, review and merge GitHub main first. No remote branch changed.",
    );
  }
  const commits = git(
    "rev-list",
    "--reverse",
    "--topo-order",
    target,
    "--not",
    before,
  )
    .split("\n")
    .filter(Boolean);
  console.log(
    `GitHub main: ${before}; local main: ${target}; ${commits.length} committed changes to upload.`,
  );
  if (!args.includes("--apply") || !commits.length) return;
  // Preflight every commit before uploading any objects.
  const payloads = new Map(
    commits.map((sha) => [
      sha,
      commitPayload(
        execFileSync("git", ["cat-file", "commit", sha], {
          cwd: root,
          encoding: "utf8",
        }),
      ),
    ]),
  );
  const known = new Set(
    git("rev-list", "--objects", before)
      .split("\n")
      .map((line) => line.split(" ")[0]),
  );
  const knownTrees = new Set(known);
  for (const [sha, payload] of payloads) {
    if (!knownTrees.has(payload.tree)) {
      const entries = execFileSync("git", ["ls-tree", "-rz", sha], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 30_000_000,
      })
        .split("\0")
        .filter(Boolean)
        .map((line) => {
          const tab = line.indexOf("\t"),
            [mode, type, blob] = line.slice(0, tab).split(" ");
          return { path: line.slice(tab + 1), mode, type, sha: blob };
        });
      const tree = [];
      for (const entry of entries) {
        if (entry.type !== "blob" || known.has(entry.sha)) {
          tree.push(entry);
          continue;
        }
        const bytes = execFileSync("git", ["cat-file", "blob", entry.sha], {
          cwd: root,
          maxBuffer: 100_000_000,
        });
        if (isUtf8(bytes)) {
          tree.push({
            path: entry.path,
            mode: entry.mode,
            type: "blob",
            content: bytes.toString("utf8"),
          });
        } else {
          const blob = await api("/git/blobs", "POST", {
            content: bytes.toString("base64"),
            encoding: "base64",
          });
          if (blob.sha !== entry.sha)
            throw new Error(
              "GitHub blob identity mismatch; branch not changed.",
            );
          known.add(blob.sha);
          tree.push(entry);
        }
      }
      // No base_tree: recreate this exact complete tree, including removals.
      const created = await api("/git/trees", "POST", { tree });
      if (created.sha !== payload.tree)
        throw new Error("GitHub tree identity mismatch; branch not changed.");
      entries.forEach((entry) => known.add(entry.sha));
      knownTrees.add(payload.tree);
    }
    let created = await api("/git/commits", "POST", payload);
    if (created.sha !== sha) {
      // API deployments differ in whether they append a terminal newline.
      created = await api("/git/commits", "POST", {
        ...payload,
        message: payload.message + "\n",
      });
    }
    if (created.sha !== sha)
      throw new Error(
        "GitHub commit identity mismatch; no history rewritten or branch changed.",
      );
    console.log(`Verified exact commit ${sha.slice(0, 12)}.`);
  }
  const current = await api("/git/ref/heads/main");
  if (
    current.object.sha !== before ||
    git("rev-parse", "HEAD") !== target ||
    git("status", "--porcelain")
  )
    throw new Error(
      "Local or remote changed during upload. Review and retry; branch not changed.",
    );
  const updated = await api("/git/refs/heads/main", "PATCH", {
    sha: target,
    force: false,
  });
  if (updated.object.sha !== target)
    throw new Error(
      "Unexpected remote result; inspect branch before retrying.",
    );
  console.log(
    `GitHub main now matches exact local commit ${target}. No force-push.`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    // Never dump proxy objects, request bodies, credential headers or raw Git metadata.
    const message =
      error instanceof Error ? error.message : "GitHub synchronization failed.";
    console.error(
      message.startsWith("GitHub ") ||
        /^(Use |Expected |Review |Fetch, |Custom |This safe |Invalid Git |Unsupported Git |Local or remote |Unexpected remote)/.test(
          message,
        )
        ? message
        : "GitHub synchronization failed; no credential details printed.",
    );
    process.exitCode = 1;
  });
}
