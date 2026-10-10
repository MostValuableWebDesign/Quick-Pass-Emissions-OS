# GitHub updates in this Replit workspace

The user chose to synchronize the full pnpm workspace on GitHub `main`. The app
lives in `artifacts/quick-pass-emissions-os`. The transition imported the
standalone changes through Phase 4 and joined both original histories without
discarding either. The old standalone file mapper is retired in favor of
shared history.

## Normal updates

From the repository root, or using the Replit Git pane:

```sh
git fetch origin
git status
git pull --ff-only origin main
```

If both branches contain new commits, inspect the differences, merge
`origin/main`, resolve conflicts and verify before pushing. Do not force-push,
reset away local work, or join unrelated histories again.

After reviewing and committing changes:

```sh
git push origin main
```

Ahead/behind indicators compare commits. Saving files or merging a Replit task
does not upload those commits automatically. After pushing, verify that local
`HEAD` and `origin/main` match and that the working tree is clean.

## Verification and data safety

Install at the repository root with `pnpm install --frozen-lockfile`, not root
`npm ci`. See the [repository README](../../../README.md) for build commands.
Regenerate Prisma when the schema changes. Run type checking, lint, formatting,
and isolated tests. Review new migrations before applying them; never modify an
already deployed migration, reset business data or seed demonstration records
into a business database. The post-merge script does not mutate database schemas.

`test:isolated` creates and removes only its own temporary development test
database. Production changes require the publishing workflow; Git synchronization
does not publish the app or alter production records.

Restart the managed web workflow after runtime changes. Preserve native
authentication POSTs and strict production origin checks. Register exact new
`/api/...` prefixes with the app artifact to avoid interception by the scaffold API.

## GitHub authentication

If GitHub rejects a CLI push with an invalid-credential error, reconnect GitHub
in Replit account settings under **Git Providers**. Reconnecting an app connector
under Connected Services is not necessarily sufficient. Never put passwords or
personal access tokens in chat, source files, logs or remote URLs.

If reconnection does not fix CLI authentication, the separately authorized
GitHub App can upload committed workspace changes:

```sh
pnpm git:check
pnpm git:push
git fetch origin main
```

Run from the repository root in Replit after reviewing and committing changes.
The bridge verifies exact Git object identities, checks that local and remote
commits have not changed during upload, and updates `main` with `force: false`.
It refuses unsupported signed/custom/non-UTC commit metadata. It does not
repair the native Git credential, publish the app, or modify business data.
