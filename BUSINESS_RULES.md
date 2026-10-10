# Business rules and deliberate limits

## Business facts

Quick Pass has emissions testing, a tag renewal kiosk and six carwash/detailing bays. Phases 1–2 manage responsibilities and internal payroll/inventory preparation; it does not replace the state-certified analyzer, official emissions reporting, payroll processing or accounting records. Known employee names and historical compensation figures are context only. There is no live kiosk, analyzer, dealer, payroll or bank API integration.

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

Completion is recorded as completed before required manager review. The review filter exposes completed duties awaiting approval. The dashboard's “Completed today” means today's due responsibilities currently completed, not every completion event entered today.

Escalation hours are configured per template, 0–168. Employees get overdue notifications; active owners/managers are included once the escalation delay expires. All priorities can alert; priority provides triage rather than silently suppressing work. Acknowledgement does not resolve an unfinished task. Alerts resolve when work completes/cancels or its deadline moves back into the future. Task lists show live overdue state even if the scheduler is late.

## Roles and sensitive data

OWNER: operational management and owner-authorized financial configuration. ADMIN: operational management and independent payroll/source/purchase approval. BOOKKEEPER: payroll/inventory read and preparation, approved payroll export and external order recording; cannot approve or change stock. EMPLOYEE: assigned task information, own shifts and alerts; no Phase 2 records. See PHASE2.md for precise permissions. No SSNs or bank credentials are stored.

## Payroll and certificates

See [PHASE2.md](PHASE2.md). Rates, compensation arrangements, eligibility, personal-count attribution, periods, export mapping, opening stock and ordering terms remain unconfigured until explicitly entered by authorized users. Historical $1 above 50 and 300-certificate examples are not seeded business facts. Minimum ordering configuration supports at least 300 as required by the original specification; confirm the actual minimum before use.

All money is integer USD cents with exact BigInt calculation intermediates. Base hourly compensation uses separately approved worked minutes, rounded half up per employee/period. Fixed compensation is an explicitly configured per-period amount. Commission policies are selected per employee/day. Drafts snapshot approved sources and freeze edits; approved payroll is immutable. Corrections require reasons, source reapproval, and a new draft revision after a separate reviewer returns the draft. No overtime, tax, withholding, amended-payroll, automatic payment or processor-specific export logic is claimed.

Inventory is unknown until physically reconciled. Every stock movement retains history and a unique source reference. Concurrent usage and receipt are serialized, negative stock and excess receipts fail closed. Forecasts are estimates from entered usage, not proof of official totals. Purchase requests need a different authorized approver; only confirmed physical receipt changes ordered stock. No order submission, ACH, official analyzer calls or bank integration exists.
