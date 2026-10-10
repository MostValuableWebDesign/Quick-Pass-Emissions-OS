# Architecture

## Modular monolith

`src/app` contains Next.js server-rendered pages, server actions and route handlers for Better Auth, the authenticated operations job trigger and approved payroll CSV export. `src/components` contains reusable presentation primitives, the responsive shell and action forms. `src/lib` contains Prisma, authentication, access policy, validation and business-time helpers. `src/modules/tasks` contains recurrence decisions, task transitions and the operations job. `prisma` contains the relational schema and SQL migration history. `scripts` provides operator commands; `tests` contains unit, database and browser verification.

The application runs on one Node process per web replica and standard PostgreSQL. No platform-specific database API, browser cron, local-upload persistence or microservices are required. No Pages/Sites hosting service or proprietary runtime is part of the app.

## Authentication and authorization

Better Auth provides credential hashing (its supported scrypt implementation), database sessions, origin/CSRF protection and database-backed request throttling. Public signup is disabled. Secure cookies are enabled in production; HTTPS is required. Sessions expire after 12 hours and do not use a cached role-bearing cookie. `currentUser()` re-reads the database role, active flag and employee ID on every protected operation. Deactivation revokes sessions and pending invitations; an authentication hook also refuses new sessions for inactive users.

Managers can administer employee-role accounts. Only owners may grant or change privileged roles. Self-demotion/deactivation is prohibited. Email identity is immutable after provisioning. No user can edit a role through the auth client's user profile endpoint. Privileged application mutations never trust a client-supplied actor ID or role. Server actions use the authenticated actor, server-side Zod parsing, and transactional audit writes. Next.js server actions enforce same-origin submission; Better Auth handles origin checks for its endpoints. The scheduler uses a timing-safe bearer-token check instead of cookies.

Employee task list queries filter by employee ID; task detail and mutations independently enforce ownership. Schedules are similarly scoped. Bookkeepers have payroll/inventory preparation access but no Phase 1 task management or Phase 2 approvals. The manager directory is inaccessible to employees. Employee queries deliberately select only needed names rather than private notes. Payroll and inventory services re-read current roles and active status inside each protected transaction; employees cannot read or mutate Phase 2 data.

Invitations have 256-bit random tokens, hashed storage, atomic single-use consumption and 48-hour expiry. Raw tokens are returned only to the authorized inviter, never recorded in audit details. Invite links place the token in the URL fragment, then remove it from the visible URL on page load; server access logs do not receive the fragment. No automatic email transport is configured. Lost access is recovered through the documented operator procedure.

## Data and consistency

`User`, `Session`, `Account`, `Verification` and `RateLimit` support authentication. A one-to-one `Employee` profile contains operational details. `EmployeeSchedule` has a unique employee/date pair. A template contains its recurrence rule in normalized scalar fields (a separate one-to-one rule table is unnecessary in Phase 1). Each `TaskInstance` snapshots the original title, instructions, employee, deadline, priority, escalation delay and review requirement. The template/date uniqueness constraint protects against duplicate generation. A version counter protects task status changes and reassignment against lost updates.

`TaskEvent` is append-only application history; `AuditLog` records manager and employee operations. Profiles and templates are deactivated, not deleted. Audit rows are created in the same transaction as their business changes. There is no audit-editing endpoint. Database operators remain trusted and can modify the underlying database; this is not cryptographically tamper-proof logging.

Overdue is a derived status, not a stale persisted state. Task completion has an authoritative timestamp and an independent review timestamp. Manager reassignment resets no historical events. Notification uniqueness is recipient/task-specific; completion/cancellation resolves related alerts. Reassigned employees cannot see the former employee's notification through the notification page.

The scheduler takes a transaction-scoped PostgreSQL advisory lock and creates instances with unique-key duplicate skipping. Each job has an observable run record. A failed job rolls back generation; a failed run is recorded outside that transaction. No web page secretly generates tasks on GET. Generation and alerts are the work of a separate CLI/endpoint trigger.

## Payroll and inventory

`src/modules/payroll` contains exact-cent calculations, effective-dated configuration, source approval, payroll draft/review and CSV export. `src/modules/certificates` contains inventory reconciliation/consumption, forecasts, purchase approval and receipts. `src/modules/phase2.ts` centralizes the fresh-role check, transaction-scoped PostgreSQL advisory lock and audit helper. Pages authenticate then use these services; server actions never accept a client actor or role. A single Phase 2 transaction lock deliberately favors correctness over throughput for this small operation. READ COMMITTED queries after acquisition see the previous writer's committed state. Transactional audits roll back with rejected mutations.

PayArrangement, CommissionPolicy, DailyEmission, PayrollPeriod/Input/Draft/Line and CertificateSetting/Stock/Movement/Purchase are added in versioned migrations, including check constraints for money, quantity and approval-pair bounds. Payroll drafts retain JSON calculation evidence plus relational exact-cent line items. Source corrections preserve previous values in audit and invalidate approval. Active period overlap is checked while holding the shared lock; cancelled period history remains. Inventory stock is a balance cache updated atomically with an append-only application ledger. Trusted database operators can still modify data directly; independent tamper-proof logging is not claimed.

Read PHASE2.md for calculation semantics, roster completeness boundaries, locking, approvals and operational limits. Existing Phase 1 migrations are unchanged. Maintenance, receivables, regulated integrations, external storage and advanced automation remain separate future domains.

## References

The implementation uses the official [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma), [database/session model](https://better-auth.com/docs/concepts/database), and [security guidance](https://better-auth.com/docs/reference/security). Framework behavior follows [Next.js App Router documentation](https://nextjs.org/docs/app). Exact package versions are pinned in package.json and package-lock.json.

Phase 2 transaction boundaries follow [PostgreSQL advisory-lock semantics](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS); the application uses the pinned Prisma 6 client API, not newer ORM API examples.
