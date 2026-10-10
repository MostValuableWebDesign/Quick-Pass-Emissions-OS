# GitHub updates in this Replit workspace

The GitHub repository is a standalone Next.js app. This workspace imports it into
`artifacts/quick-pass-emissions-os` inside a pnpm monorepo with its own history.
Ordinary root `git pull` cannot safely reconcile these unrelated histories.
Do not use force resets or `--allow-unrelated-histories` to work around this.

From the workspace root:

```sh
# Fetch and preview only; no application files are changed.
DANGEROUSLY_ALLOW_GIT=1 pnpm --filter @workspace/quick-pass-emissions-os sync:upstream --check

# Apply the reviewed changes under the existing app directory.
DANGEROUSLY_ALLOW_GIT=1 pnpm --filter @workspace/quick-pass-emissions-os sync:upstream --apply --revision=REVIEWED_COMMIT
```

Replace `REVIEWED_COMMIT` with the full revision printed by the preview. Pinning
the reviewed revision prevents a concurrent GitHub update from importing unseen
changes. The Replit Git-safety flag permits only the script's metadata fetch;
the script contains no history-changing operations.

The command reads the remote/branch and last imported upstream revision from
`.upstream.json`. It preserves local additions and performs a three-way merge
when a changed upstream file also has local edits. Any conflict stops the entire
import before files are written. It refuses upstream history rewrites, symlinks,
unsupported paths, changes to existing migrations, and automatic replacement of
adapted package/configuration files. Those changes require manual review.
It never merges workspace Git histories, resets, commits, or pushes.

After an import, review `git diff`, then regenerate Prisma if the schema changed:

```sh
pnpm --filter @workspace/quick-pass-emissions-os db:generate
pnpm --filter @workspace/quick-pass-emissions-os typecheck
pnpm --filter @workspace/quick-pass-emissions-os lint
pnpm --filter @workspace/quick-pass-emissions-os test:isolated
```

Review new migrations before running `db:migrate` against the development
database. Do not run reset, demonstration seed, or database tests against business
data. Database tests require a separate isolated test database; skipped tests are
not passes. The updater never runs migrations or changes Secrets automatically.
`test:isolated` creates a uniquely named temporary test database on the development
server, migrates it, runs the tests, and removes only that database afterward.
It refuses production mode and requires database-creation permission. It never
points truncating fixture tests at the business database.
Replit-managed production schema changes belong to the Publish flow, not this
development update command.

Restart the managed web workflow after source changes. Native authentication
POSTs and development-only preview-origin handling must remain intact.
For new `/api/...` families, register their exact prefixes with the existing
Next.js artifact service so the shared API scaffold does not intercept them.
