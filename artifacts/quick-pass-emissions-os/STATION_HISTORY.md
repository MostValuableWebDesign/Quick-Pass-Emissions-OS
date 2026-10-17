# Station history and performance

## Two-year owner-controlled import and returning vehicles

The newer **Performance → Historical import** workflow extends canonical inspection evidence with persistent monthly windows, explicit Start/Pause/Resume, source-total reconciliation, row decisions and conservative VIN/plate matching. It uses the existing bulk-export reader and shared cooldown, with CSV/original `.xls` fallback. It does not schedule background collection or infer payment from outcomes. See [INSPECTION_HISTORY.md](INSPECTION_HISTORY.md). This extends the historical manual-import scope described below; earlier live-verification notes remain historical evidence, not proof of a new two-year collection.

## Owner-triggered daily portal lookup

Performance supports **Get daily count from portal** for a selected single date.
An active owner initiates a read-only server request: sign in to `gadashboard.com`,
submit Test History / VIR Reprint for the configured station and one inclusive date,
then retrieve the original export. Export row count must equal the portal pager's
stated total; station/date metadata must match. This avoids counting only the
first displayed page. Missing totals, partial exports, changed forms, unexpected
redirects, oversized responses, CAPTCHA/MFA or failed login stop the lookup.
Missing/empty reports are not presented as verified zero days.

Only aggregate date, outcome counts and retrieval time are retained in owner audit
history; the saved snapshot is shown again for that date after reload. Portal
cookies and original exports stay in memory and are discarded. Credentials remain
server-side in the existing GA Secrets.

Daily-count and Performance test exports now share a persistent per-station reservation,
including across owners, browser tabs and app processes. One lookup run may be active at a
time. After it completes, all entry points (including manual refresh and different dates)
observe a 60-second cooldown; a failed run sets a shared five-minute cooldown. The server
returns a wait message while retaining saved data.

Historical Performance requests cover at most three days each and use at most three
requests per run, including single-day checks needed to establish an explicit empty date.
Selected report dates are prioritized and never bundled with supporting trend/retest dates;
today's request also stays isolated. Successful batches are cached before proceeding;
missing history resumes on a later owner-triggered load after cooldown. No absent date is
invented as zero and there is no unattended retry/polling.

When the selected report is verified but 30-day VIN history is incomplete, Performance shows
the raw report-row total separately while paid-car counts and revenue remain pending.
An invalid supporting export does not erase an already verified selected-date cache.

A row with an invalid/missing VIN, inspector or result no longer rejects an otherwise
complete Performance export. Station, date, table layout, duplicate and pager-total
checks still apply to the whole export. Incomplete rows are excluded from daily and
employee counts, revenue, commissions and the VIN lookback; remaining complete rows
continue to be classified normally. A later repeat matching only an excluded row may be
counted as paid. A warning gives the number of excluded rows and the source date.
Reviewed imports and the separate daily-count export remain strict; no test identity,
payroll input or VIN repair is fabricated.

These partial Performance snapshots are cached with a visible warning rather than
throwing an export failure and starting the five-minute failure cooldown. They observe
the normal successful-request cooldown. Historical incomplete rows are not retried on
every page visit; manual Refresh can retry them, and stale current-day data can still
refresh as normal. Their warning appears only when the selected date or inclusive range
contains that incomplete report date; known issue dates remain available internally to
prevent repeated automatic export attempts for an out-of-range date.

All test-export network requests share a 45-second operation deadline. The reservation
expires after two minutes if a process disappears; token checks prevent an expired run
from storing results or releasing a newer reservation. Network work runs outside database
locks. Migration `202610120002_station_test_export_gate` adds only coordination state.

There is **no API, scheduled scraper, automated purchase, automatic record import,
payroll reconciliation or approval**. Counts include failed/aborted report rows,
not proven unique vehicles or qualifying employee counts. Source timezone/cutoff
and zero-report semantics remain unverified. Current-day results are a snapshot,
not a completed-day guarantee. Reviewed station history still uses the import/review flow.

An authorized read-only lookup on October 10, 2026 retrieved the October 9, 2026
export: **94 rows (77 Pass, 15 Fail, 2 Abort)**, matching its 94-item pager rather
than its ten-row first page. No individual business test records were inserted.

## Earlier manual-import discovery

**Manual original-report import, not live synchronization.** On October 10, 2026, authorized read-only discovery successfully used the configured credentials and station for the inclusive **October 9, 2026** Test History / VIR Reprint query. The portal's first displayed page had ten test links. Its original Excel export was actually HTML (`application/ms-excel`, `.xls`), with **94 valid rows** for that date. The application's real server parser validated all 94 rows in memory, and the six source fields of all ten displayed sample rows matched exported fingerprints. No real rows were inserted into the business application and no original export or authenticated response was saved.

