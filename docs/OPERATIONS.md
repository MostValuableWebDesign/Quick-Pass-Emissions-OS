# Operator runbook

## Backups and recovery

Use managed PostgreSQL automated backups and point-in-time recovery where available. Set an owner-approved retention period and recovery time/data-loss objective. Store encrypted backups with access restricted separately from application credentials. A manual logical backup may use `pg_dump --format=custom --file=quickpass.dump "$DATABASE_URL"`; keep that file out of source control and chat attachments. Restore using `pg_restore` into a new isolated database, never over the only live copy. Verify users, task counts, audit history and migration status before switching a deployment. Schedule actual restore drills; no backup or recovery drill was configured for the user's real business during this delivery.

## Account recovery

An owner with a working account can issue another invite to a not-yet-activated employee. Activated accounts use Better Auth's authenticated password-change capability if integrated into a future settings screen; no self-service recovery email is configured yet.

For a locked-out activated account, a trusted database operator may run `npm run recover-account`. Set `RECOVERY_ACTOR_EMAIL` to the verified active owner authorizing recovery, `RECOVERY_EMAIL` to the target, and `RECOVERY_PASSWORD` to a new unique password of 12–128 characters. The script requires explicit `ALLOW_ACCOUNT_RECOVERY=true`, rechecks owner/target status, updates only the credential password, revokes all target sessions/invites and records an audit event. Deliver the new password privately and remove the variables immediately. Database operator access is the trust boundary; this is not a public recovery endpoint. Identity verification must occur outside the app.

## Scheduler monitoring

Run every 15 minutes independently from the web process. Alert if no successful run occurs within 30 minutes, if a run is FAILED, or if a RUNNING row becomes stale after process termination. Run history is visible in Settings; external dead-man monitoring must be configured by the operator. The UI's overdue calculation does not depend on notifications being current. SQL advisory locking serializes generation; the transaction timeout is 60 seconds. For extended downtime or much larger deployments, inspect timeouts and implement bounded per-template cursors before scaling generation volume.

## Configuration changes

Changing closures/open days does not delete already generated duties. Review the next 14 days and use audited task cancellation/overrides. Deactivating an employee preserves existing tasks and shifts for reassignment. Pausing a template stops new generation only. Weekly workdays are ISO 1–7. Review open owner questions before introducing live data.

## Security and maintenance

Keep the deployment on HTTPS, maintain separate production/demo/test databases, rotate secrets following a suspected exposure, restrict database network access and review privileged accounts. Restore tests and production smoke tests are separate from a passing local build. No user attachments are accepted or written to local disk.

At delivery, the dependency audit identified a high-severity recursive-pattern denial-of-service advisory in `braces` through Next.js ESLint tooling (`micromatch`, `fast-glob`, `@next/eslint-plugin-next`, `eslint-config-next`). This is a development-only chain processing repository glob patterns, not an application request input. No patched braces release was available from the selected registry; do not blindly downgrade the application framework to satisfy audit's suggested legacy config. Recheck upstream regularly. `deepmerge-ts` is pinned to patched 8.0.1 via an override; migrations/builds were tested with it. See VERIFICATION.md for the actual final audit result.

Better Auth login throttling uses a persistent RateLimit table. Configure the hosting proxy's trusted forwarded-IP behavior correctly and add edge rate limits for abuse defense. Invitation acceptance requires a valid 256-bit token before hashing a password. The security headers include frame, MIME, referrer and permissions restrictions. A nonce-based strict script CSP, MFA, independent penetration testing, centralized telemetry and formal tamper-proof audit storage are not claimed in this MVP.

## Phase 2 operations

Read PHASE2.md before entering compensation or stock. Verify privileged payroll/purchase roles, two-person approval availability, owner configuration, period roster and completeness, processor CSV mapping and physical stock. Include payroll drafts/lines, source approval records, inventory ledger and purchase history in backups and restore verification. Approved payroll is immutable in the application; use the payroll processor for post-approval adjustments. Do not directly edit ledger or snapshot rows to bypass approval. The shared Phase 2 advisory lock serializes writes/read snapshots; monitor transaction timeouts before scaling beyond a small business. Certificate low-stock banners are computed from current records; no email/SMS delivery is configured.

## Phase 3 operations

Read PHASE3.md. Include bay/equipment/vendor history, downtime, maintenance plans/tickets/events, chemical movements and rental terms/charge snapshots/payment reversals in backups and restore drills. Migration 004 uses the standard `btree_gist` extension; verify database-host provisioning privileges before release. Phase 3 has a separate advisory lock; the operations job acquires the job lock then the Phase 3 lock. Never introduce the reverse order. Per-plan catch-up examines 62 dates per run and preserves the next cursor. Monitor lag/timeouts and repeat checks after outages. Existing generated tickets require explicit review after closure, assignment or schedule changes. Resolve actual open equipment work/downtime and pause plans before archival. Verify an employee's reassigned maintenance alerts no longer appear.

Chemical balances are unknown before physical count and use whole declared units. Rental charges/payments are manually entered business records, not bank actuals. Do not edit ledgers/contracts directly to bypass versions, overlap constraints or reversal rules. Use documented reversals/voids and new owner-authorized nonoverlapping agreements; partial-month and amended paid-period accounting is external. No photo attachment or external vendor/tenant message service is configured.
