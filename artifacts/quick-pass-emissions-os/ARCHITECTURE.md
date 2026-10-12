# Architecture

## Durable storage lifecycle

All saved domain records remain in PostgreSQL across builds. Migration 007 adds a singleton storage identity without changing existing business data. The dev/start package scripts apply committed deploy migrations and verify the optional EXPECTED_DATABASE_ID before accepting traffic; builds never seed/reset/migrate. Infrastructure in src/lib/database-maintenance.ts provides complete private PostgreSQL dumps and transactional restore into a separate empty database. Optional DATA_BACKUP_DIR requires a successful full backup before pending migrations. Only fresh active owners can read storage identity/counts in Settings. Preview and production may use separate databases. See DATA_PERSISTENCE.md.

## Modular monolith

`src/app` contains Next.js server-rendered pages, server actions and route handlers for Better Auth, the authenticated operations job trigger and approved payroll CSV export. `src/components` contains reusable presentation primitives, the responsive shell and action forms. `src/lib` contains Prisma, authentication, access policy, validation and business-time helpers. `src/modules/tasks` contains recurrence decisions, task transitions and the operations job. `prisma` contains the relational schema and SQL migration history. `scripts` provides operator commands; `tests` contains unit, database and browser verification.

The application runs on one Node process per web replica and standard PostgreSQL. No platform-specific database API, browser cron, local-upload persistence or microservices are required. No Pages/Sites hosting service or proprietary runtime is part of the app.

## Authentication and authorization

Better Auth provides credential hashing (its supported scrypt implementation), database sessions, origin/CSRF protection and database-backed request throttling. Public signup is disabled. Secure cookies are enabled in production; HTTPS is required. Sessions expire after 12 hours and do not use a cached role-bearing cookie. `currentUser()` re-reads the database role, active flag and employee ID on every protected operation. Deactivation revokes sessions and pending invitations; an authentication hook also refuses new sessions for inactive users.

Managers can administer employee-role accounts. Only owners may grant or change privileged roles. Self-demotion/deactivation is prohibited. Email identity is immutable after provisioning. No user can edit a role through the auth client's user profile endpoint. Privileged application mutations never trust a client-supplied actor ID or role. Server actions use the authenticated actor, server-side Zod parsing, and transactional audit writes. Next.js server actions enforce same-origin submission; Better Auth handles origin checks for its endpoints. The scheduler uses a timing-safe bearer-token check instead of cookies.

Employee task list queries filter by employee ID; task detail and mutations independently enforce ownership. Schedules are similarly scoped. Bookkeepers have payroll/inventory preparation access but no Phase 1 task management or Phase 2 approvals. The manager directory is inaccessible to employees. Employee queries deliberately select only needed names rather than private notes. Payroll and inventory services re-read current roles and active status inside each protected transaction; employees cannot read or mutate Phase 2 data.

Invitations have 256-bit random tokens, hashed storage, atomic single-use consumption and 48-hour expiry. Raw tokens are returned only to the authorized inviter, never recorded in audit details. Invite links place the token in the URL fragment, then remove it from the visible URL on page load; server access logs do not receive the fragment. Invitations still have no automatic email transport; daily owner summaries use the separately configured transport below. Lost access is recovered through the documented operator procedure.

## Data and consistency

`User`, `Session`, `Account`, `Verification` and `RateLimit` support authentication. A one-to-one `Employee` profile contains operational details. `EmployeeSchedule` has a unique employee/date pair. A template contains its recurrence rule in normalized scalar fields (a separate one-to-one rule table is unnecessary in Phase 1). Each `TaskInstance` snapshots the original title, instructions, employee, deadline, priority, escalation delay and review requirement. The template/date uniqueness constraint protects against duplicate generation. A version counter protects task status changes and reassignment against lost updates.

`TaskEvent` is append-only application history; `AuditLog` records manager and employee operations. Profiles and templates are deactivated, not deleted. Audit rows are created in the same transaction as their business changes. There is no audit-editing endpoint. Database operators remain trusted and can modify the underlying database; this is not cryptographically tamper-proof logging.

Overdue is a derived status, not a stale persisted state. Task completion has an authoritative timestamp and an independent review timestamp. Manager reassignment resets no historical events. Notification uniqueness is recipient/task-specific; completion/cancellation resolves related alerts. Reassigned employees cannot see the former employee's notification through the notification page.

The scheduler takes a transaction-scoped PostgreSQL advisory lock and creates instances with unique-key duplicate skipping. Each job has an observable run record. A failed job rolls back generation; a failed run is recorded outside that transaction. No web page secretly generates tasks on GET. Generation and alerts are the work of a separate CLI/endpoint trigger.

## Payroll and inventory

