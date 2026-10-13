# Business rules and deliberate limits

## Marketing boundaries

Marketing source reporting is optional and missing/unknown responses remain explicit. Customer-reported campaign and tracked promo attribution stay separate, with one canonical inspection counted once. Paid status must be evidence-supported; VIN/30-day free retests and incomplete lookback do not become paid sales. Budget is separate from spending; collected revenue uses existing recorded receipts, not the $20 estimate. Promo application is owner-only, atomic with a single paid dealership service, and must leave a positive existing-workflow charge. Used terms remain frozen and cancelled/refunded uses still consume lifetime limits. No marketing sends, ad purchases, social publication or Google review publication occur. Google analytics/review features require authorized data. See [MARKETING.md](MARKETING.md).

## Business facts

Quick Pass has emissions testing, a tag renewal kiosk and six carwash/detailing bays. Phases 1–4 manage responsibilities, payroll/inventory preparation, carwash maintenance rental records, dealership billing and operational finance; the app does not replace the state-certified analyzer, official emissions reporting, payroll processing or accounting records. Known employee names and historical compensation figures are context only. There is no live kiosk, analyzer, dealer, payroll or bank API integration.

## Calendar and recurrence

- Business timezone: `America/New_York`. Instants are PostgreSQL timestamps representing UTC; displayed times explicitly use Eastern time. Calendar dates are validated ISO `YYYY-MM-DD`; daily due times are validated `HH:mm` local time.
- Operating weekdays must be confirmed and configured; fresh databases have no assumed operating days. ISO weekdays are 1=Monday through 7=Sunday.
- Closed days and recorded holiday/closure dates are skipped, not moved to another date. This applies to one-time duties too. For a permitted exception on a closed day, create an occurrence on an operating day and use an audited manager deadline override.
- Daily means every configured open day; weekly means selected weekdays intersected with open days. Monthly/quarterly/annual rules anchor to the start date. The 31st clamps to the last day of a shorter month while keeping the original anchor for later months. February 29 annual duties use February 28 in non-leap years.
- DST policy uses Temporal `compatible`: a nonexistent spring-forward time moves forward by the gap; an ambiguous fall-back time uses the earlier occurrence. This behavior is explicitly tested.
- A job generates through 14 days ahead. Initial/new-template generation backfills at most 31 days. Creating a new template with an older start date is rejected. Existing deployments catch up from the previous successful run with a one-day overlap. An extended outage therefore catches missed days; large backlogs may require an operator to inspect job timeout history.
- Jobs ignore inactive employees and paused templates. Reactivation/resuming does not imply that all old missing tasks will be regenerated. Managers must reconcile missed obligations explicitly.
- Template snapshots and existing instances are not rewritten when operating days, closures or template activity change. Review already generated duties and cancel/reassign/reschedule them with a reason. The Settings UI explains this. To revise a recurring rule, pause the old template, cancel overlapping future instances, then create the replacement. Avoid overlapping templates representing the same responsibility.
- Employee shifts are independent from task recurrence. Assigning a task does not prove the employee has a shift; managers must verify coverage. Schedules permit one daytime shift per employee/date; split overnight work across dates. Schedule changes are audited.

## Task status and audit

Pending, in progress, blocked, completed and cancelled are persisted. An unfinished task with `dueAt < now` is displayed as overdue. A blocked overdue task remains overdue, and its blocked status is retained in history. Completed/cancelled work is never overdue.

Employees may start, block or complete assigned tasks and add notes. They cannot cancel/reopen work or alter ownership/deadlines. Blocking requires a reason. Managers may cancel/reopen tasks, approve reviews and override assignments/deadlines. Cancellation, reopening and deadline/assignment overrides require a documented reason. Terminal tasks must first be reopened before reassignment. Concurrent changes with a stale version are rejected; refresh and retry.

Completion is recorded as completed before required manager review. The review filter exposes completed duties awaiting approval. Task completion counts refer to the selected due-date scope, not every completion event entered today.

Escalation hours are configured per template, 0–168. Employees get overdue notifications; active owners/managers are included once the escalation delay expires. All priorities can alert; priority provides triage rather than silently suppressing work. Acknowledgement does not resolve an unfinished task. Alerts resolve when work completes/cancels or its deadline moves back into the future. Task lists show live overdue state even if the scheduler is late.

## Roles and sensitive data