This earlier discovery established a working **report parser**, not a supported unattended portal integration. No documented API, stable identifier guarantee, correction protocol, report cutoff, zero-test semantics, future all-page export guarantee, or unattended automation permission was established. Authentication alone is not permission to schedule scraping. No CAPTCHA/MFA bypass, destructive tests, other-station queries, analyzer calls or record changes were attempted. No portal adapter existed at that stage.

The observed export contains:

- `Waiver Date`: inclusive `MM/DD/YYYY - MM/DD/YYYY`; `Station ID`.
- `VIN`, `License Plate`, `Test Date`, `Issued By`, `Cert Number`, `Result`, and a print-action column.
- Minute-resolution local display timestamps with AM/PM. **No timezone/offset**. Normalized calendar dates are inferred until the owner explicitly confirms their New York business-date meaning. No UTC instant or disambiguated DST timestamp is fabricated.
- Exact display-name labels in `Issued By`, **not inspector IDs**. `Abort`, `Fail`, `Pass` were observed, not assigned automatic financial/commission meanings.
- **No fee, receipt, bank settlement, dealership or payment evidence.**

On-page detail links contain a source identifier that the export omits. Certificates and VINs are not assumed unique test IDs. The report mode cannot preserve identifiers that the source report does not supply. It does preserve certificate/outcome/inspector/local-time evidence separately from owner classification and inferred dates.

## Secure setup (development)

Keep `GA_DASHBOARD_USERNAME`, `GA_DASHBOARD_PASSWORD`, and `GA_STATION_ID` in Replit Secrets. Only the server reads station configuration; the application never returns station-secret values or credentials. Manual imports use only `GA_STATION_ID`; username/password are consumed by an explicitly owner-triggered portal lookup, never by ordinary imports.

The additive `202610100007_station_history` migration follows the six unchanged existing migrations. Do not reset the database or replace existing payroll/finance tables. Generate Prisma and apply development migrations using the established project command:

```sh
pnpm --filter @workspace/quick-pass-emissions-os db:generate
pnpm --filter @workspace/quick-pass-emissions-os db:migrate
```

These instructions are **for the development database only**. No production deployment/migration is part of this delivery. Use the documented, separately approved publishing process for production; do not run startup DDL or add migration build hooks.

Open **Performance → Setup & imports** as the active owner:

1. Confirm an effective date, ISO business-week start, each day's operating hours, observation window and minimum usable days. No hours/week start, wage, threshold, price, eligibility or overtime rule is inferred. Omitted weekdays mean explicitly closed. Overnight shifts must be split by business date. Existing **Settings** supplies closures.
2. Confirm source calendar dates correspond to America/New_York before reconciling counts. Provider timezone remains unverified; the owner confirmation is recorded rather than represented as provider documentation.
3. Add exact inspector-label → employee mappings and effective-dated outcome eligibility/retail prices in **integer cents**, with reasons. These are owner-approved settings, not illustrative business defaults.
4. Use the existing payroll policy and compensation controls for wages/thresholds, actual payroll periods and independently approved **worked** time. Scheduled shifts never become payroll time.

## Import, identity review, coverage and recovery

Corrections invalidate coverage for both their old and new business dates, even when the corrected row no longer appears in the old range. Existing attestations remain as historical evidence; dashboard/history/reconciliation reject them until a later owner comparison. Older correction audits lacking date bounds fail closed for that station.

The provider's zero-report semantics remain unverified. An empty current station day cannot be attested, reconciled into payroll, or used as a complete projection observation—even when an old nonempty report or a wider report range covers that date. Re-attesting an old report after its records move to another date cannot establish zero tests. An employee may still have a supported zero qualifying count on a nonempty, independently reviewed station day when the mapped test evidence belongs to other employees; that replacement remains unapproved until independently approved through Payroll.

