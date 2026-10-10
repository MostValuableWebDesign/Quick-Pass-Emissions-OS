# Phase 2 — payroll and certificates

Current access policy: this app is exclusively for owners and management (OWNER/ADMIN). Employees and legacy bookkeepers cannot sign in or use any workflow. Staff profiles remain business records for management; management records their progress and receives all alerts. See README's Management-only access section. Historical role descriptions below are superseded by this policy.

Phase 2 is implemented locally on top of the Phase 1 repository. No business rates, eligibility, actual counts, wages, stock, order confirmations or payments are seeded. Test fixtures are illustrative. GitHub publication and deployment require a separate instruction.

## Payroll workflow

1. An owner authorizes a dated pay arrangement and dated commission eligibility/policy for each payroll employee. Amounts are **integer USD cents**. FIXED is the amount for one entire payroll period; HOURLY is cents per hour. Configure dates carefully; existing versions cannot be edited or deleted. New versions require a reason. Station totals are not accepted as personal attribution.
2. Owners, managers (ADMIN), and bookkeepers record personal daily counts or paste a JSON array of up to 1,000 rows with `employeeId`, `date`, `count`, `sourceRef`, and `reason`. The batch is atomic. Identical source retries are ignored; conflicting references or a second record for the same employee/date are rejected. Explicit numeric zero counts are supported; blank, null and boolean values are rejected for counts, compensation amounts and commission thresholds.
3. A different owner/manager approves each count. Nobody may approve their own entry or their own personal count. Corrections use the displayed version, preserve before/after audit details, and clear approval.
4. Create a nonoverlapping payroll period, then record each employee's worked minutes and attest that all personal counts have been checked, including zero-test days. Enter zero minutes for FIXED. Shifts never become approved work hours automatically. Only ended periods can be prepared. A different owner/manager approves each payroll input; self-compensation approval is prohibited.
5. Generate a draft after all sources are approved. Include active employees with a pay arrangement effective during the period and every employee with recorded period counts. Employees outside that configured roster may be included explicitly. Missing days require the preparer's completeness attestation; the application cannot independently verify an official report's completeness. Ended employment/final pay must be reviewed explicitly. Periods cannot cross a pay arrangement change; cancel a mistaken open period with a reason and create correctly bounded periods.
6. Commission uses `max(0, approved personal daily count - threshold) × rateCents`, selecting the employee's policy effective on each date. Hourly base pay uses approved integer minutes, rounds half up once per employee/period, and uses BigInt intermediates. Gross total excludes taxes, withholding, overtime premiums, benefits and deductions; handle those in the established payroll processor. An hourly arrangement must describe the approved straight-time amount to prepare; this is not a wage-law compliance engine.
7. Drafts freeze period source changes and retain employee name/ID, arrangement ID/version fields, approved time input, each daily count/reference/approval, effective daily policies, cents and rounding convention. A different owner/manager reviews the draft; nobody may approve a draft containing their own compensation. Return a draft with a reason to unlock corrections; a new revision retains the returned calculation. Approved periods are immutable. Post-approval adjustments must be handled with the payroll processor; no automatic reversal or amended-payroll feature is claimed.
8. Owners, managers and bookkeepers download only **approved** drafts as CSV. Every export is audited, responses are private/no-store, and formula-leading text is escaped. Columns include stable employee IDs, period dates, exact base/commission/gross cents, USD currency and approval metadata. Map this neutral CSV to the processor's required format before live use; no provider-specific importer or automatic transmission exists.

Monetary fields/totals are bounded at 2,000,000,000 cents; unsupported overflow fails closed. Policies and arrangements affecting a frozen period cannot be added retroactively. These guards conservatively freeze dates for the whole period, including other employees.

## Certificate workflow