OWNER: operational management and owner-authorized financial configuration. ADMIN: operational management and independent payroll/source/purchase approval. BOOKKEEPER: payroll/inventory read and preparation, approved payroll export and external order recording; cannot approve or change stock. EMPLOYEE: assigned task information, own shifts and alerts; no Phase 2 records. See PHASE2.md for precise permissions. No SSNs or bank credentials are stored.

## Payroll and certificates

See [PHASE2.md](PHASE2.md). Rates, compensation arrangements, eligibility, personal-count attribution, periods, export mapping, opening stock and ordering terms remain unconfigured until explicitly entered by authorized users. Historical $1 above 50 and 300-certificate examples are not seeded business facts. Minimum ordering configuration supports at least 300 as required by the original specification; confirm the actual minimum before use.

All money is integer USD cents with exact BigInt calculation intermediates. Base hourly compensation uses separately approved worked minutes, rounded half up per employee/period. Fixed compensation is an explicitly configured per-period amount. Commission policies are selected per employee/day. Drafts snapshot approved sources and freeze edits; approved payroll is immutable. Corrections require reasons, source reapproval, and a new draft revision after a separate reviewer returns the draft. No overtime, tax, withholding, amended-payroll, automatic payment or processor-specific export logic is claimed.

Inventory is unknown until physically reconciled. Every stock movement retains history and a unique source reference. Concurrent usage and receipt are serialized, negative stock and excess receipts fail closed. Forecasts are estimates from entered usage, not proof of official totals. Purchase requests need a different authorized approver; only confirmed physical receipt changes ordered stock. No order submission, ACH, official analyzer calls or bank integration exists.

## Carwash and rental integrity

## Advanced automation and reporting

Read PHASE5.md. Owner summary schedules, advance/escalation recipients and inventory forecast observation/coverage/lead/threshold values must be explicitly configured. Daily/weekly reporting periods use prior local dates; captured exceptions use generation-time state. Summary catch-up retains its scheduled occurrence and generation time rather than fabricating the earlier live state. Closures skip open-days-only schedule dates rather than moving them. Schedule revisions supersede unfinished old jobs and begin from today; no old snapshot is rewritten.

Acknowledgement never satisfies a source obligation. Payment/reversal, completion/cancellation, changed assignments/due dates and policy/role changes resolve or supersede obsolete reminders without altering source business state. Configured maintenance reminders replace legacy maintenance overdue alerts; responsibility notifications retain their existing behavior. Reminder email/SMS remains disabled. Owner-requested daily email is separately configured; see OWNER_DAILY_EMAIL.md.

Certificate USAGE/consumed VOID and chemical USAGE/DISPOSAL are genuine physical depletion; receipts/reconciliation adjustments are not consumption. Observation is clipped to opening-stock coverage; newer physical counts change balance, not historical usage completeness. Unknown stock, insufficient coverage and zero recorded usage do not imply known depletion or actual zero business usage. Reports preserve signed cents and unit/provenance/date semantics; recorded maintenance cost and payroll notes are not paid expenses, and billing is not received cash. Complete filtered CSVs include all rows, even when display stops at 100.

Read PHASE3.md. Three self-service and three detailing bays require owner-confirmed identifiers and inspected condition. Outage intervals measure recording time, not inferred historical downtime. Chemical stock is unknown before a physical count and uses whole declared units without automatic conversion. Employee maintenance reads exclude cost, vendor and manager history; submission goes to manager review. Scheduled maintenance uses Eastern due instants, configured open days/closures, unique occurrences and persisted bounded catch-up. No generated ticket is rewritten by schedule edits. Rental terms require owner authorization; inclusive agreements cannot overlap. Full-calendar-month charges retain authorized snapshots; payments/reversals use exact cents and unique references. Amounts are entered records, not bank reconciliation, automated collection or verified profit.

## Dealerships and finance

Read [PHASE4.md](PHASE4.md). Owner-authorized terms/tax gate drafts. Completed services allocate once; invoice lines and billing terms are snapshotted. Different owner/manager approval is mandatory. Payment dates are chronological, references are checked across dealer/rental/other finance records, overpayment is rejected, and full negative reversals retain originals. Effective-date aging excludes drafts and dated voids. Manual actuals, independently checked evidence, and estimates remain separate. Reports/exports use current review state and entered dates, with no profit or completeness inference. No PDF/email, accounting posting or payment execution exists.

## Dashboard business snapshot

