# Phase 5 — Advanced automation and reporting

Current access policy: this app is exclusively for owners and management (OWNER/ADMIN). Employees and legacy bookkeepers cannot sign in or use any workflow. Staff profiles remain business records for management; management records their progress and receives all alerts. See README's Management-only access section. Historical role descriptions below are superseded by this policy.

Implemented in the existing Next.js/Prisma/PostgreSQL/Better Auth workspace. Phase 4 was imported at its reviewed GitHub revision; the standalone and workspace histories were joined without resetting, force-pushing or discarding the local security fixes. Phase 4 remains the billing/finance implementation. See VERIFICATION.md for exact checks and publication status.

## Pages and current server permissions

| Surface                                                                                       | OWNER                | ADMIN                | BOOKKEEPER             | EMPLOYEE                                        |
| --------------------------------------------------------------------------------------------- | -------------------- | -------------------- | ---------------------- | ----------------------------------------------- |
| Live consolidated overview, schedule/configuration, summary archive/detail, job retry/history | Yes                  | No                   | No                     | No                                              |
| Responsibility, maintenance, downtime, chemical reports/export                                | Yes                  | Yes                  | No                     | No                                              |
| Certificate and rental charge reports/export; existing Phase 4 financial reports/export       | Yes                  | Yes                  | Yes                    | No                                              |
| Internal actionable reminders/acknowledgement                                                 | Configured recipient | Configured recipient | Financial sources only | Own assigned maintenance/own certification only |

Every service and export re-reads active status and current role on the server. Reminder reads and acknowledgement additionally recheck source identity/condition, policy revision, recipient selection and assignment. A stale alert cannot provide access after reassignment, payment, role change or deactivation. Links open the existing independently protected source pages. Employees' own certification page selects only their expiration date. Consolidated summary deliveries go only to active owners. A newly authorized owner may read the historical archive; loss of current owner access denies it.

**Owner exceptions** links overdue responsibilities, pending responsibility/maintenance reviews, upcoming and overdue maintenance, open bay/equipment outages, certification expiration, inventory warning/data limitations, draft payroll awaiting review, approved dealership A/R and rental balances. Upcoming windows come from configured reminder policies; without a policy only due/expired maintenance/certifications are selected. All exception rows remain available rather than hiding later domains behind a first-100 limit. Money is entered integer USD cents, not bank balances or paid obligations.

## Owner configuration — no invented business defaults

In **Automation**, explicitly enter:

- Daily and/or weekly enabled/disabled schedule, Eastern time, ISO weekday (1 Monday–7 Sunday), and all-days versus open-days-only. Daily weekday is a required form field but is ignored by daily occurrence matching.
- Each of four reminder policies: enabled/disabled, advance calendar days, days overdue before escalation, advance/overdue recipients and escalation recipients. Both recipient groups are required when enabled. Employees selected for a policy get only their own qualifying sources, not all employees' records. There are no reminder recipients or timings configured on a fresh database.
- Forecast policy per certificate inventory/per chemical item: observation window (7–365 calendar days), minimum usable days (1 through window), planning lead days (0–365) and low-stock threshold in that item's recorded unit (0–2,000,000,000). These are versioned owner settings, not assumed business reorder rules.

Changes require the displayed revision; stale concurrent forms fail explicitly. Every revision and sensitive owner/recipient mutation is audited. Existing Phase 2 certificate ordering settings remain the purchase/recommendation policy; the advanced forecast policy does not create or modify orders. If no advanced certificate policy exists, the existing owner certificate configuration supplies the observation/threshold/lead values, and a full configured window is required for sufficient-history status. New chemical forecasting remains unconfigured until the owner enters its policy.

## Summary snapshots

The independent worker persists one summary per schedule revision/local occurrence date and one atomic in-app delivery per active owner. **Notifications** links those deliveries; **Summary archive** provides retained details. The summary includes generation time, scheduled occurrence, schedule revision, America/New_York boundaries, all captured exception links and inventory estimates, and self-contained operational report rows/totals for the reporting period.

