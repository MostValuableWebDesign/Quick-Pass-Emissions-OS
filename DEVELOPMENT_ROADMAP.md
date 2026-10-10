# Development roadmap

## Phase 1 — operations foundation

Implemented: authentication and invites; server-enforced roles; employee directory and active status; shifts; task templates and occurrences; assignment, completion, notes, history and reviews; exception dashboard; in-app overdue notifications; independent jobs; audit logs; migration, demo seed and automated tests. See VERIFICATION.md for actual checks, limitations and deployment status.

Before live use: resolve OPEN_QUESTIONS, bootstrap a real owner on a clean database, configure operating days and tasks, arrange backups and external job triggers, review role access and run smoke tests on the deployed hostname. Validate business responsibility assignments with the owner.

Small follow-ups within Phase 1, not claimed as delivered: richer multiple-certification/training records, task attachments with authenticated object storage, split/multiple daily shifts, self-service password recovery via verified email, advanced schedule conflict checks, bulk audited reassignment, filtered audit exports and recurrence replacement automation.

## Phase 2 — payroll and certificates (not implemented)

Effective-dated commission configuration, approved per-employee emissions counts, payroll periods/drafts/review/export, exact-cent calculations and historical snapshots. Inventory movement ledger, reconciliation, certificate forecasting, purchase requests and approval. Tests: attribution, thresholds, money precision, duplicate imports, concurrent inventory, authorization and approval separation. No automatic wage payments or ACH.

## Phase 3 — carwash and maintenance (not implemented)

Six bays, equipment registry, downtime events, corrective/preventative work, vendors, chemicals and detailing rentals. Verified contact/contract data only. Optional secure photo storage requires a configured provider and authorization design.

## Phase 4 — dealerships and finance (not implemented)

Dealership accounts, invoice line items, approval and payment records, aging, operational revenue/expenses, report exports and accounting integration boundary. Distinguish entered data, verified actuals, estimates and missing records. Email/PDF delivery is separately configured and authorized.

## Phase 5 — advanced automation (not implemented)

Owner summaries, maintenance/certification reminders, forecasting, receivables reminders and analytics. Reuse job locking, idempotency and audit patterns. Add persistent queues/outbox only when requirements justify them.

Phases 2–5 require explicit user authorization before implementation.