Dashboard reads the current America/New_York business date under the shared personnel, inventory, payroll, finance and station locks and checks current management access. It neither changes records nor runs jobs. Tests use current station revisions, exclude superseded identities and do not add employee counts to station totals. Missing station reports remain unavailable rather than zero; an imported empty report can explicitly show zero imported tests. Commission eligibility requires a confirmed station record. Imported data is partial evidence of today, never an assertion that the full day is complete.

Received revenue means dated dealer/rental payments net of signed reversals. Billed revenue means recognized approved dealer invoices dated today. Reviewed retail tests use effective outcome pricing for a separate estimate. Other estimate entries and verified manual revenue remain separate measures; none are summed into a misleading revenue total or profit. Unknown retail pricing is flagged; unrecorded revenue is excluded.

Employee gross uses independently approved daily payroll inputs and approved personal daily counts with effective commission policies and volume tiers. A unique approved daily payroll snapshot takes precedence. Weekly or other multi-day payroll hours/base amounts are never prorated into today. Missing approvals, rates, daily base inputs and unsupported calculation bounds remain incomplete; visible subtotals exclude those missing amounts. Configured schedules are not worked hours.

Needs attention contains known stock at/below its effective reorder threshold, active employees with expired/approaching certification dates, recognized overdue unpaid invoices and overdue unpaid nonvoid rental charges. Signed reversals restore unpaid balances. Renewals, replenishment, payment and voiding remove resolved items on the next read. Unconfigured/unknown inventory is a coverage note, not fabricated low stock. Certifications use the configured reminder advance window or a clearly displayed 30-day review window; this fallback does not create a reminder policy. Urgency order is critical (expired/due-today certifications and zero stock), action needed (overdue balances and low stock), then upcoming certifications; ties use the earliest date and a stable record identity. Totals include all matches; presentation shows up to 15 per page.

Quick actions are ordinary navigation: the official certificate portal opens in a new tab, Service & Support opens the provider directory to choose an appropriate contact, payroll opens its review page, and Performance retains owner-only access. No portal orders, telephone calls or external messages occur on Dashboard visits.

## Performance testing pace

- Pair consecutive source timestamps only within the same employee and report-local date, sorting by clock minute. Never form an interval between employees or across dates.
- Include every physical inspection, including free retests, for pace. Existing counted-car, revenue and commission retest rules remain unchanged. VIN-history availability does not determine timing availability.
- Report the median of retained gaps. Across dates/employees, pool retained gaps rather than average individual medians. Zero-minute ties remain zero at the source's minute precision; the value is an interval, not measured inspection duration.
- Owners may configure a persistent station-wide integer long-gap threshold from 1 to 1439 minutes. Exclude gaps strictly greater than it; an unset threshold includes all within-day gaps. Always exclude overnight boundaries.
- Show used gaps, excluded long gaps, excluded overnight boundaries and timing coverage. Label exclusions “Excluded long gap” without inferring breaks or downtime. Omit an employee/day with missing timestamps or unmatched source counts so unknown adjacency cannot create a false interval. Empty or singleton days have no usable gap, not a fabricated duration.
- Pace settings use serialized, freshly authorized owner transactions with audit revisions and stale-edit rejection. Changes recalculate current/historical Performance estimates without modifying source snapshots, payroll, finance or personal panel layouts.

## Daily owner email

Owners may select only current active OWNER accounts as daily report recipients. Every calendar day becomes due at 6:30 PM Eastern and reports that date, using data saved when generated. Later entries do not rewrite the captured report. Missing coverage/payroll inputs stay unavailable; known partial totals, estimates, billed amounts and recorded receipts remain distinct. The report never infers profit. Pausing cancels unsent deliveries. Re-enabling does not resend a previously queued or accepted owner/date. Queued sends recheck current recipient role, active status, address and selection before external delivery.

## Monday payroll reminder

The owner confirmed payroll is paid every Monday. Show a management-only app banner
on Saturday (yellow/two calendar days away), Sunday (orange/one day away), and Monday
(red/payday), using Eastern dates across DST. Hide it outside this window; do not infer
holiday shifts or overdue/paid status. Each owner/manager may acknowledge only today's
alert for their own account. Acknowledgment persists in the existing audit ledger and
expires for display at the next Eastern date; the following day/week is independent.
It never marks payroll approved or wages paid. Calendar reads are read-only and require
current management access; acknowledgment rechecks active role and today's date after
the transaction lock, rejects stale/future tabs, and deduplicates repeat submissions.
