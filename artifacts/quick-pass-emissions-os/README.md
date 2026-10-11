# Quick Pass Emissions

> Saved records live in persistent PostgreSQL, outside build files. Normal startup applies safe migrations and checks the storage connection. Read [DATA_PERSISTENCE.md](DATA_PERSISTENCE.md) before entering live records, changing databases or restoring backups.

> This app now lives inside the shared pnpm workspace. Start with the
> [repository README](../../README.md) for installation, builds, and normal Git
> synchronization. The npm instructions below also apply to a standalone export
> of this app; do not run root `npm ci` in the pnpm workspace.

A PostgreSQL-backed Phases 1–5 business application for Quick Pass Emissions, Tag Renewal & Carwash. Next.js App Router, TypeScript, React, Tailwind, a shadcn-style Button primitive, Lucide, Prisma, Better Auth, and Zod. No real business records or financial balances are included.

**Workspace theme:** the Quick Pass Emissions palette uses near-white `#FAFBF8` backgrounds, white `#FFFFFF` panels, almost-white `#FCFDFB` navigation and pale `#F2F5ED` tab highlights, green `#306D29` actions and chart accents, and forest `#0D530E` headings and strong text. It carries through the shell, Dashboard, payroll, inventory, maintenance, billing, reports and settings. Shared system typography, quiet surfaces, consistent controls, semantic alerts and matching Performance charts support light/dark themes and desktop/tablet/phone layouts. Run `E2E_THEME_ONLY=1 npm run test:e2e` to verify every main navigation page in an isolated browser.

**Sign-in:** a professional management login built around the Quick Pass Emissions near-white and green palette, with responsive desktop/tablet/phone layouts, accessible form controls and native sign-in. Run `E2E_LOGIN_ONLY=1 npm run test:e2e` for its isolated browser workflow.

**Dashboard:** today’s Eastern-date snapshot separates imported tests and reviewed commission eligibility, dealer/rental receipts, dealer billing, retail estimates, other recorded estimates and verified manual revenue. Employee gross separates approved base and commissions; missing daily inputs remain incomplete. The main action list contains only current low stock, certifications due soon, and overdue unpaid dealer/rental balances, ordered by urgency with 15 items per page. Quick actions open certificate ordering, Service & Support, payroll and owner Performance. Dashboard visits are read-only; they do not generate jobs, approve sources or change balances.

**Station performance:** the owner-only **Performance** view adds verified original-report imports, explicit identity/coverage/count review, revenue evidence separation, outcome breakdowns, daily/hourly trends, an employee payroll-evidence table, and draggable/resizable panels saved per owner in this browser. Comparisons require reviewed complete historical coverage; partial pay periods are not prorated. Live portal synchronization and current-day earnings forecasts remain unverified/unsupported, not simulated. Read [STATION_HISTORY.md](STATION_HISTORY.md) for secure setup, source discovery, operating instructions and limitations.

**Payroll & commissions:** employee-first daily/weekly base rates, approved daily/weekly commissions,
average commission per approved day, effective-dated exact/percentage pay changes, progressive
personal-volume incentives, latest approved gross payroll and a durable transaction history.
Payroll display lists use 15 items per page; approved exports include all rows. Owners configure
rates and changes; management prepares/reviews records. Read [PHASE2.md](PHASE2.md) for pay
bases, approval evidence and the additive migration that preserves existing data.

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