1. In the portal, enter inclusive business dates and the configured station only; clear any VIN/certificate/plate/waiver filters. Compare all page counts. Export the original `.xls`, not a transformed CSV or invented template.
2. Import original report files of at most 2 MB. Changed columns, missing station/date metadata, binary Excel, invalid/out-of-range timestamps, wrong station, missing evidence or indistinguishable duplicates **fail explicitly**. An empty report is rejected because its zero-test meaning is unverified; absence of files/rows is never certified as zero.
3. Exact row fingerprints are skipped across repeats, concurrent and overlapping imports. Each new row starts **pending identity**, even when an exact inspector mapping exists. Review each row as a genuinely distinct test or explicitly link it as a correction. Do not treat matching VIN/time/name/certificate as proof. A report containing multiple indistinguishable rows requires a better source with stable IDs; it cannot safely be collapsed.
4. Linking a correction requires the incoming and original record versions plus a reason. It appends a revision, supersedes the incoming placeholder and returns the original to pending review. Old fingerprints stay retained, so reimporting an old file does not revive its previous state. If VIN information changed, use the explicit verified-original ID/version form, not automatic matching.
5. Existing records keep their historical attribution. New mappings do not rewrite them. Use the explicit reattribute review checkbox, with reason, to reapply the exact mapping effective on the source date. Unmapped raw labels remain visible without guessed employee names.
6. After importing **every** page/file and resolving identities/corrections, compare the portal's total with the **combined distinct confirmed current records for the range**, then attest a successful import's range. This is visibly **owner-attested report coverage**, never a complete live query. File row counts alone are not proof; the attestation rejects mismatched totals and unresolved identities. Review again if new source revisions arrive after the attestation. The same form permits renewed attestation.
7. New/partial/failing imports never delete absent records or silently invalidate/overwrite history. Source revisions arriving after coverage review make the affected days incomplete. Last successful import is preserved even after many failures; it is not a last successful live sync. Recent attempts show safe errors, inserted/repeat counts and server elapsed time. The UI shows live elapsed upload time and historical duration bounds when known, qualified by sample count/report size; portal query duration and future completion time are unknown.

Imports are bounded synchronous database transactions, not background jobs. A connection/commit failure produces a failed attempt when the database is available; the transaction cannot partially insert records. Retrying an uncertain submission is safe because fingerprints deduplicate committed rows. An unavailable database cannot persist its own failure. There is no cancellation/retry scheduler or query-page worker in manual mode. Do not equate the on-screen timer with scheduled execution.

Raw HTML, full VINs, plates, credentials, portal cookies, viewstate and authenticated detail URLs are never persisted by ingestion. Full VIN is used transiently for an opaque matching hash; only the last four characters are displayed/retained as vehicle text. Necessary source labels/times/results/certificates, revisions, import digests and reasons are retained. Uploaded HTML is parsed as inert text, never rendered/executed.

## Personal count reconciliation and approval

After an ended business day has current owner-attested coverage and every row's identity, mapping and eligibility is resolved, choose an employee/day and explicitly **replace** its count. This is not additive ingestion.

- The existing unique employee/day count, optimistic version, audit, source reference and payroll freeze checks remain. Existing source references are retained with a separate station reconciliation/evidence link.
- Reconciliation records the current record/revision/version set and reason, increments the personal count version and clears its approval.
- Existing independent approval is mandatory. An owner who prepared the replacement **cannot approve it**; an authorized different owner/admin must approve in Payroll.
- Approved/drafted payroll freezes reject replacements. Return a draft through the established workflow before attempting allowed source edits; never rewrite approved snapshots.
- Later source/attribution/eligibility changes flag reconciliation **needs review**, but do not touch the approved personal count or immutable payroll. Reconcile again explicitly only when the payroll period is open. Repeated explicit replacements can clear approval again; this is disclosed, not a background side effect.
- Reports lacking proved zero semantics cannot establish employee/day zeros for absent records. A fully reviewed nonempty station day can establish zero eligible tests for an explicitly selected employee.

## Revenue and payroll explanations

Station recorded tests, pending identities, price-derived estimates, existing approved dealership invoices and money received are separate. A confirmed `RETAIL` test with a matching owner-approved effective price contributes an **estimate**, not collected cash. No matching rule or unresolved disposition is unresolved, not zero. The outcome rule's date, price, eligibility and reason appear in evidence.

Retests/no-charge/failed/abort/void exceptions must be explicitly classified using owner evidence; source outcomes do not automatically mean collected fees. `EXCLUDED`, `DEALER` and `FINANCE` classifications do not contribute a retail estimate. Dealership links require same-date unvoided service capacity; manual finance links require same-date, unvoided actual revenue and cannot be allocated twice. Linked evidence remains subject to existing invoice approvals and signed receipt/reversal behavior. Voiding existing evidence never silently changes station history. Existing finance totals are clearly labelled **global business register**, not station-specific payments, and never summed with station estimates. There is no profit/complete-accounting claim.

Daily commissions use the existing exact-cent `commissionCents` and the effective employee/day eligibility, rate and daily threshold. A weekly screen **does not introduce a weekly threshold**. Period views use the existing actual payroll periods and `hourlyCents`, rounding base pay once for the entire period; each daily effective policy is applied as in payroll. A future period-based rule must be added to the shared calculation services, not independently reset in this dashboard.

