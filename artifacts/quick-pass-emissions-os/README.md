# Quick Pass Business OS

> Saved records live in persistent PostgreSQL, outside build files. Normal startup applies safe migrations and checks the storage connection. Read [DATA_PERSISTENCE.md](DATA_PERSISTENCE.md) before entering live records, changing databases or restoring backups.

> This app now lives inside the shared pnpm workspace. Start with the
> [repository README](../../README.md) for installation, builds, and normal Git
> synchronization. The npm instructions below also apply to a standalone export
> of this app; do not run root `npm ci` in the pnpm workspace.

A PostgreSQL-backed Phases 1–5 business application for Quick Pass Emissions, Tag Renewal & Carwash. Next.js App Router, TypeScript, React, Tailwind, a shadcn-style Button primitive, Lucide, Prisma, Better Auth, and Zod. No real business records or financial balances are included.

**Station performance:** the owner-only **Performance** view adds verified original-report imports, explicit identity/coverage/count review, revenue evidence separation and existing-payroll explanations. Live portal synchronization and current-day earnings forecasts remain unverified/unsupported, not simulated. Read [STATION_HISTORY.md](STATION_HISTORY.md) for secure setup, source discovery, operating instructions and limitations.

## Quick start

Use Node.js 22.12+ (22 or 24 LTS recommended), npm, and PostgreSQL 16+. Actual validation for this delivery is recorded in [VERIFICATION.md](VERIFICATION.md).

```sh
npm ci
cp .env.example .env
# Set DATABASE_URL, BETTER_AUTH_URL and a random BETTER_AUTH_SECRET (32+ characters).
npm run db:generate
npm run db:migrate
```

Provision an empty database separately using your PostgreSQL host. Migration 004 requires the standard `btree_gist` extension; ask the database administrator to provision it if your migration role cannot create extensions. Set an HTTPS `BETTER_AUTH_URL` in production. Generate each secret independently with `openssl rand -hex 32`. Never commit `.env`.

Create the first owner once, on a database with no users. Set `BOOTSTRAP_EMAIL`, `BOOTSTRAP_NAME`, and a unique `BOOTSTRAP_PASSWORD` (12–128 characters) in your local environment or secret manager, then:

```sh
npm run bootstrap
# Remove BOOTSTRAP_PASSWORD from your environment after bootstrap.
npm run dev
```