- Daily period: prior local calendar date, midnight inclusive through the next midnight exclusive.
- Weekly period: seven prior local dates, ending on the day before the scheduled occurrence.
- Exception balances/conditions and forecasts are captured **at generation**, not reconstructed at the scheduled time. A missed-run catch-up can therefore contain current exceptions alongside an earlier dated report window. Both generation and scheduled time are shown.
- The saved payload has no application update endpoint. Changes to sources do not change its captured values. Source links open **current** records and still check current authorization. The live overview is a separate link, never silently substituted into a snapshot.
- Reports may use current completion/review/verification state and late-entered records. Saved summaries freeze the captured result, not complete historical accounting books.

## Reminder lifecycle

Sources: nonterminal maintenance tickets, active employee certification expiration, approved/unvoided dealership invoices with dated unpaid amounts, and unvoided rental charges with dated unpaid amounts. No invoice draft reminder, automatic rental charge generation or customer/dealership message is created.

Advance begins the configured number of local days before due. Date-only certification/billing/rental sources become overdue the following local date. Escalation begins when calendar days overdue **exceed** the configured escalation days. Maintenance uses its actual due instant: if already past due within the same local date, it is overdue (immediately escalated when escalation days is explicitly zero). Closures do not suppress reminders about actual recorded obligations.

Only one current stage/condition per source and authorized recipient is visible. Configured escalation recipients join regular recipients at escalation. Acknowledgement records its own timestamp/audit and **does not** complete maintenance, renew certification or mark money paid.

Changed deadlines/assignments/balances, receipt reversals, policy revisions and stage changes supersede old alerts; completed/cancelled/voided/fully satisfied sources resolve them. Current reads immediately hide obsolete alerts; the next independent check records resolution and revoked delivery. Reconciliation never changes the source. A condition returning after a resolved lifecycle receives a new unacknowledged lifecycle, retaining the former alert/history. Repeated checks of an unchanged open condition keep its acknowledgement and do not create another delivery. The enabled Phase 5 maintenance policy replaces the older maintenance overdue notification generator rather than running both. Phase 1 responsibility notifications remain unchanged.

## Inventory estimates and coverage

Estimates use the current recorded balance and each ledger's genuine consumption within the selected observation window, clipped to the first physical opening date. Show requested observation bounds, usable start/days, recorded consumption, average per calendar day, current stock, latest physical count date, planning lead/threshold and estimated depletion date.

- Certificate **USAGE plus consumed VOID** records deplete stock; a correction is a physical RECONCILE, not a consumed void. Receipts/opening/reconciliation deltas never count as consumption.
- Chemical **USAGE plus DISPOSAL** measures physical depletion, not service demand. Receipt and count adjustments never count as usage. Each item retains ML, GRAM or ITEM; no conversion or cross-item usage average is produced.
- A later physical count changes current stock but does not erase earlier genuine consumption or assert its completeness. The first opening bounds usable coverage; the latest count is explicitly shown. Reconciliation deltas are not retrospectively allocated to consumption.
- Unknown opening/stock → **unknown stock**; too few configured coverage days → **insufficient history**; sufficient coverage but no entered consumption → **zero usage**, depletion unknown. Without an advanced chemical policy → **unconfigured**.
- Unrecorded days contribute zero to the mathematical estimate, **not evidence of official zero usage**. No sampling-completeness or inventory verification claim is made. Static owner thresholds can still warn where a usage estimate is unavailable.

## Operational reports and complete exports

Choose an inclusive Eastern effective-date range of at most 367 days ending no later than today. Operational tables show up to 100 rows; totals and audited CSV exports include every matching row.

- Responsibilities match due, completion **or** independent review timestamps in the range and retain all three timestamps. Overdue is explicitly current, not a fabricated historical status.
- Maintenance matches target dates/opened/completion timestamps. Known repair cost notes are separate from unknown costs and are **not paid expenses**.
- Downtime intersects the range, clipped to range midnights and generation time. Open outages use generation as provisional end. Bay/equipment intervals remain separate; overlapping targets are not combined into availability or lost revenue.
- Inventory uses effective movement dates, retaining kind, signed delta, balance-after, recorded time, item/unit and genuine consumption. Different chemical items/units have separate totals.
- Rental charge rows use due dates; outstanding-as-of-end includes older charges regardless of range start, signed receipts/reversals through end, and effective Eastern void dates. Snapshot terms and zero/unknown limits remain explicit.
- Existing Phase 4 reports/export remain authoritative for dealership service/issue/payment date separation, approved billing, signed receipts/reversals, dated aging and finance manual/independently reviewed/estimated provenance. Do not add billing to receipts or repair/payroll notes to paid expenses.

