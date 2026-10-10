# Development roadmap

## Phase 1 — operations foundation

Implemented: authentication and invites; server-enforced roles; employee directory and active status; shifts; task templates and occurrences; assignment, completion, notes, history and reviews; exception dashboard; in-app overdue notifications; independent jobs; audit logs; migration, demo seed and automated tests. See VERIFICATION.md for actual checks, limitations and deployment status.

Before live use: resolve OPEN_QUESTIONS, bootstrap a real owner on a clean database, configure operating days and tasks, arrange backups and external job triggers, review role access and run smoke tests on the deployed hostname. Validate business responsibility assignments with the owner.

Small follow-ups within Phase 1, not claimed as delivered: richer multiple-certification/training records, task attachments with authenticated object storage, split/multiple daily shifts, self-service password recovery via verified email, advanced schedule conflict checks, bulk audited reassignment, filtered audit exports and recurrence replacement automation.

## Phase 2 — payroll and certificates (implemented locally)

Implemented: owner-authorized effective-dated pay/commission configuration; approved personal emissions counts; duplicate-safe imports; approved worked-minute inputs and completeness attestation; nonoverlapping payroll periods; exact-cent drafts, retained revisions, independent approval and approved CSV export. Certificate movement ledger, versioned physical reconciliation, consumption/void entries, estimated depletion/reorder banner, purchase request/approval, recorded external orders and partial receipts. See PHASE2.md and VERIFICATION.md for verified behavior and limits. No automatic wage payments, tax engine, ACH or official analyzer integration. Publication/deployment and real owner configuration are separate.

## Phase 3 — carwash and maintenance (implemented locally)

Implemented: owner-confirmed three self-service/three detailing bays, condition/responsibility and downtime history; equipment and verified vendor registers; employee issue reporting, assigned work and manager review; corrective tickets and independently scheduled preventative tickets; chemical stock ledger/low-stock dashboard; owner-authorized rental terms, nonoverlapping contracts, monthly charge snapshots, received payments, reversals and unpaid voids. Read PHASE3.md and VERIFICATION.md for exact semantics, permissions, full-month rental limits, verification and deployment status. Actual records require owner/staff configuration. Optional secure photo storage remains deferred until a configured provider and authorization design exist.

## Phase 4 — dealerships and finance (implemented locally)

Implemented: account/contact directory, owner-authorized terms/default rates/tax, completed services, duplicate-safe invoice allocations and frozen lines/billing snapshots, separate approval, external delivery records, received payments/full reversals, dated voids, A/R aging, manual/verified/estimated revenue and expenses, category reports and six authenticated audited CSV exports. Read PHASE4.md and VERIFICATION.md. Accounting remains the source of truth; no profit inference, payment execution, invoice email/PDF or automatic accounting posting. Actual accounts, rates, tax treatment, balances and import mapping require verification.

## Phase 5 — advanced automation (implemented locally; publication pending)

Implemented: current owner-only consolidated exceptions; versioned owner schedules/policies; immutable saved daily/weekly Eastern summaries and internal delivery history; source-revalidated maintenance/certification/dealership/rental reminders with acknowledgement separate from resolution; per-ledger configured depletion estimates; complete date-filtered operational reports and audited uncapped formula-safe CSV; durable occurrence/claim leases, bounded retries, missed-run cursors and owner failure recovery. Phase 4 financial calculations remain reused rather than replaced. Read PHASE5.md and VERIFICATION.md.

GitHub publication is currently blocked by native Git credential rejection. Production deployment/migrations, real persistent scheduler setup, external dead-man monitoring and real owner configuration remain separate and are not claimed as performed. External sending remains disabled.
