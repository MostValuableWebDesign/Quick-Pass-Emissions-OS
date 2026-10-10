# Quick Pass Business OS — shared workspace

This repository contains the complete Replit pnpm workspace. The business app is
in `artifacts/quick-pass-emissions-os`, not at the repository root. The shared-main
transition retains the original standalone and workspace histories through a
merge rather than replacing either history.

The original standalone changes were imported through Phase 4 before joining
the histories. New updates use ordinary shared Git history, not a file mapper.

## Install and build

Use Node.js 22.12+ (22 or 24 LTS recommended), pnpm 10.26.1, and PostgreSQL 16+.
Install pnpm if necessary, then run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/quick-pass-emissions-os db:generate
pnpm run typecheck
pnpm --filter @workspace/quick-pass-emissions-os lint
pnpm --filter @workspace/quick-pass-emissions-os format:check
pnpm run build:app
```

Supply database and authentication configuration through a secret manager. In
Replit, retain the existing Secrets and managed web workflow. Outside Replit,
see the app's `.env.example`; never commit a populated environment file.
The build command requires the app's environment configuration.

For a new database, review migrations before running:

```sh
pnpm --filter @workspace/quick-pass-emissions-os db:migrate
```

Do not bootstrap an existing owner, reset business data, or use demonstration
seed data against a business database. See the
[application documentation](artifacts/quick-pass-emissions-os/README.md) and
[operations runbook](artifacts/quick-pass-emissions-os/docs/OPERATIONS.md).
The managed post-merge script installs dependencies and generates Prisma; it
does not push a competing database schema or reset data.

## Normal Git synchronization

Both Replit and GitHub use the full workspace on `main`. From the repository root:

```sh
git fetch origin
git status
git pull --ff-only origin main
# After reviewing and committing your changes:
git push origin main
```

If both sides have new commits, review and merge `origin/main`, resolve conflicts,
and test before pushing. Do not force-push or discard local changes to clear
ahead/behind indicators. The retired standalone file importer is no longer used.

Git indicators compare commits, not just matching source files. New edits or task
merges still need to be committed and pushed; saving in Replit is not a Git push.
See [GitHub update guidance](artifacts/quick-pass-emissions-os/docs/GITHUB_UPDATES.md).

### Replit GitHub App fallback

If native Git still rejects its credential after reconnecting Git Providers,
the authorized GitHub App offers a separate, safe upload path:

```sh
# First review and commit changes on main, and merge any new origin/main commits.
pnpm git:check
pnpm git:push
git fetch origin main
git status
```

This Replit-only command uses managed authentication without exposing tokens.
It verifies exact blob, tree and commit hashes, preserves both histories, and
advances `main` only by fast-forward. It refuses dirty source, remote races,
signed/custom metadata, or non-UTC commits instead of rewriting history. Use
native Git for unsupported commit formats or outside Replit. New untracked
uploads in `attached_assets/` are not published automatically; existing tracked
assets remain tracked.

## Tests

In the Replit development workspace:

```sh
pnpm --filter @workspace/quick-pass-emissions-os test:isolated
```

This creates and removes only a uniquely named temporary test database, never
truncates business records, and refuses production mode. Outside Replit, follow
the app's documented `TEST_DATABASE_URL` setup with a disposable `_test` database.
Do not count skipped database or browser tests as passing.