Open [localhost:3000](http://localhost:3000). Configure operating days in **Settings & audit**, create employees, open each employee profile to issue an invitation, create recurring responsibilities, and record shifts. Share invitation links privately; the application does not send email. Invitation tokens are stored as hashes and expire after 48 hours.

Normal production commands:

```sh
npm ci
npm run db:generate
npm run build
npm run db:migrate
npm start
```

The server binds to `0.0.0.0`; set `PORT` for a different port. If npm 12 reports blocked lifecycle scripts, explicitly run `npm run db:generate` and approve only reviewed package install scripts if your environment needs them. Linux/macOS native packages must be installed on the target platform with `npm ci`; do not transfer `node_modules`.

## What works

- Invite-only email/password accounts, server-stored sessions, four roles, active-account checks, login throttling, and session revocation on deactivation/role changes.
- Employee profiles, role assignment, archival through deactivation, duties, work areas, manager-only notes and a certification expiry field. Compensation is configured separately in the owner-only payroll workflow.
- One shift per employee/date, a navigable seven-day schedule, shift edits/removal and assigned duties.
- One-time, daily, weekly, monthly, quarterly and annual task templates; assignments, deadlines, priorities, notes, blocked work, completion and manager review.
- Persistent task history, audited corrections/reassignment, live overdue counts, role-scoped dashboard data and operational notifications.
- Dark/light themes, collapsible desktop navigation, mobile navigation and touch-friendly task actions.
- Authenticated independently triggered operations jobs, PostgreSQL advisory locking, duplicate prevention, closure exclusions and job-run history.

- Effective-dated owner-authorized pay/commission arrangements, approved personal daily test counts, versioned corrections and duplicate-safe count imports.
- Ended payroll periods, independently approved time inputs/completeness attestations, exact-cent gross drafts, retained calculation revisions, separate approval and approved CSV export.
- Certificate opening/reconciliation counts, consumption/void ledger, estimated depletion/reorder alerts, independent purchase approval, external-order references and partial physical receipts.

- Owner-confirmed six-bay layout, equipment/vendor registry, downtime, corrective tickets, employee issue reporting, reviewed work and scheduled preventative maintenance.
- Chemical stock ledger/low-stock alerts and owner-authorized detailing agreements, monthly charges, received payments and reversal history.

Read [PHASE2.md](PHASE2.md), [PHASE3.md](PHASE3.md) and [PHASE4.md](PHASE4.md) for workflows, permissions, configuration and operating limits. Dealership billing includes immutable approved snapshots, signed receipts/reversals, dated aging and complete CSV exports. Finance separates manual, independently reviewed and estimated records; it is not bank reconciliation or complete accounting. No business wage/stock values are seeded and no payments or external orders are executed.

## Phase 5 automation

Phase 5 adds **Owner exceptions**, **Automation**, **Summary archive**, **Reminders** and **Operational reports**. Read [PHASE5.md](PHASE5.md) before configuring schedules, recipients or forecasts. The independent CLI/POST worker persists duplicate-safe historical summaries and in-app deliveries; opening a page never schedules work. External sending remains disabled. See VERIFICATION.md for publication status and the repository README for the authorized GitHub App fast-forward fallback when native Git authentication fails. Production deployment and actual persistent scheduler provisioning are separate.

## Local demonstration data

Use a **separate, empty, local** database whose name ends in `_demo`. The seed refuses production mode, remote hosts, non-demo names and any database containing users. Do not bootstrap an owner first on a demo database.

Set `ALLOW_DEMO_SEED=true` and a unique `DEMO_PASSWORD` (12–128 characters), then:

```sh
npm run db:migrate
npm run seed:demo
npm run dev
```

Demo accounts: `owner@example.test`, `manager@example.test`, `al@example.test`, `john@example.test`, and `bookkeeper@example.test`. All use the password **you supplied**. The app shows a prominent demonstration banner. Sample shifts, operating days and completed duties are illustrative, never confirmed business facts. Demo employee names deliberately include “Demo.” Nothing sets real employee wages, actual certificates, revenue, rental terms or dealer rates.

For this delivered workspace only, an ignored `.env` and isolated PostgreSQL data under the parent `work/` folder were used for verification. They are not in the portable source archive or Git. Provision your own PostgreSQL database for ongoing use.

## Verification commands

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

`npm test` runs unit tests and clearly skips database tests unless `TEST_DATABASE_URL` is set. For database tests, use a disposable database with a name ending in `_test`:

```sh
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm test
```

**Database tests truncate their isolated fixtures. Never point them at business data.** Browser tests require a running local app with the demo seed and `DEMO_PASSWORD` in the environment:

```sh
npx playwright install chromium
npm run test:e2e
```

Set `E2E_BASE_URL` if needed. Tests create clearly named E2E employees and tasks in the demo database. Use fresh disposable databases for clean reruns. Tests verify invitation activation/reuse, schedules, assignment, employee completion, persistence after reload, manager review, restricted reads, account deactivation, unauthenticated endpoints, bookkeeper isolation and mobile layout.

## Scheduling

Configure an external persistent scheduler to execute `npm run jobs` every 15 minutes, or POST to `/api/jobs` with `Authorization: Bearer <CRON_SECRET>`. Use a random token of at least 32 characters. Jobs must have the same DATABASE_URL and business deployment configuration. The browser is not the scheduler. The manual **Run operations check** button is for setup/recovery.

New task templates attempt immediate generation. A failed generation keeps the template and tells the manager to retry; it does not falsely report that the task was lost. Due dates and overdue dashboard counts are computed against current server time. Notification generation occurs on the next successful job. Inspect job history and monitor failures externally.

Read [BUSINESS_RULES.md](BUSINESS_RULES.md) before configuring recurrence or changing already generated duties.

## Handoff

- [REPLIT_SETUP.md](REPLIT_SETUP.md): GitHub transfer, provisioning and deployment.
- [PHASE3.md](PHASE3.md): carwash, maintenance, chemicals and rental workflows.
- [PHASE2.md](PHASE2.md): payroll and inventory workflows, permissions and limits.
- [ARCHITECTURE.md](ARCHITECTURE.md): boundaries, data model and security.
- [BUSINESS_RULES.md](BUSINESS_RULES.md): time, lifecycle and business assumptions.
- [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md): owner decisions before live operations.
- [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md): remaining phases.
- [AGENTS.md](AGENTS.md): future coding-agent instructions.
- [docs/OPERATIONS.md](docs/OPERATIONS.md): backup, recovery, maintenance and security notes.