Open [localhost:3000](http://localhost:3000). Configure operating days in **Settings & audit**, create staff records, create recurring responsibilities, and record shifts. Staff records have no login. Owners may grant Owner or Manager access and issue a private invitation from that profile. Share invitation links privately; the application does not send email. Invitation tokens are stored as hashes and expire after 48 hours.

Normal production commands:

```sh
npm ci
npm run db:generate
npm run build
npm run db:migrate
npm start
```

The server binds to `0.0.0.0`; set `PORT` for a different port. If npm 12 reports blocked lifecycle scripts, explicitly run `npm run db:generate` and approve only reviewed package install scripts if your environment needs them. Linux/macOS native packages must be installed on the target platform with `npm ci`; do not transfer `node_modules`.

## Management-only access

Only OWNER and ADMIN (Manager) accounts can sign in, use existing sessions, activate invitations or change passwords. Legacy EMPLOYEE and BOOKKEEPER identities are retained for business history but have no app access. Migration `202610100011_management_access` retires their credentials, sessions, unused invitations and unresolved personal alerts while retaining staff, payroll, schedules, tasks, maintenance and finance records. Startup applies migrations automatically; builds never reset data.

Owners and managers enter all task progress, maintenance work, support history and approvals. Automated alerts go only to management. The employee self-service certification route has been removed. Staff records remain available for management's payroll, scheduling, certifications and assignment tracking.

## What works

- Invite-only email/password accounts, server-stored sessions, Owner and Manager access only, current role/active-account checks, login throttling, and session revocation on deactivation/role changes.
- Employee profiles, role assignment, archival through deactivation, duties, work areas, manager-only notes and a certification expiry field. Compensation is configured separately in the owner-only payroll workflow.
- One shift per employee/date, a navigable seven-day schedule, shift edits/removal and assigned duties.
- One-time, daily, weekly, monthly, quarterly and annual task templates; assignments, deadlines, priorities, notes, blocked work, completion and manager review.
- Persistent task history, audited corrections/reassignment, live overdue counts, management dashboard data and operational notifications.
- Dark/light themes, collapsible desktop navigation, mobile navigation and touch-friendly task actions.
- Authenticated independently triggered operations jobs, PostgreSQL advisory locking, duplicate prevention, closure exclusions and job-run history.

- Effective-dated owner-authorized pay/commission arrangements, approved personal daily test counts, versioned corrections and duplicate-safe count imports.
- Ended payroll periods, independently approved time inputs/completeness attestations, exact-cent gross drafts, retained calculation revisions, separate approval and approved CSV export.
- Certificate opening/reconciliation counts, consumption/void ledger, estimated depletion/reorder alerts, independent purchase approval, external-order references and partial physical receipts.

- Owner-confirmed six-bay layout, equipment/vendor registry, downtime, corrective tickets, management-recorded issues and work progress, reviewed repairs and scheduled preventative maintenance.
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

Demo login accounts: `owner@example.test` and `manager@example.test`. Staff records for Demo Al and Demo John have no credentials. Both management accounts use the password **you supplied**. The app shows a prominent demonstration banner. Sample shifts, operating days and completed duties are illustrative, never confirmed business facts. Demo employee names deliberately include “Demo.” Nothing sets real employee wages, actual certificates, revenue, rental terms or dealer rates.

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

**Database tests truncate their isolated fixtures. Never point them at business data.** The isolated runners create and remove their own temporary databases and synthetic accounts; they do not seed or restart the business app. The database connection must allow creating a temporary database.

```sh
npx playwright install chromium
# On a local development machine (uses a private ephemeral server port):
E2E_DIRECT=1 npm run test:isolated
E2E_DIRECT=1 npm run test:e2e
```

In Replit, omit `E2E_DIRECT=1` to use the configured preview port; that port must be free. `DATABASE_URL` supplies the connection to the PostgreSQL server, and the runners generate their own database name, signing secret and private sessions. `DEMO_PASSWORD` and a pre-seeded app are unnecessary. `E2E_CHROMIUM_PATH` optionally selects an installed browser.

The default browser command requires all 19 checks across navigation, personnel/invitations, tasks, payroll, certificates, maintenance, chemicals, rentals, dealer billing, finance and Phase 5 automation. Phase 5 covers configuration, summary delivery and immutability, reminders, CSV reports, failed-job retry and role restrictions. A missing workflow file, skipped test, failure or retry fails the completion guard. Targeted theme/login/support/import/certificate/station modes remain available and report only their selected coverage. Browser traces, screenshots and video are disabled; temporary sessions and reports are private and removed on completion.

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
