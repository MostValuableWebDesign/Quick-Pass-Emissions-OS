# Marketing

## Implemented scope

Marketing lives under **Business → Marketing**, with results/campaigns, customer sources and Google Business pages. Campaigns, spending, source responses, promo terms/redemptions, action reviews and materials are PostgreSQL records. The additive marketing migration leaves previous test records, payroll, invoices and payments unchanged.

Owners create/edit/archive campaigns, record or void spending, administer offers, apply promotions, approve materials and record actions/reviews. Active administrators can read financial results, edit sources on single dealership services and download approved materials. Station-evidence sources remain owner-only. Historical employee/bookkeeper sign-ins are not restored. All reads and writes recheck active roles on the server; transactional writes include audit records.

This installation has one configured station. Campaigns/promos contain station participation explicitly, but arbitrary additional stations are rejected until a multi-station authorization model exists. No new station registry or parallel customer/payment system is introduced.

## Source and attribution

- “How did you hear about us?” is optional in the existing completed dealership-service workflow and station evidence detail. Existing records can be updated under Customer sources.
- A missing response stays `null`; an explicit Unknown stays Unknown. Neither is assigned to a campaign automatically.
- Customer-reported campaign and automatically tracked promo campaign are separate records. The promo campaign takes precedence for campaign attribution; it does not overwrite the customer response.
- Each source target has a database uniqueness constraint. If a dealership service is also linked to station evidence, the inspection is counted once. For conflicting linked source responses, the latest explicitly saved response is used.
- No source response creates a customer record. Imported historical inspections are not given invented attribution.
- Paid status on unlinked single dealership services is a manual evidence-supported classification, not a portal-derived finding. Batch services do not support per-customer sources or offers.

## Metric definitions and limitations

The reporting period is an inclusive station-local date range in America/New_York, at most 366 days. Today/future periods and gaps in attested import coverage are marked partial. There are no automatic fair-period comparisons or forecasts.

**Recorded spending:** dated marketing expense records, separately entered with a unique receipt/invoice reference. Budget is a plan, never actual spending. Voids retain records and reasons. These entries do not automatically write to the finance ledger or charge a bank account.

**Attributed paid inspections:** supported paid inspections with an explicitly reported campaign or a tracked redemption. Station records must be confirmed and have current source evidence. The shared VIN/30-calendar-day rule identifies free repeats; absent VIN or incomplete lookback remains unclassified, not assumed paid. Complete history requires owner-attested imports that remain consistent with current revisions. A known repeat within 30 days remains free even with otherwise incomplete history. Pass/fail are supported; aborts do not become paid inspections.

**Collected revenue:** not Performance’s $20 estimate. Existing dealership invoice receipts are allocated proportionally to the net-of-tax invoice line amount. The numerator is actual signed receipts dated in the selected period, regardless of inspection date. Invoice reversals subtract on their recorded date; over-collection is capped by invoice total. Integer division leaves sub-cent allocation remainders unallocated rather than duplicating them. Individually linked, independently verified manual retail revenue evidence is also supported. Unverified entries, estimates, voided evidence, duplicate/shared receipt links and unclassified/free inspections do not establish attributed paid collections. Arbitrary retail checkout/collection is not implemented.

**Redemptions and discounts:** recorded code uses, with cancellation/refund state derived from the existing service/invoice/payment history. Unbilled service voids and invoice voids cancel the active discount; signed receipt reversals show refunded or partially refunded state. Offer terms remain frozen. Cancellation/refund never restores lifetime usage slots. A partial refund cannot identify which physical inspection caused the refund; allocation remains proportional to invoice lines.

**Cost per attributed paid inspection:** recorded spending divided by supported attributed paid inspections, rounded to cents. With no actual spending or no supported paid denominator, it is unavailable. It is not causal ROI, profit, incremental revenue or an effectiveness ranking.

Unknown/missing response coverage and source breakdowns cover all recorded inspections at the selected station/date range. They cannot be campaign-filtered because unknown sources cannot identify a campaign. Attribution counts, redemptions and financial results follow the campaign/channel filters. Reports use persistent reviewed station evidence and explicitly classified dealership services; they do not silently manufacture attribution from aggregate Performance cache totals.

## Promotions and existing billing

Codes validate normalized unique identity, active campaign, inclusive validity dates, station participation and positive lifetime usage limits. Fixed amounts use cents; percentages use basis points with deterministic half-up rounding. Calculation and redemption occur inside the existing financial transaction, serialized with campaign administration. Rejected offers roll back the entire service.

Only an owner may apply a code to one completed, evidence-supported paid emissions service. The original unit amount, discount, final amount, campaign offer and exact code terms are retained. Existing approved invoice snapshots and receipt/reversal procedures are unchanged. Free retests, unknown paid status, batches and offers resulting in a zero charge are rejected: the existing invoice workflow requires positive charges. Retail checkout discounts are unavailable rather than simulated through a new payment system.

## Materials and external dependencies

Copy drafts and private PNG/JPEG/PDF uploads are supported, at most 2 MB. Content signatures, extension/type consistency and size are checked; this is not a malware scanner. Files download as attachments through an authenticated, role-checked route, never a public storage URL. Owners see drafts; administrators see approved materials. Approved content is immutable; revisions require a new draft. Marketing uses a private App Storage adapter for file bytes and PostgreSQL metadata. The adapter is separate from business logic so another private blob provider can replace it.

No authorized Google Business Profile analytics/review connection was present. The Google Business page explicitly shows Not connected, without invented metrics, review themes, counts or reply drafts. Adding that requires authorized provider access and must reuse an existing connection if one becomes available. Profile interactions must remain separate from inspections/collections. Review themes/reply drafts require dated authorized review evidence; publication is outside this module.

Nothing sends marketing email/texts, buys ads, posts social content or publishes Google replies. Planning an action records owner intent and a frozen evidence baseline; recording a later review preserves it and adds status/results notes.

## Verification and release state

Typecheck, ESLint, unit/database tests and the signed-in browser journey are the relevant local checks. `pnpm run test:isolated --tests=marketing-database.test.ts,marketing-rules.test.ts,navigation.test.ts,e2e-safety.test.ts` uses a generated disposable database. `E2E_MARKETING_ONLY=1 E2E_DIRECT=1 pnpm run test:e2e` covers owner creation, editing, real expense reporting, draft copy and archive persistence without changing the managed preview’s datasource/session.

Private storage was smoke-tested with a temporary synthetic file: upload, server-adapter read-back, and deletion. That is not proof of end-to-end production file delivery or Google integration. No real promotion was redeemed or invoice/payment changed during verification. No commit, push or publication is part of this request.

Local verification completed: application typecheck, ESLint and production build passed; all 63 targeted unit/database checks passed; the isolated signed-in campaign create/edit/expense/material-copy/archive journey passed without skips. New Marketing files pass formatting checks. The full application formatting command still reports issues in other existing files. The managed preview restarted successfully, and an unauthenticated request to the private material-download route correctly redirected to login. The Google boundary remains unconnected, and production has not been changed.
