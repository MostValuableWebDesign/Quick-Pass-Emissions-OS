# Phase 4 — Dealerships & finance

Implemented locally on the complete Phases 1–3 source. No business accounts, rates, tax assumptions, opening balances or finance transactions are seeded. Read VERIFICATION.md for checks and publication/deployment status.

## Permissions and setup

OWNER, ADMIN and BOOKKEEPER can read dealership/finance records, manage directory/contact information, record completed services, prepare invoice drafts, enter external receipts and other finance records, and export CSV. Only OWNER authorizes dealership payment terms/default rates/tax. OWNER or ADMIN separately approves invoices and verifies manual finance records; the preparer cannot approve their own record. Only OWNER/ADMIN can void services/invoices/finance entries or reverse receipts. EMPLOYEE cannot access these services, pages or exports. Authentication re-reads active status and role on the server, including inside each domain transaction.

Create an account with a unique code, billing address/instructions, status and private notes. Add multiple contacts with responsibility, email/phone, and checked source. Archive rather than delete. Directory/contact/term edits use versions and transactional audit records. No email is sent.

The owner must explicitly authorize net payment days (0–365), a default service rate, and tax basis points (100 = 1%; 0 must be explicitly entered) with a contract/tax source. These are business configuration, not tax-law advice. Confirm actual applicability and rates through the established accounting process. Changes affect new drafts only.

## Completed services and invoice lifecycle

1. Record a completed service with its actual business date, description, whole quantity, agreed unit rate in USD cents, unique source reference and external evidence. Do not store vehicle owner personal data. Future dates, nonpositive amounts and overflow are rejected. An authorized reviewer may void an incorrect unbilled service; create a replacement with a new source reference.
2. Select 1–100 unbilled services from that dealership and enter a unique invoice number/issue date. Services must be completed on/before issue. The due date is issue plus authorized calendar days, including weekends/closures. The oldest 100 unbilled services are offered first, independently of the recent-service history. No service can be allocated to two active invoices.
3. Drafts snapshot billing identity/address/contacts, owner-authorized terms, default rate, tax setting/source, service descriptions/dates/quantities/rates and exact totals. Unit rates may differ from the default to represent agreed services; the separate reviewer must verify them. No approved snapshot is edited by directory or term changes. Correct a draft by voiding and recreating it.
4. A different owner/manager approves the draft. Drafts are excluded from A/R. Record “sent” only after actual external delivery with a reference/date. The app does not send invoices. Delivery cannot be recorded after an existing payment's effective date.
5. Enter externally received payments with actual date, amount, unique receipt reference and evidence. Approved invoices may receive payments before a delivery record. Dates must follow issue/delivery and the latest receipt/reversal, and cannot be future. Concurrent payments cannot exceed the remaining invoice.
6. An owner/manager may append a full negative reversal with its own unique reference/evidence. Reversal dates follow all recorded receipts; originals remain visible. Reverse all net payments before voiding. Voids use today's Eastern business date, preserve snapshots/lines/history, and release services for a replacement invoice with a new number.

Display statuses are Draft, Approved, Sent, Partially paid, Paid, Overdue and Voided. Paid/partial/overdue are derived from dated payments and due date. Overdue takes display precedence over partial payment; partial amounts remain visible. Draft/approval/delivery/void decisions use version checks. No automatic collection, payment processing, bank connection, PDF generation, email sender or credit-note subsystem is configured.

## Operational finance and integrity

Other revenue/receipts and expenses/disbursements use immutable manual entries with date, category, positive integer USD cents, description, unique external accounting reference and evidence. Estimates require their assumptions and are excluded from manual/verified actuals. A different owner/manager can verify a manual entry against supplied evidence. This human review does not independently prove bank reconciliation or accounting completeness. Estimates cannot be promoted to actuals; void and record an evidenced replacement. Corrections retain original entries, dated voids, reasons and audit history.

Dealer payments, rental payments, reversals and other finance entries share exact unique-reference checks under the rental/finance lock. Reusing a reference is rejected in either direction. Other entries also require an explicit check that the transaction was not already entered as a dealer/rental receipt. Different references can still describe the same economic event; reconcile externally. The tool cannot detect missing or falsely entered evidence.

Dashboards separate approved dealership billing, dealership receipts, rental receipts, manual receipts/expenses, independently verified receipts/expenses and estimates. Never add billing to received cash. Payroll drafts, maintenance cost notes, rental charges, certificate orders and other obligations are not assumed paid. Categories cover emissions, tag kiosk, carwash, detailing, inventory, payroll, commissions, repairs, utilities, vendors and other. The category report retains direction/provenance separation. No net profit, bank balance, tax liability, complete revenue or complete expense assertion is produced. Zero means no matching entered records, not a verified business zero. Existing accounting remains the source of truth.

## Reports and reliable accounting exports

Select an inclusive effective-date range of at most 367 days, ending no later than today in America/New_York. Lists show up to 100 matches; report totals and exports include **all** matching records without a list cap.

A/R aging includes every approved dealership invoice issued through the end date, regardless of the range start. Dated receipts/reversals apply only through that date; dated voids cease recognition on their effective date. Buckets: current/not yet overdue, 1–30, 31–60, 61–90 and 91+ days after due date. Partially paid overdue balances remain overdue. Rental obligations remain in the rental register; rental receipts have a separate export.

CSV datasets: invoices (including retained billing snapshot and status/amounts), invoice lines, dealership receipts/reversals, rental receipts/reversals, other finance entries, and aging. Amounts are integer USD cents; negative reversal rows must be retained. UTF-8 BOM, quoted fields, escaped quotes/newlines and spreadsheet-formula neutralization preserve portable imports. Responses are authenticated, private/no-store, and successful exports are audited. Validate mapping with the actual accounting system before importing. There is no vendor API dependency or automatic posting.

Reports use entered effective dates and **current** approval/verification state; account names in aging use the current directory. Late entries/reviews can change a prior-date report. These are operational reconciliation views, not frozen historical financial statements. Exports retain drafts, voids, estimates and review markers so the accountant can explicitly map/exclude them. Invoice lines report current invoice state.

## Persistence and limits

Migration 005 is additive; migrations 001–004 remain unchanged. Prisma/PostgreSQL tables represent dealerships, contacts, completed services, invoices, retained lines, signed receipts/reversals and finance entries. Exact BigInt intermediates, per-record 2,000,000,000-cent bounds, database check constraints, fresh server role checks, transaction locks and transactional audits protect supported workflows. Phase 4 acquires Phase 3's rental lock before its own lock; rental mutations use the shared reference helper. No reverse lock order is introduced. Trusted database operators can still alter records directly; cryptographic tamper-proof accounting is not claimed.

Limits: USD only; whole service quantities; one configured percentage tax applied to the whole invoice subtotal with half-up rounding once; no discounts, credits, multiple tax jurisdictions, separate surcharges, foreign currency, customer portal, import automation, reconciliation feed, partial reversals, refunds or write-offs. Additional approved charges can be recorded as distinct completed service lines only when they accurately represent the business transaction. Opening A/R cannot be invented: enter documented historical services/invoices and receipts through the reviewed workflow or keep the authoritative opening balance in accounting. No data or external integration is inferred.
