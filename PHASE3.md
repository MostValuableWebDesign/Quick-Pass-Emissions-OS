# Phase 3 — carwash and maintenance

Implemented locally on the complete Phase 2 delivery. This source includes Phases 1–3; GitHub publication and deployment are separate steps. No actual bays, equipment, vendor contacts, chemical stock, tenants, rental prices, repair costs or payments are seeded. The local browser fixtures are explicitly illustrative.

## Bays, assets and downtime

The owner confirms six unique physical identifiers in Carwash & bays: three self-service bays followed by three detailing bays. This matches the supplied business description, but actual labels and condition require inspection. Bays initially have **unknown** condition. Owners/managers record condition, responsible employee, notes and a reason; only the owner can correct identifiers. Types and the six-slot layout remain fixed. Editing an already known status requires the current version. Bay cards list equipment and direct bay inspection schedules, the latest 20 direct maintenance tickets and latest 20 downtime events. Equipment tickets are accessible through Maintenance.

Out of service and under repair open a bay outage at the server's recording time. Moving between those two states preserves one continuous outage. Returning to operational or maintenance required closes it with the return-to-service reason and actor. Equipment has its own start/end downtime controls. Recording an equipment outage does not automatically assert that the entire bay is offline; inspect and update bay condition separately. No historical backfill, telemetry, availability percentage or inferred lost revenue is claimed. Downtime timestamps display in Eastern time.

Register actual equipment codes, names, categories, optional bay/vendor, model, serial and notes. Categories include analyzer, kiosk, pump, hose, brush, nozzle, dispenser, drain pit, property and other. Equipment outside a bay supports shared assets and the emissions/kiosk operational boundaries. Codes are unique. Archival preserves history and requires no open equipment tickets, active schedules or open downtime. Nothing connects to a state analyzer or kiosk API.

Vendors require a checked contact person/department, at least one phone/email, service description, verification source reference and verification date. Verification is the entering manager's attestation, not an independent lookup. OPUS TECH, KleenRite and Advanced Group are background names only; no contacts or contracts are invented. Versioned edits and archival preserve prior details in audit. Existing historical assignments retain their vendor relation; new/changed assignments use active vendors.

## Corrective maintenance and employee access

Owners/managers create a ticket against exactly one configured bay or active equipment item. Tickets record description, priority, target business date, optional active employee and verified vendor, opened timestamp, work performed, actual cost (integer USD cents, blank means unknown), status and events. Direct manager-created tickets are due at 17:00 Eastern on the target date. An assignment/status update preserves an existing scheduled due time when the date is unchanged; moving to another date uses 17:00. Closed dates do not prevent reporting an actual issue.

Employees can report an issue and see only their own reports or currently assigned work. Their reports cannot set assignments, vendors, cost, deadline or review status. Employee reads select only operational fields in SQL and exclude costs, vendor contacts, manager history and rental data. Only an assigned employee may start, block or submit work for review; being the reporter does not grant repair-management rights. Work submission requires a description and moves to awaiting review. A manager records the review and any known cost, then completes or returns work. Managers may also complete external vendor work directly. Maintenance review does not require a second manager as payroll approvals do.

Completed/cancelled tickets retain history and cannot be reopened or reassigned. Create a follow-up ticket for later work/corrections. Mutations require the current version; conflicting updates roll back. Ticket events and sensitive application audit records commit with each change. Reassignment, status review and deadline changes immediately resolve previous maintenance alerts; the next scheduled check produces applicable current alerts. No work update or repair-cost entry initiates a purchase or payment.

## Preventative schedules and operations checks

Owners/managers configure a bay/equipment inspection or maintenance schedule with title, instructions, active employee, priority, interval of 1–3,650 **calendar days**, next date and Eastern due time. No intervals/responsibilities are assumed. The existing independently invoked `npm run jobs` or authenticated `/api/jobs` endpoint generates maintenance tickets up to 14 days ahead. Each (plan, occurrence date) is unique. Tickets snapshot instructions, assignee, target, priority and due time; later schedule edits do not rewrite generated work. Review/cancel/reassign those tickets separately.

Intervals remain anchored in calendar days. Configured closed weekdays and closure dates are skipped rather than moved. Generation requires configured business operating days and an active operations assignee/equipment. Pausing a plan stops new tickets; inactive assignees/equipment are skipped. Creation/rescheduling/resuming accepts current/future dates. After an outage each plan examines at most 62 due occurrences per run and persists its next unprocessed date; repeated checks continue catching up without discarding old dates. Inspect backlog and transaction timeouts before scaling.

