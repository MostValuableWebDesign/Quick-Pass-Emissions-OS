# Replit and GitHub handoff

## Current workspace and Phase 5

The shared GitHub main is intended to contain the full pnpm workspace, with the original standalone app under `artifacts/quick-pass-emissions-os`. Both histories have been joined after reviewed Phase 4 integration; authentication/origin, safe native credential POST, password-change and workspace compatibility fixes remain. Use root `pnpm install --frozen-lockfile`; do not run root `npm ci`. Existing managed artifact workflow: `artifacts/quick-pass-emissions-os: web`.

Use `pnpm --filter @workspace/quick-pass-emissions-os run db:generate`, `db:migrate`, `typecheck`, `lint`, `format:check`, `test:isolated`, `build` and `jobs` from the workspace. Baseline migrations 001–005 remain unchanged; additive 006 is applied with migrate deploy, never a business-data reset. The authenticated Next export services own `/api/finance` and `/api/reports` explicitly in the artifact router, alongside auth/jobs/payroll paths.

Read PHASE5.md for owner configuration, Eastern schedules, immutable archive, source-linked internal reminders, estimates, complete exports and failure recovery. Configure a real independent scheduler every 15 minutes to execute the jobs CLI, or authenticated HTTPS POST `/api/jobs` with an independently generated CRON_SECRET of at least 32 characters. A manual button or browser page is not a persistent scheduler. Test repeated triggers, a missed-run backlog and failure monitoring on the actual authorized environment before relying on delivery.

The current Replit standard Turbopack production build succeeds; the old CSS-worker port failure is historical, not a reason to choose webpack unconditionally. Native Git credentials can still fail after reconnect. Re-authenticate **Git Providers** in account settings for native Git, but do not repeat unsuccessful reconnect loops. The separately authorized GitHub App fallback already integrated into shared main supports `pnpm git:check` and `pnpm git:push` after committing and merging current origin/main. It verifies exact Git object/commit hashes and advances only by fast-forward, refusing races and unsupported metadata. Compare the remote main hash afterward. Never force-push; this route does not repair native Git credentials.

No production deployment, production migration, external sending or real persistent scheduler provisioning has been performed. See VERIFICATION.md for actual development/disposable-database/browser results. Provision backups/restore drills and confirm real owner settings separately.

## Transfer

The repository is portable source code. The prior published repository is MostValuableWebDesign/Quick-Pass-Emissions-OS; this current imported checkout has no configured remote. Phase 1 was previously pushed; Phases 2–4 are local changes until separately published. Import the provided complete Phase 4 source or publish it when authorized before expecting GitHub/Replit to contain these workflows. Review `.gitignore` before any transfer. Transfer only source, migrations, documentation and the lockfile. Never upload `.env`, `node_modules`, `.next`, browser traces or the parent work directory.

Import that GitHub repository into Replit. Use Node 22.12+ (22/24 LTS) and install with `npm ci`. The included `.replit` uses standard npm commands; verify the deployment UI and port mapping for the selected Replit deployment. No Replit-specific library is required. GitHub remains the shared source of truth.

## Secrets and database

Provision an empty standard PostgreSQL database, then set Replit Secrets:

- `DATABASE_URL`: the provider connection string. Configure provider-required TLS and use a restricted application database role.
- `BETTER_AUTH_URL`: the exact HTTPS deployed origin, without a path. For development preview, use that exact preview origin instead; update it when the hostname changes.
- `BETTER_AUTH_SECRET`: a random secret of at least 32 characters.
- `CRON_SECRET`: a different random secret of at least 32 characters for the scheduled endpoint.
- `PORT`: only if the deployment requires a nondefault port; default 3000 maps to external port 80.

Do not enable ALLOW_DEMO_SEED for deployment. The demo seed intentionally rejects remote databases. Use real administrator-entered records after owner bootstrap. Never copy the local demonstration database into production.

```sh
npm ci
npm run db:generate
npm run db:migrate
```

Temporarily set BOOTSTRAP_EMAIL, BOOTSTRAP_NAME and a unique BOOTSTRAP_PASSWORD in Secrets, run `npm run bootstrap`, and remove the password variable. Bootstrap refuses any database that already contains users. Do not put real passwords in terminal command history.

## Build and start

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

The `.replit` deployment commands build first, then apply migrations and start the web server. In a multi-replica deployment, prefer one explicit release migration step before rolling out replicas. Only `prisma migrate deploy` belongs in production; never use migrate reset or development migration commands there.

## Independent scheduler

