# Owner decisions before operational use

## Station report access and business configuration

- The October 9, 2026 configured-station report was parsed live in memory (94 exported rows; ten visible sample rows matched), but no supported API/unattended-automation permission or stable report test identifiers have been established. Manual original-report mode is delivered; do not enable scraping based only on successful authentication.
- Owner must confirm business-week start, operating hours/closures, source calendar timezone meaning, exact historical inspector attribution, outcome eligibility/prices and exceptions in Performance setup. No real business values were inferred.
- Provider zero-test, correction, all-page/cutoff and fee/payment semantics remain unverified. Empty reports cannot prove zero; current-day/week test/revenue/gross-pay forecasts remain insufficient. See STATION_HISTORY.md.

Before live Phase 5 use: confirm daily/weekly Eastern summary times, weekday, closure behavior; policy advance/escalation days and authorized regular/escalation recipients for each domain; inventory observation windows, minimum usable history, planning leads and per-unit thresholds; person responsible for missed-run/terminal-failure review and persistent scheduler/dead-man monitoring. No values are inferred from business examples. Confirm whether zero days before escalation means immediate maintenance escalation once its due instant passes.

1. Who is the owner account holder, who can be general manager, and who verifies employee identity before delivering an invite?
2. Confirm actual opening days, operating hours, holiday calendar, task due times, weekend duties and the chosen DST rule.
3. Confirm employee contact details, roles, work areas, active status, schedules, training/certification dates and responsibilities. Demo names and shifts are not authoritative.
4. Which responsibilities require review? Who handles overdue critical work, and after what delay?
5. Confirm the deployed hostname, PostgreSQL provider, backup retention, recovery objectives, external scheduler and person responsible for job failures.
6. Confirm whether one shift per employee/date and the single certification-expiry field are sufficient for the initial workflow.
7. Before live Phase 2 use: verify current compensation arrangements, eligible test attribution, commission thresholds/rates/effective dates, approved payroll periods and payroll export destination.
8. Before live Phase 2 use: reconcile certificate stock and confirm ordering units, minimum quantity, reorder threshold, purchase approvers and approved ordering channel.
9. Before live Phase 3 use: confirm the three self-service and three detailing identifiers/condition, equipment, verified vendor contacts and sources, responsibility assignments, inspection intervals and closure handling, chemical measurement units/opening counts/thresholds, tenant contacts and authorized rental terms.
10. Before live Phase 4 use: confirm dealerships, rates, tax configuration, payment terms, actual balances and accounting source of truth.
11. Before external effects: confirm email sender, approved invoice delivery process, object storage and any explicitly authorized integrations.

All unknown financial, licensing, vendor, bank and regulatory information remains unconfigured. There is no implied approval to operate or connect a regulated system.

12. Assign at least two authorized preparer/reviewer accounts. Confirm fixed-per-period versus hourly-minute semantics, payroll employee roster including final pay, how completeness is attested, and the processor mapping for exact-cent gross CSV. Overtime, taxes and post-approval corrections are handled outside this preparation tool.

13. Confirm whether whole milliliters/grams/items cover actual chemical measurements and which staff can verify receipts, usage and disposal. No package conversion or chemical purchasing is automated.
14. Confirm rental calendar-month billing, month-end due-day clamping, agreement date boundaries and payment source references. Partial-month rent, deposits, fees, credits, taxes and amended paid periods require the established accounting process. Confirm the owner-authorized handling before entering these cases.
15. Confirm maintenance review responsibility and repair-cost source, the process for follow-up corrections to closed work, and the external scheduler/operator for preventative jobs. Configure `btree_gist` permissions with the database host before migration 004.

16. Confirm per-dealer authorized net terms/default service rates/tax basis points (including explicit zero), unique invoice numbering, completed-service and receipt evidence, independent reviewers, historical opening A/R documentation, treatment of charges/credits and the accounting import mapping. The current tax model is one percentage on the whole subtotal; unsupported cases stay in accounting. Confirm procedures that prevent other finance entries duplicating existing receipts under different references.
