# Replit and GitHub handoff

## Transfer

The repository is portable source code. The configured remote is MostValuableWebDesign/Quick-Pass-Emissions-OS. Phase 1 was previously pushed; Phase 2 is a local change until separately published. Import the provided Phase 2 source or publish it when authorized before expecting GitHub/Replit to contain these workflows. Review `.gitignore` before any transfer. Transfer only source, migrations, documentation and the lockfile. Never upload `.env`, `node_modules`, `.next`, browser traces or the parent work directory.

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

Read AGENTS.md, README.md, ARCHITECTURE.md, BUSINESS_RULES.md, OPEN_QUESTIONS.md and VERIFICATION.md. Inspect the current commit and working tree before edits. Continue Phases 1–2 deployment and owner configuration first; read PHASE2.md. Preserve Better Auth sessions, server-enforced ownership, PostgreSQL transactions, template/date uniqueness, versioned task updates and audit history. Run the documented checks; distinguish passed checks from skipped/database-unavailable checks. Do not implement Phases 3–5, seed financial facts, enable public signup, send external email or add regulated-system integrations without explicit authorization.

## Phase 2 deployment smoke test

Apply migrations 002 and 003 after backing up existing data. Read PHASE2.md and assign independent preparer/reviewer accounts. In a disposable environment, verify owner configuration, personal count recording/approval, approved minutes and completeness, draft source freezing, separate review, approved-only CSV and persisted snapshots after restart. Verify employee direct access to both modules and export returns no data. Exercise initial physical stock, concurrent consumption, stale reconciliation, duplicate references, low-stock recommendation, independent purchase approval, external order record and partial receipts. Real compensation/stock must be configured from verified records; test fixtures are never production facts. Validate payroll CSV mapping with the real processor before use.

If the host blocks Turbopack's CSS-worker socket, `npm run build -- --webpack` is the supported alternative. Local verification uses this alternate build and does not prove Replit deployment readiness.
