// One-time, reviewed import before joining the standalone and workspace histories.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const initialState = {
  repository: "https://github.com/MostValuableWebDesign/Quick-Pass-Emissions-OS.git",
  remote: "origin",
  branch: "main",
  baseline: "0c3c3d8a895187017b374f3f10ca4e0a4f01739d",
};
let source = execFileSync(
  "git",
  [
    "show",
    "1741ccbd00426008269b089a07d8d2f2606a5f66^:artifacts/quick-pass-emissions-os/scripts/sync-upstream.mjs",
  ],
  { cwd: app, encoding: "utf8", maxBuffer: 100_000 },
);
const replacements = [
  [
    "const name = changes[index + 1];",
    'const name = changes[index + 1]; if (name === "README.md") continue; // Merge workspace README manually.',
  ],
  [
    'const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");',
    `const app = ${JSON.stringify(app)};`,
  ],
  [
    'const state = JSON.parse(await fs.readFile(statePath, "utf8"));',
    `const state = JSON.parse((await readOptional(statePath))?.toString() || ${JSON.stringify(JSON.stringify(initialState))});`,
  ],
  [
    'if (protectedFiles.has(name) || (name.startsWith("prisma/migrations/") && status !== "A")) {',
    // Reviewed upstream change only adds work/ and outputs/ to .gitignore.
    'if ((protectedFiles.has(name) && name !== ".gitignore") || (name.startsWith("prisma/migrations/") && status !== "A")) {',
  ],
];
for (const [before, after] of replacements) {
  if (!source.includes(before)) throw new Error("Historical import engine changed; stop for review.");
  source = source.replace(before, after);
}
await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