Use a reliable external scheduler or a scheduled deployment to run `npm run jobs` with the same database secrets every 15 minutes. Alternatively, send an authenticated HTTPS POST to `/api/jobs` with the CRON_SECRET bearer token. A browser tab, in-memory setInterval, and traffic-driven GET requests are not a scheduler. Configure timeout/retry/backoff and failure alerts. Inspect job-run history in Settings. Concurrent invocations are serialized and duplicate generation is protected in PostgreSQL.

## Deployment smoke test

1. Sign in as owner over the actual HTTPS hostname; verify logout and an unauthenticated redirect.
2. Configure actual operating days and a closure. Confirm they are owner-approved.
3. Add an employee, deliver their invite privately, activate it and verify reuse fails.
4. Record a shift; create and generate a recurring task assigned to that employee.
5. Sign in separately as employee. Verify no employee directory/settings access, no peer tasks, and own task completion.
6. Reload/restart the app. Verify completion and history remain in PostgreSQL.
7. Review completion as manager and inspect the audit trail.
8. Exercise the scheduled endpoint using its secret; verify an invalid token gets 401.
9. Deactivate a test employee; verify their existing session is rejected.
10. Restore a backup into an isolated database and verify the migration version and record counts.

## Prompt for the next Replit agent

Read AGENTS.md, README.md, ARCHITECTURE.md, BUSINESS_RULES.md, OPEN_QUESTIONS.md and VERIFICATION.md. Inspect the current commit and working tree before edits. Continue Phases 1–4 deployment and owner configuration first; read PHASE2.md, PHASE3.md and PHASE4.md. Preserve Better Auth sessions, server-enforced ownership, PostgreSQL transactions, template/date uniqueness, versioned task updates and audit history. Run the documented checks; distinguish passed checks from skipped/database-unavailable checks. Do not implement Phase 5, seed financial facts, enable public signup, send external email or add regulated-system integrations without explicit authorization.

## Phase 2 deployment smoke test

Apply migrations 002 and 003 after backing up existing data. Read PHASE2.md and assign independent preparer/reviewer accounts. In a disposable environment, verify owner configuration, personal count recording/approval, approved minutes and completeness, draft source freezing, separate review, approved-only CSV and persisted snapshots after restart. Verify employee direct access to both modules and export returns no data. Exercise initial physical stock, concurrent consumption, stale reconciliation, duplicate references, low-stock recommendation, independent purchase approval, external order record and partial receipts. Real compensation/stock must be configured from verified records; test fixtures are never production facts. Validate payroll CSV mapping with the real processor before use.

If the host blocks Turbopack's CSS-worker socket, `npm run build -- --webpack` is the supported alternative. Local verification uses this alternate build and does not prove Replit deployment readiness.

## Phase 3 deployment smoke test

Read PHASE3.md. Ensure `btree_gist` is available and back up existing data before migration 004. Confirm all four migrations are applied and repeat deployment finds no pending migrations. Verify the existing Phase 2 records remain intact. On an isolated environment, confirm six bays start unknown until inspected, equipment/vendor edits persist, downtime opens/closes once, an employee can report an issue and update only assigned work, and manager review/costs remain private. Test closure-aware duplicate-safe preventative generation, cursor catch-up and notification ownership after reassignment. Verify chemical opening count/usage/receipt/reconciliation, frozen units, stale versions and low-stock banners. Authorize a detailing agreement as owner, reject overlaps and self-service rentals, prepare a full-month charge, enter a partial payment, reverse it as manager and verify history persists after reload. Deny employee rental/chemical/vendor reads and bookkeeper maintenance/stock writes.

Confirm actual labels, conditions, contacts, equipment, inspection rules, stock measurement/counts, tenants and monthly terms with the owner. No third-party ordering, collection, messaging or official equipment integration exists. Publication/deployment and actual business verification remain separate. The complete continuation prompt is REPLIT_PROMPT.md.

## Phase 4 deployment smoke test

Back up business data before additive migration 005; verify all five migrations and repeat deployment. Preserve Phases 1–3 records. In an isolated environment, create a dealer/contact, authorize terms/tax as owner, record completed services, draft an exact-cent invoice, reject duplicate billing and self-approval, approve with a different owner/manager, record external delivery and partial receipt, reject concurrent overpayment, reverse with retained negative history and void/rebill only after full reversal. Verify employees cannot read directory, invoices, finance reports or exports. Verify manual/verified/estimated records stay separate, cross-register references reject duplicates in both directions, dated aging/voids work, all six CSV datasets contain complete records with signed integer cents, no-store headers and audit entries, and mobile pages fit.

Confirm actual dealer facts and accounting mappings with the owner/accountant. No email/PDF, automated payments, tax engine, bank feed or automatic accounting posting is configured. A prior-date report uses current review state and may change after late entries. Full continuation instructions are in REPLIT_PROMPT.md.