1. The owner confirms minimum order (at least 300), reorder point, expected delivery lead days and 7–90-day usage window. An owner/manager records a physical opening count with a reference, date and reason. Stock remains unknown until that entry exists.
2. Owners/managers record USAGE or VOID consumption. All movements have unique references, an Eastern business date, actor, reason, signed delta and balance after recording. Reconciliation compares a new observed count with the current balance and requires its current version. Stale forms are rejected. No stock-deleting or movement-editing endpoint exists; correct by a new documented physical reconciliation.
3. Inventory changes, receipts, approvals and audits share a PostgreSQL transaction-scoped advisory lock. Concurrent consumption cannot overspend stock; duplicate references and excess receipts roll back. Usage/receipt dates cannot precede the latest reconciliation or occur in the future. Reconciliations cannot precede existing later-dated movements. The ledger is displayed in recording order, not claimed as a retrospectively reconstructed official ledger.
4. Forecasts divide recorded USAGE plus VOID by elapsed calendar days in the configured window, bounded by opening date. Days with no recorded usage contribute zero **to the estimate**, not evidence of official zero usage. Zero usage leaves depletion unknown. The reorder threshold is the greater of the owner's configured threshold and estimated lead-time demand. The recommended quantity replenishes toward threshold plus one usage window, at least the configured minimum. A live manager dashboard banner and inventory alert expose low recorded stock. No persistent email/SMS or new inventory background job is configured.
5. A finance-role user creates a purchase request or clicks **Draft recommended purchase**. A single outstanding requested/approved/ordered purchase prevents duplicate recommendations. A different owner/manager approves or cancels a request; approved quantity and minimum-order snapshot cannot be edited. A finance-role user records an external order confirmation and optional payment reference after approval. The application never places an order or initiates payment.
6. Owners/managers confirm physical receipt against an ORDERED purchase. Partial deliveries are supported up to the approved quantity; each delivery needs a unique reference. Only receipt adds ordered stock. A fully received purchase closes; its movements/history remain. There is no automatic official analyzer reconciliation or regulated-system integration.

### Manual official ordering navigation

**Order Certificates** opens `https://gadashboard.com/Purchasing/Purchasing.aspx` in an ordinary
new browser tab (`noopener noreferrer`), not an embedded portal or purchase integration. Login
and all purchasing decisions stay on the official Georgia dashboard. If login redirects elsewhere,
return to the unchanged app and select the link again; destination preservation is not guaranteed.
Opening or reopening the link writes nothing and does not acknowledge or resolve alerts.

Finance roles can use the Inventory action. The existing management Dashboard and live
owner-exception certificate low-stock surfaces retain their original audiences; setup,
unknown-stock, chemical warnings and historical summaries are not given a certificate-order
action. Notifications and Reminders currently have no certificate-stock alert source.
Internal request/history links remain in the same tab. Use the existing request → different
OWNER/ADMIN approval → manual external-order reference against approved quantity → confirmed
physical receipt workflow. Navigation never grants approval, claims successful portal login or
ordering, or adds stock.

## Roles and operating limits

- OWNER: authorizes configuration; prepares records; approves another person's sources, drafts and purchases.
- ADMIN: prepares records, reconciles/consumes/receives stock and independently reviews sources, drafts and purchases; cannot authorize pay/policy/inventory settings.
- BOOKKEEPER: reads these modules, records counts/time inputs, generates drafts, exports approved payroll, requests purchases and records external orders. Cannot approve, reconcile, consume or receive stock.
- EMPLOYEE: no Phase 2 records or endpoints, including peer wages, rate history, purchase details or export contents. Phase 1 own-task access remains.

At least two appropriately authorized people are required for approvals. Every service re-reads current active status and roles on the server. All sensitive mutations/exports are transactionally audited. Database operators remain trusted; this is not tamper-proof audit storage. No SSNs or bank account credentials are collected.

Daily-count review has 100 rows per page, all/pending-approval filtering and an optional payroll-period date range. Period details link directly to their count review. Payroll periods remain selectable across the full history. Other lists show the latest 100 records (and 100 of each configuration type). Forecast depletion dates beyond year 9999 are unavailable; the numeric estimate remains visible. All history stays in PostgreSQL; payroll period details remain addressable by ID. Advanced filtered history/export, employee payslips, overtime/taxes, amended payroll, bulk time imports, multi-stock locations, ordered-purchase disputes/cancellation after ordering, stock attachment storage and automatic notifications are outside this Phase 2 implementation.

## Deployment and verification

Read VERIFICATION.md for actual results. Apply all version-controlled migrations (including Phase 3 migration 004 when using this complete source) with `npm run db:migrate`; never reset business data. Configure real owners/approvers, current compensation, attribution, periods, export mapping, actual opening inventory and ordering terms before live use. Keep production, demo and `_test` databases separate. Existing Phase 1 scheduling/backup requirements still apply.

The generic Next.js production command remains `npm run build`. This host blocks Turbopack's CSS-worker port binding; `npm run build -- --webpack` uses the supported alternate builder for local verification. On hosts where Turbopack works, the ordinary build is unchanged.
