# Business rules and deliberate limits

## Business facts

Quick Pass has emissions testing, a tag renewal kiosk and six carwash/detailing bays. Phase 1 manages responsibilities; it does not replace the state-certified analyzer, official emissions reporting, payroll processing or accounting records. Known employee names and historical compensation figures are context only. There is no live kiosk, analyzer, dealer, payroll or bank API integration.

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

OWNER: all Phase 1 operations and privileged account management. ADMIN: operational management and employee-role account provisioning; cannot elevate accounts. EMPLOYEE: assigned task information, own shifts and own alerts. BOOKKEEPER: account access and future accounting placeholder only. Only managers see manager notes or the employee directory. No SSNs, bank credentials, payroll amounts or compensation records are stored.

## Deferred financial rules

Commission description: configurable `$1 × max(0, approved eligible daily tests − 50)` per eligible employee, pending owner approval of attribution. Station totals are not personal test counts. Historical base compensation is not current payroll data. Phase 2 must retain effective-dated policies, integer cents/exact decimal values, calculation snapshots, correction reasons and approval history. Do not enable calculations or seed compensation before those decisions are confirmed.

At least 300 certificates per order is a historical operating description to confirm before Phase 2. Stock must come from recorded receipts, usage and reconciliation. No unauthorized ACH or unofficial regulated-system calls. Accounting records remain the financial source of truth; missing data is never zero profit.
