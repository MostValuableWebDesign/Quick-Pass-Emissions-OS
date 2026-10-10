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

## Signed-in browser regression through the real preview

After the checks above, **pause/stop** the managed
`artifacts/quick-pass-emissions-os: web` workflow, then run:

```sh
pnpm --filter @workspace/quick-pass-emissions-os test:e2e
```

Restart that same workflow afterward, **even if verification fails**. The preview
is briefly unavailable during this check. Do not run another server on the
registered web port while verification is running. The runner fails preflight
if that port is busy; it never stops another process or changes the workflow.

This is equivalent to `test:isolated --browser`: it creates and migrates a new
uniquely named `_test` database, starts its own Next development server on the
registered preview port (read from the artifact definition), and exercises the
real HTTPS Replit preview proxy. It derives the preview URL from the development
workspace; there is no arbitrary target URL or production mode. The ordinary
workflow keeps its own database and `.next` cache; neither is used by this run.
Database-creation permission and Chromium are required. On this Nix workspace,
Chromium is `/repl/tools/bin/chromium`; `E2E_CHROMIUM_PATH` may specify another
installed executable. Missing browser support is a failure, not a skip.

Coverage includes:

- Native form-encoded login POST with a harmless cookie and a stale session
  cookie; its redirect must create a working protected session.
- Rejection of an unrelated login Origin while a cookie is present. Unit checks
  also require both authentication and Server Action preview allowances to be
  exact and absent in production.
- Public access denied, plus the native login form's POST action.
- Signed-in navigation to payroll, certificates, carwash, maintenance and rentals.
- A verified vendor form save via a protected Server Action, followed by reload
  and verification of the saved fields.

The fixture password is generated, hashed and submitted entirely in the setup
process. It is never typed into a browser or passed as a command-line argument.
Only a private temporary session-state file (directory mode `0700`, file mode
`0600`) is loaded by Playwright. Framework/request logs, traces, screenshots,
videos and HTML reports are not published. Even failures print only fixed
stage descriptions, never credentials, hashes, cookies or tokens. Private
reports, session state and the runner-owned build cache are removed at exit.
The outer runner drops only the database it created. Interrupts perform the same
cleanup; a forced kill or host crash can prevent cleanup, so never use `kill -9`
as the normal stop method.

The default Playwright configuration selects `regression.spec.ts` only. The
older demonstration suites are not part of this smoke check and have not been
claimed as passing. Direct `playwright test` without owned isolation and private
setup fails explicitly. Success requires exactly three completed browser tests,
zero failures, zero skipped/flaky tests, and successful native authentication
and origin checks. Git synchronization does not automatically migrate or restart
the business preview: run this verification sequence after reviewing updates.