`src/modules/payroll` contains exact-cent calculations, effective-dated configuration, source approval, payroll draft/review and CSV export. `src/modules/certificates` contains inventory reconciliation/consumption, forecasts, purchase approval and receipts. `src/modules/phase2.ts` centralizes the fresh-role check, transaction-scoped PostgreSQL advisory lock and audit helper. Pages authenticate then use these services; server actions never accept a client actor or role. A single Phase 2 transaction lock deliberately favors correctness over throughput for this small operation. READ COMMITTED queries after acquisition see the previous writer's committed state. Transactional audits roll back with rejected mutations.

PayArrangement, CommissionPolicy, DailyEmission, PayrollPeriod/Input/Draft/Line and CertificateSetting/Stock/Movement/Purchase are added in versioned migrations, including check constraints for money, quantity and approval-pair bounds. Payroll drafts retain JSON calculation evidence plus relational exact-cent line items. Source corrections preserve previous values in audit and invalidate approval. Active period overlap is checked while holding the shared lock; cancelled period history remains. Inventory stock is a balance cache updated atomically with an append-only application ledger. Trusted database operators can still modify data directly; independent tamper-proof logging is not claimed.

Read PHASE2.md for calculation semantics, roster completeness boundaries, locking, approvals and operational limits. Existing Phase 1 migrations are unchanged. Receivables are covered by Phase 4 below; regulated integrations, external storage and advanced automation remain separate future domains.

## Phase 5 automation and operational reports

`src/modules/automation` extends the modular monolith with versioned owner policies, owner exception snapshots, per-ledger estimates, complete operational datasets and a durable independently triggered worker. The original Phase 4 finance services remain the financial calculation/export boundary; no domain database is moved to the scaffold API.

Migration 006 adds summary schedule revisions/cursors, reminder and forecast policy revisions, unique job occurrences with committed claim leases, saved self-contained summary payloads, source-condition recipient reminders and unique internal deliveries. Combined read/processing transactions acquire personnel → Phase 2 → Phase 3 → Phase 4 → automation locks in that order; claim/enqueue-only transactions take the final lock alone. The existing generator lock is acquired before any domain lock, never from a domain mutation. The personnel lock serializes authorization/certification reads and delivery with existing employee/role edits. Job processing atomically commits business-side snapshot/reminder effects, in-app deliveries and success status; interrupted claims and bounded retry failures remain observable. See PHASE5.md for exact keys, boundaries, DST, revision, permission and failure-recovery behavior.

Only current active owners can read consolidated payloads/configuration/job history. Other report permissions retain existing domains. Recipient reads/mutations revalidate current source/assignment/policy and active roles rather than treating an old delivery as a capability. Summary links lead to currently protected records while captured figures remain independent. Data operators remain trusted; application immutability is not cryptographic tamper-proof storage.