Pay shows live provisional explanations and immutable approved payroll-line snapshots separately. No approved worked-time input, no completeness attestation, missing source approvals/policies, or a crossed pay-arrangement change means **Incomplete**, not assumed pay. Partial daily views do not repeat a full base amount per day. Approved historical snapshots remain available even when current employee status changes.

## Projections, dates, security and exports

Today and This Week use America/New_York and the owner's effective week boundary; custom dates are inclusive, at most 367 days, with future queries rejected. Station totals remain station-wide when employee records/pay are filtered. Unknown/uncovered ranges remain explicitly incomplete.

Observation history includes only ended owner-attested, completely reviewed days with an effective schedule and nonzero confirmed operating time. Closures contribute no operating time. Eastern DST boundaries use actual elapsed minutes. The test-rate primitive adds only remaining expected work to performed work and requires sufficient positive history/current coverage. **Manual reports have no verified current cutoff, so current-day/current-week test, revenue and gross-pay forecasts deliberately remain Insufficient data.** Completed historical ranges show completed performed totals, not forecasts. Employee forecasts additionally lack justified work allocation and approved future-time inputs. No projected commission threshold, wage, collected cash or profit is invented.

Every service read/write/import/attestation/reconciliation/export takes the existing personnel/Phase2–5 locks, rechecks the actor's current **active OWNER** role, then the station lock. Pages/actions use existing Better Auth and current-user checks too. Employees, admins and bookkeepers receive no station/peer-pay/vehicle/finance access through these new routes, regardless of navigation state; existing separately authorized finance/payroll behavior is unchanged. Export is independently guarded and audited, includes all filtered rows (no list cap), minimized vehicles, explicit unverified local time/revision and report-not-live coverage, signed integer cents and CSV formula escaping. It is private/no-store.

## Performance summaries and panel layout

The owner Performance tab includes a station-wide test breakdown by the source outcome, daily trends, hourly clock buckets, and a filtered employee performance table. Confirmed and pending identities stay separate; percentages exclude pending records. Outcome labels never determine wages or receipts automatically.

Daily comparisons use the immediately preceding period of the same inclusive calendar length. Both periods must have ended dates, effective owner-confirmed timezone/hours, and current reviewed report coverage on every open date. Explicitly closed dates need no report, but records on a closed date require review. An absent report on an open date is unknown, even under a broader attestation. The normalized rate is tests per actual configured open hour, including Eastern DST elapsed time; it describes station activity rather than individual productivity. Counts remain visible when comparison is withheld. Today's manual export has no verified cutoff and cannot support a complete-day comparison.

Hourly trends group the raw report clock hour across the selected dates. Midnight and noon use their correct AM/PM buckets; repeated fall-back hours are combined because the source omits offsets. Date-only records remain in Time unavailable. Empty buckets stay unknown unless the whole range and every source time are covered. Employee filtering changes employee records/pay; station-wide breakdowns and trends retain their full station scope.

The employee table keeps attributed station counts separate from independently approved payroll counts. Commission is explicitly a subtotal of recorded approved daily evidence, applying each day's existing personal threshold and effective policy. Missing recorded approvals/policies withhold this subtotal; absent dates are never inferred as zero. Approved periods use their immutable daily snapshot, never later live policies/counts. Missing or inconsistent frozen daily detail stays unavailable. Base/gross sum each fully contained actual pay period once and retain exact-cent period rounding. Partial overlaps are not prorated; incomplete inputs or a mixture of provisional and approved periods withhold totals. The detailed daily/period evidence remains available in its own panels.

All thirteen panels support pointer drag/reorder, corner resizing, keyboard reordering/resizing, width controls, automatic height and Reset panels. Order/dimensions are saved per owner in this browser's local storage; they do not travel to another device. Stored layout contains only panel identifiers and dimensions. Damaged/old layouts recover to defaults, new panels are appended, and unavailable browser storage falls back to the current session. On narrow screens panels use full width and tables scroll inside them. Server authentication and current active-owner checks still protect every data read.

## Verification and remaining gates

See [VERIFICATION.md](VERIFICATION.md) for exact completed commands, browser results and publication evidence. Synthetic tests use disposable `_test` databases and native authenticated private fixtures, never actual business/portal records. Earlier migration bytes and approved sentinel snapshots are retained. Generated/source-sensitive outputs stay out of Git and the Library.

Before enabling unattended access, obtain documented provider permission and a supported API/report with stable identities, pagination/total guarantees, authentication expiry behavior, timezone/cutoff and fee/payment semantics. Then live-verify a limited authorized query. A real scheduler, dead-man monitoring and messaging require separate approved setup. This delivery does not provision them.