The job transaction holds the existing generator lock and then the Phase 3 lock. Maintenance generation, cursors, audit and job-success status commit together. Failures use the existing observable FAILED job history. `JobRun.generated` includes both Phase 1 tasks and maintenance tickets. Overdue maintenance alerts are scoped to active managers and the current active assignee. Employees follow an alert directly to their authorized ticket. Completion, cancellation and reassignment resolve obsolete alerts. No email/SMS or external vendor notification is sent.

## Chemical inventory

Owners/managers register an item with a low-stock threshold, optional supplier and chosen unit: **whole milliliters, grams, or individual items**. Convert package/container quantities before entry; no automatic conversion is performed. Stock is unknown until a physical opening reconciliation. Units cannot change afterward; create another item for a different unit.

Every opening/reconciliation, confirmed physical receipt, usage or disposal movement records signed quantity, resulting balance, business date, unique reference, actor and reason. Reconciliation quantity means the observed total; other quantities mean the amount received/consumed. Dates must be current/past and no earlier than the latest movement. Corrections use a new current physical count with a reason. No ledger edit/delete endpoint exists.

Stock/settings share a version and serialized transaction. Stale entries, duplicate references, negative stock and values above 2,000,000,000 units fail closed. An item with positive stock must reach a documented zero balance before archival. Low recorded stock appears on the item and manager dashboard. History shows the latest 30 movements per item; all movements remain in PostgreSQL. These entries do not place orders, approve chemical purchases or forecast demand.

## Detailing rentals and recorded payments

Only the owner authorizes actual tenant contact, contract reference, start/end dates, monthly integer USD cents, due day (1–31) and maintenance responsibilities. Only detailing bays can be rented. Inclusive agreement dates on a bay cannot overlap; an application lock and PostgreSQL exclusion constraint guard concurrent/direct writes. Open-ended agreements are supported. Terms remain immutable: end the agreement and enter a new nonoverlapping authorized agreement for new terms. Owners can end a current agreement on a confirmed current/past date; they cannot extend its original end through that operation. Unused agreements may be cancelled. History is retained.

Owners, managers and bookkeepers record charges for full current/past calendar months contained within the authorized dates. Due days 29–31 clamp to month end. Charges snapshot the terms. A repeated agreement/month returns the original charge, including a voided charge, without creating another. No automatic billing job, prorated/partial months, deposits, fees, tax, credits, contract signature or tenant portal is implemented. Resolve these cases through the established accounting process; never silently substitute a full-month charge.

Those same roles record actual externally received payments with date, exact integer cents, unique reference and verification reason. Partial payment and outstanding/overdue state derive from entered charge/payment data. Concurrent overpayment and duplicate references fail closed. Managers/owners can reverse an entire recorded payment once with a dated negative ledger entry; the original remains. Bookkeepers cannot reverse payments or void charges. Managers/owners can void a charge only after all net payments are zero. Voided periods stay recorded and cannot be reissued through this workflow. Review paid/charged periods before ending an agreement; void unpaid later charges first. Paid partial-period corrections require accounting reconciliation.

Charges, received payments, reversals, voids and contract changes are audited transactionally. No online collection, bank connection, tenant message, invoice delivery or verified profitability calculation exists. Agreement lists show the latest 100; each agreement's charges/payment history remains addressable by ID.

## Roles and setup

- OWNER: all operational workflows; confirms bay layout/identifier corrections and authorizes/ends rental terms.
- ADMIN: operational register, stock and maintenance management; rental charges/payments, payment reversal and charge void; cannot authorize rental terms or layout.
- EMPLOYEE: report/own operational issues and currently assigned maintenance work only. No directory, chemical/vendor register, costs or rental access.
- BOOKKEEPER: authorized rental reads, charges and received-payment entry; no maintenance/chemical/vendor access, agreement authorization, payment reversals or charge void.

Every service rechecks current active status/role in its transaction. A Phase 3 transaction-scoped PostgreSQL advisory lock serializes registers, inventory, rental amounts and fresh read snapshots for this small business. Money/stock bounds, unique open outages, target consistency and contract overlap have database constraints. Audit storage still trusts database operators.

Back up existing data, then apply migration 004 using `npm run db:migrate`. It adds Phase 3 tables and an optional maintenance link to notifications; earlier migrations are unchanged. PostgreSQL's standard `btree_gist` extension is required for the overlap constraint. A hosting database administrator may need to provision that extension before migration if the release role lacks extension permissions. No secrets or local filesystem storage are required beyond existing configuration. Photo attachments remain unavailable until authenticated object storage is configured and authorized.

Read VERIFICATION.md for checks and deployment status. Confirm actual bay labels/condition, equipment, vendor contacts, inspection intervals/closure behavior, staff responsibilities, chemical units/opening quantities, tenants, agreement terms and rent history before live use. Review OPEN_QUESTIONS.md. Publication, Replit deployment, production migration, real-data verification, backups and actual scheduler provisioning were not performed by this Phase 3 delivery.