The implementation uses the official [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma), [database/session model](https://better-auth.com/docs/concepts/database), and [security guidance](https://better-auth.com/docs/reference/security). Framework behavior follows [Next.js App Router documentation](https://nextjs.org/docs/app). Exact package versions are pinned in package.json and package-lock.json.

Phase 2 transaction boundaries follow [PostgreSQL advisory-lock semantics](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS); the application uses the pinned Prisma 6 client API, not newer ORM API examples.

## Carwash, maintenance, chemicals and rentals

`src/modules/maintenance` owns registries, role-scoped issue/work services and preventative generation. `src/modules/chemicals` owns exact-unit stock and movement history. `src/modules/rentals` owns owner-authorized terms, full-month snapshots, payments and reversals. `src/modules/phase3.ts` provides a separate advisory-lock transaction and fresh role/active check. Phase 2 services and locks remain intact. `phase3-actions.ts` supplies the authenticated actor; no browser role or actor ID is trusted.

Migration 004 adds relational bay/equipment/vendor/ticket/event/plan/downtime, chemical item/movement and rental agreement/charge/payment entities. Check constraints bound quantities/cents and enforce target/sign consistency. Partial unique indexes permit only one open outage per target. Standard `btree_gist` plus an inclusive date-range exclusion prevents overlapping noncancelled contracts, including direct writes. Notification gains an optional maintenance FK for employee ownership filtering and links. There is no object/file upload subsystem.

The existing observable scheduler transaction takes the job lock followed by Phase 3's lock, generates unique preventative occurrences with a persisted bounded catch-up cursor, and reconciles scoped overdue alerts. Domain mutations never take the job lock, avoiding reverse lock order. Services select an explicit employee-safe ticket shape before returning data; manager cost/history/vendor fields are omitted in SQL. Register edits, movement versions and payment checks serialize before audit commits. See PHASE3.md for workflows and limitations.

## Dealerships and operational finance

`src/modules/finance` owns directory/contacts, owner-authorized billing configuration, completed services, invoice allocation/snapshots, separate reviews, signed receipts/reversals, manual/estimated finance entries, date-scoped reports and safe CSV. `src/modules/phase4.ts` rechecks active roles and takes rental lock 7183504 followed by finance lock 7183505 in READ COMMITTED transactions. The shared receipt-reference helper is also called by rental writes under lock 7183504. No Phase 4 service takes the job lock or Phase 2 lock. Audit and business writes commit together. Employees never enter this data boundary. `phase4-actions.ts` supplies the authenticated actor; `/api/finance/export` validates selection/dates, uses no-store responses and audits exports.

Migration 005 adds dealerships/contacts/services/invoices/lines/payments/finance-entry tables, uniqueness and database bounds/lifecycle checks. Invoice calculations use BigInt intermediates and integer USD cents. Lists cap at 100; report totals/export queries do not truncate matching rows. Aging uses entered effective payment/void dates; review state is current rather than a historical frozen statement. Accounting exports preserve original invoice billing snapshots, signed reversals and provenance markers. The application does not infer complete books or profit. Read PHASE4.md for scope and limits.

### Employee payroll overview

`payroll/dashboard.ts` provides role-checked employee summaries and a paginated audit ledger.
Display equivalents use explicit schedule inputs, while the shared calculation engine still uses
approved minutes (hourly), approved paid days (daily), full seven-day weeks (weekly), or the
original whole-period amount (fixed). Progressive personal daily commission boosts are selected
by effective date and copied into immutable payroll snapshots. Percentage adjustments re-read
the expected source version under the Phase 2 transaction lock and append a new dated version
and audit record atomically. Migration 012 adds nullable schedule, paid-day and boost fields,
leaving existing compensation and historical JSON snapshots unchanged. Presentation lists have
a fixed 15-item page size; financial calculations and approved exports use complete source data.

## Shared station test-export coordination

`StationTestExportState` stores one active reservation token/expiry and shared cooldown per station hash. `test-export-gate.ts` claims it under existing owner authorization and station transaction locks, then releases those locks before any network request. Performance history and daily counts use the same gate. Source calls and snapshot writes re-check authorization, configured station, token and expiry; only the owning token may finish the run. Cleanup is internal and still clears its own reservation after actor deactivation. Database time controls the two-minute lease and 60-second completion/five-minute failure cooldown; a shared AbortSignal bounds provider work to 45 seconds, including redirects and response bodies. History requests are sequential, limited to three days each and three requests per run including empty-day fallbacks. Cached domain data is independent of coordination state and remains available during cooldown.

## Shared address lookup and provenance

`ContactAddressFields` owns only interactive search/selection state. `/api/addresses` authenticates
current management access, checks origin and input, and applies a PostgreSQL-backed lookup quota.
`address-lookup.ts` maps Geoapify building results to structured US fields; `address-provenance.ts`
signs and verifies base-address selections. Employee, dealership and vendor save transactions
persist those fields/source/provider ID and retain manually entered units. Client source flags
are ignored; no postal validation is claimed. Vendors have an independent versioned address edit
so primary-contact verification remains separate. See docs/ADDRESS_LOOKUP.md and additive
migration 202610120004_contact_address_lookup. Saved data never depends on a provider being online.

## Daily owner email

`OwnerEmailSetting`, `OwnerEmailReport` and `OwnerSummaryEmail` persist configuration, dated snapshots and the email outbox in PostgreSQL. The independent automation worker calls the shared dashboard transaction reader, freezes HTML/plaintext and recipients before sending, and serializes generation/claims with existing advisory locks. A unique owner/date key prevents duplicate reports to the same owner. The bounded Resend transport uses a stable delivery idempotency key; automatic retries stop after 23 hours and require provider review afterward. Provider acceptance is recorded separately from inbox delivery. Personnel and automation locks remain held during the eight-second bounded send so deactivation, demotion and configuration revocation cannot race the final recipient check. No provider calls run on reads, previews or builds. Existing daily/weekly in-app summaries remain independent. See OWNER_DAILY_EMAIL.md.

## Physical door access

Security uses a fixed-origin server-side Seam adapter, persistent DoorLock / DoorAccessCode records and sanitized audit events. Keyed PIN fingerprints are retained; plaintext codes are never stored. Personnel lock 7183502 precedes security lock 7183508, with fresh actor/target checks inside the transaction. Creation intent commits before the bounded provider call; ambiguous calls are reconciled, never replayed. Staff deactivation queues revocation atomically. Independent jobs reconcile one door and 15 codes per trigger; reads remain inert. See DOOR_ACCESS.md for setup and confirmation limits.
