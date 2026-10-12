# Daily owner email

The owner-requested report becomes due at **6:30 PM America/New_York** every calendar day and covers **that same day**. Eastern daylight saving time follows the business calendar. Actual sending occurs on the first successful independent job trigger at or after that time. Late entries are included only if saved before generation; later changes do not rewrite a saved report.

## Activate

1. Set up a Resend account and verify its sending domain. Store `RESEND_API_KEY` as a Replit Secret. Set the shared environment variables `OWNER_SUMMARY_FROM_EMAIL` (the verified sender address) and `OWNER_SUMMARY_APP_URL` (the published app's HTTPS origin only, without credentials, path, query or fragment). Keep the existing persistent `DATABASE_URL` and storage identity. The provider key never appears in browser bundles or responses.
2. Apply the additive migration through the existing guarded migration/startup procedure. Do not reset, seed or replace the business database.
3. Provision a Replit Scheduled Deployment every five minutes in `America/New_York` with the command `pnpm --filter @workspace/quick-pass-emissions-os run owner-email-job`. This one-shot worker processes owner email only; it does not run door-access, analytics or other business automations. Configure it to use the published app's production environment and persistent database. Monitor failed runs and owner email history. Opening the app or building it does not run email jobs.
4. As an owner, open **Automation → Configure daily owner email**, preview the report, select active owner recipients and enable delivery. New configuration starts today, so enabling after 6:30 makes today's report due on the next trigger. Saving an already-active configuration preserves its catch-up cursor.
5. Confirm the first provider acceptance in Email history and actual receipt at the intended inbox. A configured API key does not prove domain verification, scheduler execution or inbox delivery.

No live provider key or verified sender was present during implementation. A production scheduler was not provisioned. Deployment, actual sends and inbox receipt require the above setup; local mocked acceptance is not delivery evidence.

## Report contents

- Imported station test volume, reviewed commission eligibility, pending review and separately approved employee counts. No imported coverage is unavailable, not zero.
- Dealer billing, dealer/rental recorded receipts, retail estimates/unpriced tests, other estimates and verified/unverified manual revenue. These measures overlap and must not be added together. Receipts do not claim to cover all cash/retail income.
- Daily employee base pay, commissions, gross pay and known partial amounts, with missing policies/approvals/daily inputs flagged. Weekly inputs are not prorated.
- Unresolved stock reorder alerts, expiring certifications and overdue unpaid dealer/rental balances, ordered by urgency. Unknown stock/settings are flagged separately. Up to 15 attention items and missing-payroll explanations appear in email.

HTML and plaintext share the same saved contents, branded Quick Pass Emissions with `#218845`. Stored names/details are escaped in HTML. Email links require ordinary app authentication. The report is an entered-data snapshot, not frozen books, a completeness guarantee or profit. Demo data is explicitly flagged. Catch-up reports use their historical date for daily metrics and current unresolved attention state at generation; history edits can affect metrics before that snapshot is captured.

## Persistence and recovery

Configuration, cursor, report snapshot, frozen email content, attempts and provider result live in PostgreSQL and survive builds/restarts using the same database. At most seven due report dates are generated per trigger; the remaining cursor is retained. At most four emails are attempted per trigger. One owner/date delivery is enforced by a unique database key, including after configuration saves. First-attempt timing, frozen body and provider idempotency key are persisted before network access. Expired worker claims can resume with the same key/body.

Transient provider errors/timeouts retry with backoff, up to four attempts. Permanent rejection becomes **failed**. Owners may authorize a failed retry within 23 hours of the first attempt; it retains the original body and key. After 23 hours, pending/failed/abandoned attempts move to **review** rather than risk resending beyond the provider's 24-hour idempotency retention. Check the provider's records before arranging any separate resend. Changing the sender environment does not change an already-queued body; keep retries on the same provider account.

**Accepted** records provider acceptance and its ID, not delivery to the inbox. Bounce/delivery webhooks are not implemented. Provider errors are sanitized; private response bodies and credentials are not logged. Owner email history paginates at 15 entries and links to the saved copy. Audit records cover configuration, report generation, acceptance and authorized retry.

Pausing or removing a recipient cancels unsent deliveries. Demotion, deactivation or an email-address change is rechecked under the personnel lock before sending. Cancellation cannot recall provider-accepted messages. Re-enabling does not recreate a cancelled owner/date email; the next eligible date proceeds normally. Removing provider configuration suspends sending/generation without discarding the due cursor. Owners can inspect configuration/history and decide how to recover.

Provider references: [send email](https://resend.com/docs/api-reference/emails/send-email), [verified domains](https://resend.com/docs/dashboard/domains/introduction), [24-hour idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