CSV responses are private/no-store, fresh-role-protected and audited. Text formula prefixes (including whitespace-prefixed `=`, `+`, `-`, `@`) are neutralized; signed integer numeric cents/quantities stay signed numbers. The operational export carries filter/generation/date-semantics columns. Current directory/review state and late entries can change historical operational views. Zero matches is not a verified business zero or complete books.

## Durable independent execution

Continue the existing `pnpm --filter @workspace/quick-pass-emissions-os run jobs` CLI or authenticated POST `/api/jobs`. No page load, GET, browser timer or in-memory interval runs automation. Operators must provision a real persistent trigger every 15 minutes with the deployment database/configuration and monitor it externally. **A real scheduler was not provisioned or verified by this delivery.**

Summary cursors examine at most 31 local dates per schedule/trigger; skipped weekly/closed dates advance the cursor, remaining backlog persists. Workers process at most 32 queued occurrences per trigger. There is no silent discard of older missed dates; repeat triggers continue catching up. Open-days-only schedules require confirmed operating days and skip recorded closures instead of moving them. All-days summaries include financial dates on closures/weekends.

Eastern DST uses the established Temporal `compatible` policy: spring gaps shift forward, fall overlaps select the earlier instant. The unique local occurrence key prevents a second fall-back delivery. Reporting days are 23/25 hours where applicable.

A schedule edit disables its prior revision, supersedes unfinished prior-revision jobs and starts the new revision from **today**, not retroactive dates. Existing summaries are retained. A same-day revision may produce a new revision-labeled summary if its selected time has already passed.

Claim transactions commit a unique lease/token before processing. A five-minute expired lease is recoverable; a stale worker cannot commit after token replacement. Processing transaction commits the summary/reminder changes, in-app deliveries and SUCCESS state together. Four attempts maximum; retry delay is 1, 2, 4, 8 minutes. The fourth failure is terminal/visible, not treated as passed; exhausted interrupted claims are also terminal. An owner can audit-authorize a reset/retry of a terminal failure for a still-active schedule. Job failures contain fixed safe diagnostics, not credentials or private source payloads. Delivery failures do not leave partial effects: the job failure is visible; delivery revocations retain a reason.

Combined lock order: generator `7183501` → personnel/role edits `7183502` → Phase 2 `7183503` → Phase 3 `7183504` → Phase 4 `7183505` → automation `7183506`. Claim/enqueue transactions take only the last lock and never call back into earlier domain locks. The personnel lock serializes current role/active/certification reads with the existing employee editor. Domain services never acquire a generator lock in reverse order. Shared database access remains suited to this small business; monitor transaction timeouts before scaling.

## Migration, verification and deliberate limits

Migration 006 adds only Phase 5 tables, checks, indexes and delivery relations. Migrations 001–005 retain exact reviewed Phase 4 bytes. Isolated verification applies Phase 4 first, creates approved payroll/invoice/signed-reversal sentinels, upgrades to Phase 5, verifies the retained objects and repeats migration with none pending. Business databases are never truncated; generated fixture databases are distinct `_test` names and cleaned up.

External email/SMS, orders, wage payments, collections, customer/dealership messages, bank feeds/reconciliation, complete-books/profit claims, richer training records, chemical conversions, financial lifecycle/proration changes and production deployment/migrations remain outside this delivery. Trusted database operators can modify records directly; cryptographic immutability is not claimed. Existing accessible-label and legacy approval-regression task drafts are separate work.

Before live use confirm schedules/closure choices, responsibility windows, recipients/escalations, certification records, inventory opening/count quality, coverage/lead/threshold settings, exact CSV mapping, backups and failure-monitoring responsibility. Read REPLIT_SETUP.md, docs/OPERATIONS.md and VERIFICATION.md.

Depletion dates beyond the supported four-digit calendar years are unavailable, while numeric days remaining are retained. Extreme valid balances and low recorded usage do not prevent overview or summary generation.
