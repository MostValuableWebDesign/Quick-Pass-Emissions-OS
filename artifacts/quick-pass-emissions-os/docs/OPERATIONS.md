# Operator runbook

## Phase 5 durable worker

Read PHASE5.md. Run the existing CLI or authenticated POST independently every 15 minutes with the same deployment database and confirmed configuration. No traffic/page timer is needed. Check the owner **Automation** page for pending backlog, RUNNING lease expiry, attempts/backoff, terminal FAILED jobs and delivery revocations. A five-minute interrupted claim can be reclaimed on the next trigger; four attempts terminate with an observable failure. Fix connectivity/migration/configuration before using the audited owner **Authorize retry** action. Schedule revisions supersede unfinished old-revision work, never earlier saved summaries.

Missed summary dates are processed at most 31 dates per schedule/trigger and 32 jobs per worker run; remaining cursors/backlog persist. Repeat triggers until caught up, inspect generation-versus-scheduled times, and do not present catch-up exception values as the prior live state. Monitor externally for lack of successful checks, pending backlog age and terminal failures; no real dead-man monitor or persistent external trigger has been configured in this delivery. Do not treat a web process remaining alive as proof that jobs are running.

Back up Phase 5 schedule/policy revisions, occurrence/claim state, self-contained saved summaries, reminders and delivery history alongside earlier domain ledgers/snapshots. Restore into an isolated database and verify retained summary payloads and source authorization. Keep the established lock order (generator → personnel → Phase 2 → Phase 3 → Phase 4 → automation); claim-only automation transactions must not acquire earlier locks afterward.

External email/SMS is disabled; internal delivery is atomic with job completion. Delivery revocations record permission/source changes. Reminder acknowledgement is separate from resolution and never updates maintenance/payment/certification business records. Per-item estimates use genuine usage/disposal and recorded units; physical corrections affect current stock without becoming demand or proof of history completeness. CSV consumers must retain signed cents/reversals and map date/provenance columns explicitly. No reconciliation, profit or complete-books assertion is supported.

Private browser verification uses `scripts/phase5-browser-fixture.mjs create|jobs|cleanup`, a separate generated `_test` database and an ignored mode-0600 registry under workspace `.cache`. Never print the registry, credentials or sessions. Browser workflow overrides must supply exact unquoted env-file values and be removed before normal preview use. Never run truncating tests against business data.

## Backups and recovery

Use managed PostgreSQL automated backups and point-in-time recovery where available. Set an owner-approved retention period and recovery time/data-loss objective. Store encrypted backups with access restricted separately from application credentials. A manual logical backup may use `pg_dump --format=custom --file=quickpass.dump "$DATABASE_URL"`; keep that file out of source control and chat attachments. Restore using `pg_restore` into a new isolated database, never over the only live copy. Verify users, task counts, audit history and migration status before switching a deployment. Schedule actual restore drills; no backup or recovery drill was configured for the user's real business during this delivery.

## Account recovery

An owner with a working account can issue another invite to a not-yet-activated employee. Every active user (owner, admin, employee or bookkeeper) can open **Account & password** to change only their own password. Enter the current password, a new unique password of 12–128 characters and matching confirmation. No Replit Secrets or operator action is needed for routine changes. There is no public signup or password-reset email delivery.

The native POST delegates to Better Auth's supported password-change endpoint with current-password verification, session-derived identity, origin/CSRF validation and persistent throttling (five attempts per minute). The same active-user check and mandatory session policy apply to direct calls to that endpoint: a successful change deletes all existing sessions and creates a replacement session for the current browser. Other browsers must sign in again with the new password. The current browser receives the replacement cookie; no token is shown in the page or redirect.

Each completed credential update records `PASSWORD_CHANGED` with the actor/target user ID and fixed self-service/session-policy metadata only. Passwords, hashes, tokens and form bodies are never included in the audit. Credential updates, audit writes and session rotation are separate Better Auth operations, not one application transaction: if a storage failure interrupts completion, the page does not claim success. Try signing in with the new password first; use verified operator recovery if neither password works. The audit records the credential update, not a guarantee that subsequent session rotation completed.

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

## Phase 4 financial records and exports

Back up PostgreSQL before migration 005 and verify prior payroll/inventory/rental history after upgrade. Preserve original invoice numbers, billing/line snapshots, receipts/reversals and audit records. Do not delete or rewrite records to correct balances. Use reviewed void/replacement/full-reversal workflows and reconcile against the accounting source of truth. Establish who can prepare, approve, verify evidence and export. Only owners configure dealer terms/rates/tax; explicit zero is required rather than a blank tax value. No bank credentials or payment execution are stored or enabled.

Treat CSV exports as sensitive financial information. Store downloaded files privately and verify accounting import mappings with cents, signed reversals, source IDs, draft/void markers and estimate/review state. Exports are role-protected, private/no-store and audited, but downloaded files are outside application access controls. Reports are effective-date operational views using current review state, not frozen historical books. Missing entries and duplicate economic events under different references require human reconciliation; the application never establishes profit or completeness. PDF/email delivery and direct accounting/bank integrations remain unconfigured.
