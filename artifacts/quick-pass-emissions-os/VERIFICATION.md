# Daily owner email — October 12, 2026

Pulled shared main through `bebea19` before implementation. The owner confirmed **6:30 PM Eastern
for the current day**. Added owner-only recipient configuration, live preview, saved dated reports,
HTML/plaintext email, PostgreSQL outbox/retry state and 15-row delivery history. The independent
jobs runner uses the existing protected business snapshot calculations and current owner checks.
Additive migration: `202610120005_owner_email`; no business database reset or migration was run.

- **597 unit/database tests passed in 71 files, none skipped**, using the owned isolated runner.
  New coverage verifies current-day timing and DST, owner-only configuration/reads/recipients,
  concurrent triggers, persistent frozen reports, timeout/permanent-error retry, stale claims,
  recipient removal/pause/deactivation/demotion/address changes, a real queued personnel-lock
  transaction, bounded backlog retention, 15-row pagination and provider idempotency reuse.
  Upgrade sentinels retained approved payroll, invoices and signed reversals.
- **Two focused owner email browser workflows passed, none skipped**, with
  `E2E_OWNER_EMAIL_ONLY=1`: owner preview/recipient save/reopen and manager denial of settings and
  saved reports. Native management login and unrelated-origin rejection passed preflight. The
  default browser manifest now requires 29 checks; the broader suite was not rerun.
- Typecheck, ESLint, changed-file Prettier, Prisma formatting, whitespace checks and the production
  build passed. The build used an unreachable database URL; 63 trace manifests contained no
  private verification/environment references. Repository-wide formatting still reports 46
  untouched files; it is not an all-clean formatting result.
- Email credentials were absent. Sending remains paused until a verified Resend sender, API key,
  HTTPS app origin and selected owner recipients are configured. Provider sends were mocked in
  isolated tests; no real email, inbox receipt, deployment or persistent scheduler was verified.
  Provider acceptance is distinct from delivery. Independent five-minute trigger setup and
  recovery instructions are in [OWNER_DAILY_EMAIL.md](OWNER_DAILY_EMAIL.md).
- The business database and secrets were not used for fixtures or build queries. Runner-owned
  databases, browser sessions and browser build caches were removed after verification.

# Inline street-address suggestions — October 12, 2026

Pulled shared main through `3f6c723`. Removed the separate Find an address input. Typing directly
into Street address now requests suggestions; selecting one fills street, city, state and ZIP.
Apartment/suite preservation, manual saving, source labels and server provenance checks remain.
Legacy multiline addresses retain their original line breaks. Escape dismisses suggestions
without closing the new add-record dialog, and Enter selects without submitting the form.

- **578 unit/database tests passed, none skipped, in 69 files** using the owned isolated runner.
- **Three focused address browser workflows passed, none skipped** across employees, dealerships
  and vendors: direct Street address typing, no separate lookup field, keyboard/pointer selection,
  unit preservation, manual fallback, create/edit/save/reopen, provenance labels and 390px fit.
  Suggestions were controlled fixtures; native login and unrelated-origin rejection also passed.
- Typecheck, ESLint, changed-file Prettier, whitespace checks and the standard production build
  passed. Build database access used an unreachable URL; 61 trace manifests contained no private
  verification/environment references. Repository-wide formatting reports 45 untouched files.
- No schema, credentials, business database or deployment changed. Live suggestions still require
  the optional server-side GEOAPIFY_API_KEY; live provider lookup was not verified. Disposable
  databases, browser state and browser build caches were removed after verification.

# Shared contact address lookup — October 12, 2026

Pulled shared main first through `7b36d3f`. Added one shared address search/structured-fields
component for employee, dealership and vendor create/edit workflows, optional server-only
Geoapify lookup, persistent source/provider metadata and additive migration
`202610120004_contact_address_lookup`. Existing addresses remain manual. Provider selections
identify streets/localities only; apartment/suite details remain manual and delivery validation
is not claimed. Vendor address edits are independent of primary-contact verification.

- **574 unit/database tests passed, none skipped, in 67 files** on a runner-owned disposable
  PostgreSQL database. Address checks cover all three save paths, structured billing, legacy
  billing preservation, signatures/forgery and changed-field downgrade, apartment/suite edits,
  staff/deactivated-management rejection, vendor version conflicts and audit, provider failures,
  query/origin guards and a real concurrent endpoint quota (30 allowed / five limited, then
  window reset). Upgrade checks retained approved payroll, invoice and signed reversal snapshots.
  Updated personnel test fixtures to include the current required job role and exercise owner
  grants through the current management-account action, preserving the concurrency assertions.
- **Three focused Playwright workflows passed, none skipped**, using
  `E2E_ADDRESSES_ONLY=1`: employee/dealership/vendor create → save → reopen → edit → save → reopen,
  keyboard Up/Down/Enter/Escape, pointer selection, existing suites and units entered in search,
  provider/manual source persistence, unit-only edits, real unconfigured-provider fallback and
  390px overflow checks. Native login and unrelated-origin rejection passed preflight. Suggestions
  were synthetic/private fixtures; real server save actions verified signatures. Added these
  workflows to the default manifest/completion guard (27 checks); the broader browser suite was
  not rerun.
- TypeScript, ESLint, changed-file Prettier, Prisma formatting, whitespace checks and the standard
  production build passed. The build used an unreachable build-only database URL; 61 trace
  manifests contained no private verification/environment references. Repository-wide formatting
  still reports 53 untouched files.
- No address-provider credentials were present. Live Geoapify lookup was not verified; set
  `GEOAPIFY_API_KEY` in server secrets using [the setup guide](docs/ADDRESS_LOOKUP.md). Manual saving
  works without it. Runner-owned databases, browser state and build caches were removed. No
  business database migration, external account provisioning or deployment was performed.

# Shared station test-export limits — October 12, 2026

Synced shared main through `44e1736`. Performance history and daily-count exports now claim one persistent per-station reservation across accounts and processes. Manual refresh and different dates share a 60-second completion cooldown and five-minute failure cooldown. The claim transaction releases database locks before network work; source calls/writes re-check authorization, station, token and expiry. A shared 45-second request deadline covers redirects and response bodies, while abandoned reservations recover after two minutes. Only the owning token can finish/release a run. History requests cover at most three days and use at most three requests per run, including explicit empty-day checks, with today isolated first. Verified batches stay cached and later owner-triggered loads continue missing history after cooldown.

- **51 focused non-database tests passed** in five files, covering the shared-gate call path, small/date-safe batches, cancellation before requests/during fetch/during body reads, existing source verification and retest/dashboard rules.
- **11 new PostgreSQL coordination cases passed**: overlapping owners and entry points, requests beyond the old 15-second window, shared manual/date cooldown, five-minute failure cooldown, bounded historical requests and continuation, explicit-empty fallback budget, unauthorized/inactive actors, deactivation during export, independent stations, abandoned reservations, stale-token protection and station changes. Network transport was synthetic; no live provider export was performed.
- The full isolated suite ran **543 tests: 539 passed, four failed, none skipped**, across 61 files. Failures are the same three personnel assertions in `tests/actions.test.ts` and one billing-address fixture assertion in `tests/phase4-database.test.ts`, previously confirmed against unchanged shared main. Those source/tests were untouched. Upgrade checks retained approved payroll, invoice and signed-reversal snapshots, and applied the additive `202610120002_station_test_export_gate` migration.
- **Both focused Performance browser workflows passed with no skips**, including native-login/origin preflight, cached display, panel drag/resize/account persistence/reset, date/employee filters, daily commissions, pagination, mobile fit and manager rejection. The broader business browser suite was not rerun.
- TypeScript, ESLint, changed-file Prettier, whitespace checks and the production build passed. Builds used an unreachable build-only database URL. **60 trace manifests contained no private verification/environment references**. Global formatting still reports 67 untouched files.
- Only runner-owned disposable databases and browser state were used and removed; the owned PostgreSQL server was stopped. No business database, stored station/payroll/finance history or deployment was changed. No new dependency was added.

# Typical time between tests — October 12, 2026

Pulled shared main first through `e5248eb`, then merged incoming changes through `a61e998`, preserving newer account panel layouts, interactions and simpler certificate presentation. Kept pace evidence compact, removing the old timing-window footnotes while retaining required excluded-gap counts and partial-coverage warnings. Replaced first-to-last-window/car estimates with the median of consecutive source test gaps paired separately for each employee and report date. Ranges/all-staff views pool retained gaps; overnight boundaries never enter the median. Free retests now contribute to pace without changing counted cars, revenue or commissions. Owner **Pace settings** stores a station-wide long-gap threshold independently of pay/layouts, with audit history, transaction authorization, revision checks and no assumed default. Only gaps strictly over the limit are excluded and identified as long gaps, with no inferred cause. Missing employee/day timestamps are omitted without bridging; used/excluded counts and timing coverage are visible.

- **42 focused unit tests passed** across four files, including the requested 10/12/60/11 example producing 11 minutes after excluding 60, odd/even medians, threshold equality/all-excluded cases, per-employee/day sorting, overnight boundaries, ties, null/legacy/unlinked timing, free retests despite missing VIN lookback, unchanged financial counts, filters/ranges and strict threshold validation.
- **Two focused Performance browser workflows passed with no skips.** Added threshold save/clear/reload and two-tab stale-edit rejection checks, excluded-gap evidence, free-retest physical-test counts and the new labels while retaining panel drag/resize, account persistence/reset, employee/range filters, pagination, mobile fit and manager rejection. Native login and unrelated-origin rejection passed preflight. A synthetic desktop capture was visually reviewed. The broader business browser suite was not rerun.
- The full isolated unit/database suite ran **520 tests: 516 passed, four failed, none skipped**, across 57 files. The new database case passed for durable owner settings, independent pay data, serialized concurrent writes, stale revisions, audit history and rejection of manager/legacy/inactive accounts. The four failures remain the previously recorded personnel assertions in `tests/actions.test.ts` (three) and billing-address fixture assertion in `tests/phase4-database.test.ts` (one). Those files and services were unchanged. A separate temporary checkout of unchanged shared main reproduced the exact same four failures (509 passed / 513 total), confirming the baseline. Upgrade checks retained approved payroll, invoice and signed-reversal snapshots.
- TypeScript and ESLint passed after generating the client for the incoming panel-layout schema. The production build passed using an unreachable build-only database URL; the existing backup filesystem tracing warning remains. Changed-file Prettier and whitespace checks passed; 60 trace manifests contained no private verification/environment references. Global formatting has existing differences in untouched files.
- Verification uses disposable databases only. No new dependencies, migration, business-data changes or deployment were performed. The temporary baseline copy, runner-owned databases/browser state and owned PostgreSQL server were removed after verification.

# Busy hours publication merge — October 12, 2026

Merged the new Busy hours and Commission progress panels with shared GitHub main through `6c6cd28`, preserving incoming navigation, billing, payroll, Sunday trend behavior and automatic Employees panel height for fewer than seven rows. Both new panels retain drag/drop, resize, saved-layout migration and existing commission estimates. No business data or deployment was changed.

- Combined production build, TypeScript and ESLint passed. Dependencies were installed from the frozen workspace lockfile. No build database access was enabled.
- Both focused Performance panel browser workflows passed with no skips on the final merge, after updating the theme interaction to its new Settings location and respecting the incoming Employees minimum height without changing stored sizes. All 39 focused calculation/layout tests passed. This covers existing and new panel behavior, employee filters, daily commission progress, pagination, mobile and manager access restrictions.
- All 365 non-database tests passed; 143 database tests were explicitly skipped in that run. The isolated full suite then ran 508 tests: 504 passed and four failed, none skipped. Incoming employee action validations failed three assertions in `tests/actions.test.ts`; incoming billing-address validation failed one assertion in `tests/phase4-database.test.ts`. These workflows were not changed by the new panels. The isolated upgrade runner was adapted to seed only baseline User/Employee/Dealership columns, because the latest Prisma client supplies contact fields that do not exist until the subsequent migrations. Before/after payroll, invoice and reversal snapshot assertions remain intact.
- Repository-wide formatting continues to report incoming formatting differences; the panel merge resolutions and verification-runner edits use Prettier. The broader business browser suite was not rerun.

# Busy hours and Commission progress — October 11, 2026

Added two owner Performance panels using the existing theme and report/pay calculation path. Busy hours groups counted inspection timestamps by report-local clock hour, follows date/employee filters, excludes free retests and distinguishes incomplete timing from verified zero activity. Commission progress shows the existing $1-per-shop-test-above-50 daily estimate, resets the threshold every day, preserves eligibility/work adjustments in selected earnings and paginates daily rows at 15. Both panels support drag, keyboard move/resize and saved browser layouts. Legacy two-panel layouts keep their order and sizes, with the new panels appended. These views do not approve or mutate payroll.

- **38 focused calculation/layout tests passed** in three files, covering hour boundaries, ties, employee filters, missing timing/report/VIN coverage, verified empty reports, daily threshold boundaries, range resets, eligibility and saved-layout migration.
- **Two focused browser workflows passed with no skips**, covering existing panel behavior plus hourly evidence/free retests, daily commission progress, employee filters, 15-row range pagination, old-layout migration, pointer dragging, keyboard resizing, reload persistence, unknown-data states, phone fit, dark theme and manager route rejection. Native login and unrelated-origin rejection passed the runner preflight. Synthetic desktop and phone captures were visually reviewed. At initial implementation the default browser manifest required **24 checks**, or 28 with station history; the merged retired-settings flow changes the latter to 27; the broader business browser suite was not rerun.
- The isolated full unit/database suite ran **449 tests: 447 passed, two failed, none skipped**, across 44 files. The two failures are the previously recorded `tests/dashboard.test.ts` presentation assertions for removed Base pay and missing-report wording; that Dashboard source/test was untouched. Upgrade checks retained approved payroll, invoice and signed-reversal sentinels.
- TypeScript, ESLint, changed-file Prettier, whitespace checks and the production build passed. Build database access used an unreachable build-only URL. The existing backup filesystem tracing warning remains; **57 trace manifests contained no private verification/environment references**. Repository-wide formatting reports **13 untouched files**.
- Runner-owned databases, browser state and browser caches were removed, and the owned PostgreSQL server was stopped. No dependencies, migrations, business-data changes, commit, push or deployment were performed.

# Future Security camera viewing — October 11, 2026

Ran `git pull --ff-only` first; shared main was already current at `6b4c2b8`. Added a separate **Security → Camera viewing** navigation category and authenticated `/security` page for OWNER/ADMIN. The responsive page follows the current near-white/charcoal/green theme, identifies Reolink, and clearly shows Coming soon / Not connected. Camera model, secure access and in-app browser compatibility remain future setup. There is no credential form, camera feed, external camera request, integration endpoint or database migration in this change.

- **Four focused browser workflows passed with no skips** on disposable databases: three Security checks plus the existing app-wide theme check. Security covers owner/manager same-tab desktop/mobile navigation, category/breadcrumb/active state, light/dark desktop, tablet and phone layouts without overflow, reloads, and direct-route rejection of anonymous, EMPLOYEE and BOOKKEEPER sessions. The theme workflow passed all **22 current main navigation destinations**, contrast, keyboard forms and responsive navigation. Synthetic desktop and phone/dark Security captures were visually reviewed.
- Added the three Security checks to the default browser manifest and completion guard: **22 required checks**, or 26 with station history. `E2E_SECURITY_ONLY=1 npm run test:e2e` runs only the three new checks. The broader business browser suite was not rerun.
- The isolated full unit/database suite ran **436 tests: 434 passed, two failed, none skipped** across 43 files. Both failures are the previously recorded `tests/dashboard.test.ts` presentation assertions for removed Base pay and missing-report copy. No Dashboard source/tests were changed here. The new navigation authorization/category test and suite guard passed; upgrade checks retained approved payroll, invoice and signed-reversal sentinels.
- TypeScript, ESLint, changed-file Prettier, whitespace checks and the production build passed. The build used an unreachable build-only database URL and retains the existing backup filesystem tracing warning. Repository-wide formatting still reports 17 pre-existing untouched files.
- Runner-owned databases, browser state and browser caches were removed, and the owned PostgreSQL server was stopped. Changes remain local; no commit, push, deployment or business-data change was performed.

# Neutral typography for easier reading — October 11, 2026

Replaced green everyday text with charcoal `#29312D` headings, values, menu labels and form text, plus neutral gray `#626B65` supporting labels. Login copy follows the same treatment. Dark-mode primary text is neutral off-white. Green remains on actions, selected navigation, chart marks and focus accents; near-white surfaces remain unchanged.

- TypeScript, ESLint, changed-file formatting and the standard production build passed. The existing database-maintenance tracing warning remains. Build database access was disabled.
- The focused workspace browser workflow passed all main navigation pages, resolved text color, contrast, light/dark desktop, tablet and phone layouts, keyboard forms and responsive navigation with no skips. The focused login browser workflow also passed desktop/tablet/phone, keyboard/autofill/error states and native management sign-in. Synthetic Performance previews were visually reviewed.
- `npm test`: 290 passed, 143 database tests skipped, and the same two pre-existing dashboard presentation assertions failed. The full database suite was not rerun for this typography-only change. Repository-wide formatting still reports 17 untouched files.
- No business logic, business data or deployment was changed.

# Near-white workspace surfaces — October 11, 2026

Lightened the main background to `#FAFBF8`, panels to `#FFFFFF`, sidebar and login branding panel to `#FCFDFB`, and tab/hover highlights to `#F2F5ED`. Retained green actions/headings, readable input borders and the explicit dark-mode palette. Preserved incoming login artwork and dashboard updates through `8f2d635`. Existing contrast verification now accepts valid three-digit white hex values.

- TypeScript, ESLint, changed-file formatting and the standard production build passed. The existing database-maintenance tracing warning remains; builds used an unreachable build-only database URL.
- Before the incoming merge, all 432 isolated unit/database tests passed and the focused workspace browser workflow passed with no skips. After the merge, 433 tests passed and two existing dashboard presentation assertions failed (removed Base pay and missing-report copy); none skipped. No dashboard calculations or page logic were edited by this surface change.
- The final native login browser workflow passed desktop/tablet/phone layout, resolved colors, error states, keyboard access and management sign-in. The final workspace browser workflow also passed all main navigation pages, contrast, desktop light/dark, tablet, phone light/dark, keyboard and responsive-navigation checks with no skips. Screenshots use synthetic test records.
- Repository-wide formatting continues to fail on untouched files. No deployment or business-data changes occurred.

# Cream, sand and forest theme — October 11, 2026

Applied the owner palette throughout the workspace and native sign-in: `#FBF5DD` backgrounds/light panels, `#E7E1B1` sidebar/tab surfaces, `#306D29` buttons/active tabs/chart accents, and `#0D530E` headings/strong text. Dark mode uses coordinated readable variants. Performance summary text, calendar selections, segmented tabs, panel focus and drag indicators follow the theme. Semantic warning/error colors remain distinct.

Verification includes incoming GitHub main through `f71a96a`:

- **432 unit/database tests passed with no skips in 42 files** against a runner-owned disposable database. Upgrade checks retained approved payroll, invoice and signed-reversal sentinels.
- **Two focused browser workflows passed with no skips.** The workspace check covers all **21 current main navigation destinations** on 1440px desktop light/dark, 768px tablet light and 390px phone light/dark. It verifies resolved palette colors, text contrast of at least 4.5:1, chart/focus/input contrast of at least 3:1, theme persistence, keyboard forms, desktop collapse/expand, mobile drawer focus/Escape and no document overflow/browser exceptions. The login check covers desktop/tablet/phone, palette, keyboard/autofill/errors, dark-preference isolation and actual native management sign-in. Runner preflight also passed native login and unrelated-origin rejection. Synthetic login, Dashboard, payroll, Performance and finance previews were visually reviewed.
- TypeScript, ESLint, changed-file Prettier, whitespace checks and the standard production build passed. The build used an unreachable build-only database URL. The existing backup filesystem tracing warning remains; **56 trace manifests contained no private verification/environment references**.
- Repository-wide formatting reports **16 untouched files**, including the previous eight and eight incoming source/test files. These formatting differences were not folded into the palette update. The broader business browser suite was not rerun; focused theme/login results do not supersede the historical combined-suite failures below.
- Test databases, private browser state and browser build caches were removed. This change contains no dependencies, migrations, business-data mutations or deployment.

# App-wide Quick Pass Emissions theme — October 11, 2026

Extended the professional login theme throughout the application using the `#218845` brand, system typography, quiet white/off-white surfaces, a deep green sidebar, consistent rounded controls and matching Performance charts. Light/dark themes share semantic warning/error colors. Payroll filters now use visible green actions and a compact responsive row. The theme switch exposes its pressed state and uses a sun/moon icon. Domain calculations, authorization and saved-data storage are unchanged.

- **427 unit/database tests passed with no skips in 42 files** against a runner-owned disposable database, including the upgrade/sentinel preservation checks.
- **Two focused browser workflows passed with no skips.** The new workspace workflow waits for loaded content and checks all **24 main navigation destinations** in desktop light/dark (1440px), tablet light (768px) and phone light/dark (390px), with no document overflow or browser exceptions. It exercises theme changes across navigation, desktop collapse/expand, mobile drawer focus/Escape and keyboard password-field access. Dashboard, payroll, Performance and finance captures were reviewed. The native login workflow also passed desktop/tablet/phone, focus/autofill/error states and real management sign-in; stale-cookie login and unrelated-origin rejection passed the runner preflight.
- The workspace test is included in the default manifest, increasing its required count from 18 to **19** (23 with station history). Use `E2E_THEME_ONLY=1 npm run test:e2e` for its isolated run. The broader business-workflow suite was not rerun; its previously recorded combined-suite failures below remain separate from these focused checks.
- TypeScript, ESLint, changed-file Prettier, whitespace checks and the production build passed. The build used an unreachable build-only database URL. The existing backup filesystem tracing warning remains.
- Repository-wide formatting still reports the same eight untouched files listed in the preceding login verification. Test databases, browser state and private browser build caches were removed; the owned PostgreSQL test server was stopped. No business database, migration, deployment, commit or push was changed.

# Professional Quick Pass Emissions login — October 10, 2026

Replaced the illustrated welcome page with a restrained green brand panel, business-focused typography, a clear native sign-in form and responsive layouts. The base color is `#218845`; the submit shade is slightly darker for accessible small white text (4.55:1 contrast). Browser metadata, the application wordmark/footer and invitation branding now use Quick Pass Emissions. The login page sets a same-origin document referrer policy so real browser form submissions retain the origin required by Better Auth; authenticated routes retain their global no-referrer header. CSRF and origin validation remain enabled.

- **427 unit/database tests passed with no skips in 42 files**, on a runner-owned disposable database. The existing automation retry test now claims its retried job directly, preventing its simulated backoff across Eastern midnight from enqueueing an unrelated next-day summary into the assertion.
- **One focused login browser workflow passed with no skips** using `E2E_LOGIN_ONLY=1`: desktop (1440px), tablet (768px), phone (390px), visual captures, no horizontal overflow, mobile submit visibility, labels/autofill, keyboard focus, dark-theme isolation, four error states and actual native form submission to a usable management session. Native login with a stale cookie and unrelated-origin rejection also passed the runner's preflight. The login workflow is included in the default manifest, increasing its required count from 17 to 18. The broader workflows were not rerun for this visual change; the earlier combined-suite failures below remain separate.
- TypeScript, ESLint, changed-file Prettier and whitespace checks passed. The standard production build passed using an unreachable build-only database URL. The existing backup tracing warning remains; 56 build trace manifests had no private verification references.
- Repository-wide Prettier still reports eight untouched files: `scripts/performance-browser-fixtures.ts`, `src/modules/station/dashboard-calculations.ts`, `dashboard-retests.ts`, `dashboard-service.ts`, `dashboard-types.ts`, `portal-client.ts`, `tests/dashboard-retests.test.ts` and `tests/e2e/performance-panels.spec.ts`. These existing formatting differences were not folded into the login change.
- Test databases/browser state were removed. No business data, credentials, schema, deployment, commit or push was changed.

# Dashboard publication merge — October 10, 2026

Merged the business Dashboard snapshot/attention/shortcuts change with incoming GitHub main through `40b3387`, retaining the newer Performance layout, station portal and certificate portal flows. Certificate ordering from Dashboard routes to `/certificates#portal`; compact presentation is preserved. Incoming source formatting was normalized with the configured Prettier formatter.

Fresh combined checks: all **411 unit/database tests passed with no skips** in 41 files, application TypeScript and ESLint passed, and the standard Turbopack production build passed with the existing backup filesystem tracing warning. Test databases were disposable and removed; builds used an unreachable database URL.

The full browser run with station history enabled **failed** and is not counted as passing. It reported assertion failures in navigation's daily Performance check, two operations checks, two legacy Performance checks, payroll's certificate-settings workflow, the Phase 5 certificate-alert workflow and station's legacy Performance entry. Several assertions target the prior Performance/certificate UI. These failures need browser investigation/update against the merged workflows; prior delivery browser results below are historical and do not establish combined browser acceptance. No business database or deployment was changed.

# Dashboard business snapshot and attention — October 10, 2026

Dashboard now leads with today's Eastern-date tests/commission eligibility, separately labeled revenue evidence and approved base/commission pay with incomplete-input flags. The main action list contains only unresolved low stock, approaching/expired employee certifications and overdue unpaid dealer/rental balances; critical items appear first and all matches remain accessible in pages of 15. The four shortcuts open certificate ordering, Service & Support, payroll and owner Performance. Dashboard reads do not mutate records or run automation.

- **333 unit/database tests passed with no skips in 32 files.** New cases cover deduplicated current station revisions, eligibility versus payroll approval, approved/pending/zero personal counts, volume tiers, missing/unsupported calculations, approved daily inputs, immutable daily payroll snapshots, deactivated staff pay, refusal to prorate multi-day hours, billing versus receipts/estimates/manual evidence, signed payment reversals, overdue-only balances, resolved/voided records, inventory/certification urgency, unknown setup, management authorization, read-only behavior and 15-item attention pagination. The isolated upgrade check retained approved payroll, invoices and signed reversal sentinels.
- **21 browser workflows passed with no skips**, including station/Performance coverage. The owner/manager navigation checks now verify the three Dashboard sections and four role-appropriate shortcuts, with 390px overflow checks. Certificate replenishment verifies the Dashboard low-stock alert appears and then resolves after a real fixture receipt. Desktop and mobile synthetic captures were visually inspected.
- Application TypeScript, ESLint, Prettier, whitespace checks and the production build passed. The build used an unreachable build-only database URL. The existing backup-utility dynamic filesystem tracing warning remains; this change adds no storage or startup behavior.
- Only runner-owned disposable databases and private browser state were used and removed. No migration, business-data reset, deployment, commit or push was performed for this change.

# Employee payroll overview — October 10, 2026

Publication rerun: all 324 unit/database tests passed with no skips; application TypeScript, ESLint, Prettier and the standard production build passed. The 21 browser workflows below are the implementation verification and were not repeated during publication. The database runner created and removed only its disposable test database; live deployment and business migration remain separate.

Payroll now leads with paginated employee daily/weekly base-rate equivalents, approved commission subtotals, average commission per approved day, current volume incentives and latest approved gross payroll. Owners can append exact or percentage rate changes with effective dates and reasons. New DAILY/WEEKLY arrangements use approved paid days or full calendar weeks; historical FIXED/HOURLY behavior and approved snapshots retain their original meaning. Progressive commission boosts apply only to personal tests above the configured higher threshold. Pay transaction history, employee lists, count review, periods, inputs, revisions and draft lines display at most 15 records per page; exports remain uncapped.

- **324 unit/database tests passed with no skips in 30 files**, using the owned disposable PostgreSQL runner. New coverage checks tier boundaries/eligibility, exact cents and percentage rounding, daily/weekly bases, explicit zero versus missing data, effective policies, owner-only authorization, stale/concurrent adjustments, source freezes, preserved approved snapshots, shared Performance calculations and 15-row pagination across 101 counts and multiple history/employee/period pages. The upgrade check retained approved payroll, invoices and reversal sentinels after additive migration 012.
- **21 browser workflows passed with no skips**, with station/Performance coverage enabled. The expanded payroll journey verifies daily/weekly rates, dated increases/decreases, tiered commissions, approved-zero averages, retained historical gross, reload persistence, older transactions/counts, management preparation/independent review, export and populated 390px mobile fit. Native login and unrelated-origin rejection passed. Synthetic desktop/mobile captures were inspected.
- Application TypeScript, ESLint, Prettier, whitespace checks and the standard production build passed. The build used an unreachable database URL. The existing backup-utility filesystem tracing warning remains; 55 inspected trace manifests contained no private work/environment references.
- All tests used runner-owned disposable databases and private browser state; business data was not reset or migrated. Additive migration 012 applies through normal guarded startup/migration commands. No deployment was performed.

# Performance trends, employee evidence and panel layout — October 10, 2026

The owner Performance tab now has outcome breakdowns, daily/hourly trends, preceding-period comparisons, employee payroll evidence and thirteen draggable/resizable panels. Missing coverage/time inputs remain visible. Comparisons require complete ended historical coverage and use actual configured open hours; partial pay periods are never prorated. Approved payroll snapshots take precedence over live inputs. Layout dimensions/order are stored per owner in this browser, with keyboard controls, reset, malformed-storage recovery and a session fallback when storage is blocked. See [STATION_HISTORY.md](STATION_HISTORY.md).

- **314 unit/database tests passed, no skips, in 29 files**, using the owned `test:isolated` runner and a fresh disposable PostgreSQL database. Upgrade checks retained approved payroll, approved invoices and signed reversal sentinels. New tests cover inclusive previous ranges, leap/year/DST boundaries, Eastern midnight, missing reports, pending identities, effective hours/timezone, closed dates, missing clock times, daily commission thresholds/rates/eligibility, independent approvals, selected-range boundaries, actual-period allocation/rounding, frozen snapshot precedence, mixed approvals and damaged layout recovery. Database reads verify complete comparisons, station-wide scope under employee filtering, payroll snapshot amounts and missing inputs without creating payroll counts from dashboard reads.
- **21 Playwright workflows passed, no skips**, with `E2E_STATION_HISTORY=1`: the 17 existing main workflows, two station-history workflows and two new Performance checks. Focused `E2E_PERFORMANCE_ONLY=1` also passed both checks on a confirmed synthetic report fixture. Checks exercise pointer reorder/resize, keyboard movement/size, width/auto-height/reset, reload persistence, malformed and blocked browser storage, invalid calendar dates, employee scope, 390px fit and unauthorized-role exclusions. Native login and unrelated-origin rejection passed. Synthetic desktop/mobile captures were visually reviewed.
- Application TypeScript, ESLint, Prettier and whitespace checks passed. The standard **Next 16.4 Turbopack production build passed**, using an unreachable build-only database URL. The existing backup-utility dynamic-filesystem tracing warning remains; inspected trace manifests contained no private work/environment references.
- Runners removed only their owned test databases, private browser state and build caches. No dependencies, schema migrations, business records or external services were changed. No deployment was performed.

# Management-only access publication — October 10, 2026

Only Owner and Manager accounts can sign in or use protected application workflows. Staff and legacy bookkeeper identities remain linked to payroll, schedules and operational history. Additive migration 011 removes their authentication accounts/sessions, expires unused invitations and resolves their personal notifications/reminders without deleting business records. Owners/managers record task progress, maintenance and support contact history; alerts target management.

Fresh publication checks passed application TypeScript, ESLint, Prettier, the standard Turbopack production build and **273 unit/database tests with no skips** in 28 files. Tests used a uniquely owned disposable PostgreSQL database; upgrade sentinels remained intact and the temporary database was removed. The existing backup utility filesystem-tracing warning remains. Implementation verification separately reported **22 browser checks passed with no skips** (17 main workflows plus focused support/certificate checks); browser checks were not repeated during this publication run. No business database migration or deployment was performed during publication.

# Phase 1–5 review fixes — October 10, 2026

The review fixes preserve the existing shared Git history and business database. Changes include paginated/filterable payroll count review; stricter required-number validation; bounded forecast dates; dated invoice/rebill and rental correction checks; stable form labels and invitation activation; and saved-summary handling for unconfigured inventory. The owned browser runner now includes the Phase 1–5 workflows rather than silently excluding them.

Publication checks: application TypeScript, ESLint and Prettier passed. All **271 unit/database tests passed with none skipped** in 27 files on a uniquely owned disposable database; the upgrade check preserved approved payroll, approved invoices and signed-reversal sentinels, and the temporary database was removed. The standard **Next.js Turbopack production build passed**, with the existing backup-utility dynamic-filesystem tracing warning. Builds used an unreachable database URL so compilation did not access business data. **All 17 browser checks passed with no skips**, covering navigation, operations, payroll, certificates, maintenance, rentals, finance and Phase 5 automation. Native preview login and unrelated-origin rejection passed. The runner removed its temporary database, private session state and build cache. No deployment or real external calls/orders were performed.

# Service & Support — October 10, 2026

- Application typecheck, full workspace `pnpm run typecheck`, ESLint and Prettier passed.
  The shared workspace check passed for API, Canvas, application and scripts; no
  unrelated Canvas changes were made.
- All **228 Vitest tests passed, none skipped**, in **26 files**, on a uniquely owned
  disposable `_test` PostgreSQL database. Upgrade checks retained approved payroll,
  approved invoice and signed-reversal sentinels; the isolated database was removed.
  New checks include role/active restrictions, employee private-field exclusion, strict
  provider-only mutation, manager confirmation/category/status versions, explicit
  category preferences and clearing, contact history scope/persistence, archive
  relationships and concurrent/repeated support import preservation.
- **One complete protected Service & Support Playwright journey passed, no skips**,
  using `E2E_DIRECT=1 E2E_SUPPORT_ONLY=1`. The exact completion marker and exit zero
  were independently reported by the tester. It covered desktop filters/preferences,
  contact destinations/extensions, saved management metadata and equipment association,
  employee self-history/reloads/private exclusions, narrow maintenance association,
  archival/history, bookkeeper denial, missing contacts, 390px fit and keyboard focus.
  No phone, email or external destination was activated. Mobile captures were visually
  reviewed; Next's development issue badge partly obscures one captured provider card.
  The final prominent Call label/help text were checked by compilation, not another
  browser pass.
- Standard **`pnpm run build:app` passed** (Next 16.4 Turbopack). One existing backup
  utility dynamic-filesystem tracing warning remains. Emitted trace manifests contained
  no private import inputs, uploaded sources or support backups. No deployment occurred.
- The normal managed application workflow restarted against its unchanged pinned
  business database and reported ready. A screenshot of protected `/vendors` correctly
  showed the public sign-in boundary; protected screens were verified with the isolated
  signed-in browser journey, not that unauthenticated screenshot.
- Source application was **development preview only**, after a private pre-migration
  backup, storage identity verification and another verified backup at apply:
  **4 unconfirmed vendors created, 0 updated, 0 unchanged, 0 conflicted, 2 review-only
  items skipped/staged**. Repeat preview: **4 unchanged, 2 skipped, 0 created/updated/conflicted**.
  No dates, preferences, physical associations, tickets or contact histories were
  manufactured. See [docs/SERVICE_SUPPORT.md](docs/SERVICE_SUPPORT.md) for the exact
  imported-versus-staged mapping and unsupported fields.

# Verification and handoff status

## Manual certificate ordering navigation — October 10, 2026

The latest shared business-import source was fast-forwarded before editing. Inventory now has
**Order Certificates**, short official-portal/login-recovery instructions and same-tab request/history
links. The manager Dashboard and live owner-exception certificate low-stock surfaces reuse the
ordinary anchor to `https://gadashboard.com/Purchasing/Purchasing.aspx`, with `_blank` and
`noopener noreferrer`. No embedding, browser popup script, credential handling, purchase integration,
schema/service mutation, acknowledgement or receipt changes were added. Setup, unknown-stock,
chemical and historical-summary warnings are not relabeled as certificate ordering.

- `pnpm --filter @workspace/quick-pass-emissions-os test:isolated` passed **25 files / 223 tests,
  zero skips**, with upgrade sentinels retained and only the owned temporary database removed.
  Existing independent approval, manual order recording, partial receipts and role regressions
  remained in that run. After adding six rendered warning-state cases and a browser-suite/count
  contract check, a focused run of `certificate-order.test.ts` and `e2e-safety.test.ts` passed
  **2 files / 17 tests, zero skips**. These later counts are not a second full isolated run.
- Root workspace typecheck passed. Final app typecheck, ESLint, Prettier and `git diff --check`
  passed. Standard Next 16.4 Turbopack production build passed. It retains the existing dynamic
  filesystem tracing warning in database-maintenance/business-import backup code; inspected
  **55 emitted traces with zero private input/environment/dump/session/generated-artifact entries**.
  No dependency, migration or backup behavior was changed for this navigation feature.
- Browser checks used a separately bound owned server/database and private native authentication;
  the managed preview and business sessions were not replaced. All Georgia-dashboard requests were
  intercepted as inert test HTML; no real portal login, order, submission or payment occurred.
  The dedicated four-role suite checks exact URL, keyboard Tab/Enter, null-opener new tabs,
  controlled post-login navigation/reopening, same-tab history, mobile overflow and before/after
  purchase/stock/movement/notification/reminder/audit snapshots.
- **Browser evidence limitation:** the first run failed the mock HTTP-redirect URL expectation.
  It was changed to direct inert responses plus controlled intercepted navigation, preventing any
  real redirect-chain request. The second run emitted no failed-spec messages and produced OWNER,
  ADMIN and BOOKKEEPER desktop/mobile screenshots after their keyboard/reopening and unchanged-state
  assertions. Those screenshots were reviewed as readable, with wrapping mobile instructions.
  Its overall wrapper still rejected completion: the new dedicated four-check suite had incorrectly
  inherited the nine-check report-count gate. The expected count and success label are now corrected,
  and the selector/count/no-skips contract is covered by the passing focused unit run. The private
  browser report had already been disposed, so exact final browser counts cannot be certified and
  **no fully green browser-suite rerun is claimed**. Employee restrictions also remain covered by
  rendered role tests and the unchanged server/domain authorization regressions.

Publication is performed normally against shared GitHub main after final source/privacy checks;
the commit URL is reported at completion. Source publication is separate from deployment.
No production deployment or production database operation was performed.

## Controlled configuration import — 2026-10-10

Commands completed on the final implementation:

- `pnpm run typecheck`: all workspace targets passed, including Canvas and the Next app.
- `pnpm --filter @workspace/quick-pass-emissions-os lint`: passed.
- `pnpm --filter @workspace/quick-pass-emissions-os format:check`: passed.
- `pnpm --filter @workspace/quick-pass-emissions-os test:isolated`: **24 files, 217 tests passed**;
  includes 13 dedicated import tests plus upgrade/historical snapshot sentinels.
- `pnpm run build:app`: passed. One dynamically resolved backup-directory tracing
  warning remains; explicit trace exclusions were added. Emitted server trace paths were
  inspected separately for private inputs (not source contents).

Actual application and code publication are separate:

- Privately pinned, owner-verified **development-preview business database**, not the scaffold
  database or production. Successful full custom-format backups were required before
  additive migration and business application; archives stayed private/mode `0600` and
  were checked with `pg_restore --list`.
- Reviewed dry run: **14 created, 0 updated, 0 unchanged, 0 conflicted, 16 skipped/staged**.
  Applied counts matched. Populated records: nine unverified vendor references, four chemical
  catalog names/notes and the certificate minimum setting.
- A repeat application made **0 created, 0 updated, 14 unchanged, 0 conflicted, 16 skipped**;
  a final read-only preview reported those same counts. One durable import ledger remained.
- Read-only persistence checks verified all 30 source sections/items, matching source/actor/
  database provenance, supplier correction fields and retained protected identifiers.
  No financial, stock-movement, compensation, schedule, bay/layout, rental or task records
  were created. Unit, balances, thresholds, assignments and missing dates stayed unconfigured.
- Private source, target IDs, actor identifiers, sealed manifests/receipts and backups are
  intentionally excluded from this public verification note and Git.
- No production deployment, production application, external order/message or ACH execution.

**Desktop/mobile evidence:** the initial isolated owner flow reached dry-run, verified
backup/application, reloadable review history, chemical unknown states, supplier exclusion
and saved certificate minimum. A synthetic desktop screenshot confirms the unknown-unit/
threshold/stock/supplier state. Two test-selector defects were corrected (collapsed evidence
also contains review text; vendor submit is `Update vendor`). A continuation setup initially
failed when importing application services inside Playwright; this was replaced with native
`tsx` runner-owned setup, guarded by the exact disposable datasource and owner identity.

The user-authorized targeted remaining check then **exited 0**, reporting:
`Passed: 1 targeted remaining import UI flow including supplier verification/dropdowns, saved staff changes, mobile repeat conflicts and role restrictions; no skips.`
It verified independent vendor verification and operational dropdown availability, saved ML
unit and threshold 10 after reload, mobile repeat import conflicts for both staff-edited
records, no duplicated vendor/chemical records or changed operational history, and denial
of import data/actions to ADMIN, BOOKKEEPER and EMPLOYEE. The mobile screenshot shows a narrow
single-column layout; its viewport-width assertion passed. Owned private browser state,
build cache and temporary database were removed. These are combined initial-flow and
successful focused-continuation observations, **not a claim that a fresh full suite passed**.
No real business database or managed-preview authentication was used for browser mutations.

See [BUSINESS_IMPORT.md](docs/BUSINESS_IMPORT.md) for mapping, preview/apply/retry procedures,
the owner review list and missing evidence. Required decisions stay in owner-only saved
review history; no compensation, commission or recurrence policy was activated.

## Navigation reorganization — October 10, 2026

Desktop and mobile now share one role-filtered navigation definition, with Overview, Team & Tasks, Payroll, Inventory, Carwash & Maintenance, Dealerships & Billing, Reports, and Settings. Competing module navigation bars were removed. Registered detail links carry validated list/date/filter/page context, and restricted related-module references remain readable without offering an inaccessible link. Existing routes and server permissions are retained.

- The isolated application suite passed 172 tests with no skips, including 31 navigation tests and migration/snapshot protection checks. A subsequent focused run passed those 31 navigation tests plus three new rendered record-link tests; the latter cover owners/managers, bookkeepers and employee module-link restrictions.
- All nine browser checks were verified across desktop and mobile for OWNER, ADMIN, BOOKKEEPER and EMPLOYEE: eight valid checks in the full run, followed by a passing focused Bookkeeper rerun after correcting the expectation for the intentionally empty legacy Tasks view. This is not a claim that the initial full run was entirely green.
- Checks covered same-tab links, permitted destinations, explicit server denials, active states, breadcrumbs, filtered record returns, date ranges, direct URLs, reload, history, independent sidebar scrolling, drawer focus in both directions, Escape/backdrop dismissal and common action discoverability.
- Typecheck, ESLint, Prettier and the webpack production build passed on the navigation changes.
- Browser writes and sign-ins used a separately bound disposable server and owned test database, not business data. Private credentials, states and caches were cleaned up, and the managed preview was restarted.

See `docs/NAVIGATION.md` for maintenance and verification commands.

### Final shared-main reconciliation

The newer station-history and persistent-storage changes were retained, including the owner-only Performance menu destination and its setup/evidence pages. The verified focus-cycle fix, role-safe record links, explicit streamed-denial checks and empty legacy Bookkeeper Tasks contract were kept when resolving overlapping navigation/testing changes.

After installing the committed locked dependencies and regenerating the updated Prisma client, the navigation task's merged application's isolated suite passed **202 tests in 22 files, with no skips**. The upgrade check retained approved payroll, approved invoice and signed reversal snapshots through the storage/station migrations. Typecheck, ESLint, Prettier and the webpack production build also passed on that merged source. The nine browser checks described above verified the navigation flows before that reconciliation; no additional full browser run is claimed here. The subsequent departure-date safeguard and standard-build checks are documented separately below.

## Station history and performance — October 10, 2026

The existing Next/Prisma/Better Auth artifact now has owner-only Performance, original-report imports, evidence/identity/correction review, historical mapping, effective-dated pricing/calendar settings, explicit replacement reconciliation and actual-period payroll explanations through the shared exact-cent period engine. Phases 1–5, existing unique daily counts, independent approval and frozen snapshots remain intact. Original migrations 001–006 match the retained baseline byte-for-byte; 007 is additive and was applied to the confirmed **development** database only. No real portal rows were persisted and no production migration/deployment was performed.

**Live evidence:** authorized read-only configured-station October 9 query exported 94 rows; the actual inert HTML `.xls` parser accepted them in memory and all ten visible first-page samples matched their export cells. This establishes the working original report format, not an API/all-page/zero/payment/timezone/automation contract. No credentials, session files, full VINs, plates or sensitive report bodies are in source or browser payloads. See STATION_HISTORY.md for the exact limitations and manual operations.

**Passing checks:** `pnpm --filter @workspace/quick-pass-emissions-os test:isolated` passed **19 files / 189 tests / zero skips** in a disposable database, retained approved payroll/invoice/signed reversal migration sentinels and removed that database. Includes protected File/FormData action input, concurrency/repeats/corrections, coverage, mapping history, independent approval/freezes, exact cents/actual periods/missing worked time, finance allocation, role/deactivation, inclusive/DST bounds and insufficient projections. Artifact `typecheck`, `lint`, `format:check` and standard `build` passed; production builder was Next 16.4 Turbopack with all new routes successfully compiled. No alternate builder is claimed.

**Private browser evidence, not a falsely green suite:** one combined 11-check attempt had five test-harness assertion failures (three permission probes followed legitimate denial redirects; week history was read before navigation completed; repeat upload omitted its required reason after React reset). Native private sign-in/unrelated-origin rejection passed. Targeted continuation verified repeat upload, wrong-station rejection, evidence review, coverage attestation and daily-count reconciliation with approval still required. Its terminal money assertion expected `$25.01` instead of the actual `$25.01 USD`; that selector is now corrected. No final 11/11 rerun is claimed. Independent private authenticated HTTP checks on an owned fixture confirmed Performance HTTP 200, the actual `$25.01 USD` display, missing-payroll-period/confirmed-evidence state and full CSV HTTP 200 with one data row, minimized vehicle and private/no-store headers. Desktop 1280×720/mobile 390×844 captures of Performance/setup rendered with no measured document overflow; those original captures were empty-state views, not evidence of imported-row persistence. A non-blocking development caret-color hydration warning and resource 404 were observed.

**Workspace limitation:** root `pnpm run typecheck` fails in the unchanged Canvas artifact `artifacts/mockup-sandbox/vite.config.ts:36–37` with TS2769 Vite plugin type incompatibility. Quick Pass's own typecheck and production build pass. No Canvas dependency/library change or unrelated accessibility/legacy approval task was implemented.

**Publication:** normal shared-main publication is recorded at task completion after credential/session/export/generated-artifact inspection. Source publication is not production deployment. Required owner business configuration and provider-approved unattended integration remain operational gates, not guessed defaults.

**Newer shared source preserved:** incoming shared commit `1227fe8` added the independent durable-storage work during this task. It was joined by a normal merge, retaining both original migration-007 directories and all storage checks rather than replacing either branch. Final combined verification passed **21 files / 199 tests / zero skips**, with Phase 4→Phase 5 + storage + station sentinel preservation and disposal of only the owned test database. The combined artifact's typecheck, lint, formatting and standard Turbopack production build passed. Published storage-migration bytes match the incoming commit. The development storage migration was applied through its new guarded operator command; no business records were seeded, cleared or imported, and no production operation was performed.

**Final correction check:** after project synchronization, a departure-date edge case was closed without changing migration bytes: immutable correction audits now carry old/new calendar dates, and coverage/history/reconciliation recheck both dates. Legacy correction audits without date bounds fail closed for the configured station. Final disposable verification passed **21 files / 200 tests / zero skips**, including refusal to turn an older attestation into a completed zero after a row moves to another date. Only that temporary database was dropped. App typecheck, lint, formatting and standard Turbopack production build passed after this correction.

**Latest navigation integration:** newer shared navigation source `1e2acca` was retained, including visible-drawer focus cycling, non-clickable restricted related-module references, explicit streamed permission-denial checks, the intentionally empty legacy Bookkeeper Tasks view, and safe private-runner progress/diagnostics. The station/domain modules and migration files remained byte-identical to the source verified by the 200-test disposable run. All **38 focused navigation, rendered record-link and isolation-gate checks** passed after integration; app typecheck/lint/format and standard Turbopack production build passed again on the combined source. No additional station browser pass is claimed.

**Zero-evidence review correction:** an old nonempty import cannot be re-attested with zero current rows after a date correction. Empty station days also cannot inherit complete coverage from a wider nonempty report, become usable projection observations, or replace payroll counts without separately verified zero-report semantics. A supported employee zero on a nonempty fully mapped station day remains available and independently unapproved. Regression verification covers failed renewed zero attestation, a synthetic legacy/future-dated attestation, blocked zero reconciliation with no count/reconciliation written, and nonempty-range versus employee-zero behavior. Final disposable verification passed **22 files / 204 tests / zero skips**; only its temporary database was removed. App typecheck, lint, formatting and standard Turbopack production build passed. These zero-evidence safeguards, like the departure-date safeguard, remain local under the publication blocker below. No further private browser run is claimed.

**Confirmed publication and remaining blocker:** implementation merge [fd6cafe](https://github.com/MostValuableWebDesign/Quick-Pass-Emissions-OS/commit/fd6cafeb5662b8f4452aea06c25fc7e47284b08b) was published by the authorized GitHub App bridge with exact commit verification and independently matched remote main. Project completion then recreated an unpublished non-UTC ancestor; native Git authentication still rejects its credential and the existing exact-commit bridge refuses that ancestor format. Published ancestry was normally merged back rather than force-pushed. The last correction-date safeguard and final synchronization/evidence commits remain local until a working native Git push or another exact-history transport is available. Do not describe the latest complete source as fully synchronized.

## Persistent data across releases — October 10, 2026

Pulled the complete shared pnpm workspace through `9d9ec90` before these changes. Saved
business records already used Prisma/PostgreSQL; added guarded startup/migrations, permanent
storage identity and optional per-environment pin, full private backup/empty-target restore,
owner-only storage information, and corrected conflicting scaffold/standalone instructions.
Migration 007 adds only the storage marker. Migration files 001–006 are unchanged.

Verified locally with Node 26.8.2, pnpm 10.26.1, PostgreSQL 18 and PostgreSQL client tools 18.6:

- Root `pnpm install --frozen-lockfile` and full workspace `pnpm run typecheck` passed.
  App `npm run typecheck`, `npm run lint`, `npm run format:check` and `git diff --check` passed.
- **18 Vitest files / 150 tests passed, zero skipped**, using newly created disposable `_test`
  databases. Storage tests cover repeat migrations/new connections, wrong/missing database pin,
  owner role/deactivation rechecks, full all-table backup/restore digest equality (including
  credential/migration/history tables), file permissions, refusal of the current/nonempty
  target, invalid archives, public/build-directory refusal and incomplete-backup cleanup.
  Isolated runner environments explicitly clear inherited business storage pins, backup
  directories and recovery targets while keeping their generated test URL. An actual prior-release fixture
  applies migrations 001–006, retains its profile/audit records, refuses migration 007 when
  the configured backup fails, then successfully backs up/upgrades and repeats without
  another backup. Only run-owned temporary databases were dropped.
- **Standard `npm run build` (Turbopack) passed.** The final build also passed with an
  unreachable test database URL, confirming build generation needs no database write.
- A separate private Chromium check ran the real production build/start scripts on a disposable
  local database. Native sign-in happened outside captured browser forms. An owner saved an
  employee through the UI, stopped the server, ran a fresh production build, restarted using
  the same pinned database and existing browser session, and verified the employee record
  was byte-equivalent and visible, with the same storage ID. Owner Settings was checked on
  desktop and at 390px without horizontal overflow. This is one focused local persistence
  workflow; it is not a rerun of all previous browser scenarios or a Replit deployment test.
- The Replit lockfile excludes macOS native build/test bindings. Matching exact-version local
  binaries were supplied only in ignored verification files; no dependency/lockfile or
  platform override was changed. Private credentials, dumps, database files, screenshots and
  runners remain ignored and were not published.

The production-only **workspace** dependency audit reports three pre-existing advisories:
`deepmerge-ts` 7.1.5 (high) through the scaffold Drizzle → Prisma configuration tool chain;
`source-map-js` 1.2.1 (high) through Better Auth's optional Vitest/Vite/PostCSS peer chain; and
`proxy-addr` 2.0.7 (critical) in the separate Express scaffold. The business app does not import
Vitest/source-map processing in request handlers, Prisma configuration processes trusted
operator files, and the Express scaffold does not enable `trust proxy` or use trusted proxy
subnet checks. No affected attacker-controlled request path was established by this review;
these advisories remain open, not clean or patched. Dependencies were not changed in this
storage-focused work. Do not enable proxy trust without reviewing/patching that chain.

**Remaining setup:** no real Replit database, production migration, deployment, managed backup
service, encryption service, persistent backup directory or production restore drill was
configured. Keep each environment's DATABASE_URL stable, record/pin its storage ID and configure
provider backups. Development preview and published data can be separate. Optional local
pre-migration backups require DATA_BACKUP_DIR and matching PostgreSQL tools; they are not a
scheduled backup after every Save. Existing deleted/rolled-back data requires a prior database
backup or provider recovery. See DATA_PERSISTENCE.md for precise setup and commands.

## Phase 5 — October 10, 2026 (America/New_York)

The reviewed GitHub Phase 4 baseline was imported into the existing artifact and both unrelated histories were joined using a normal history-preserving merge after content integration. Newer workspace/authentication security changes remain. Every migration 001–005 was compared byte-for-byte with the reviewed standalone baseline; additive migration 006 supplies the new persistence. The development workspace applied migrations 005 and 006 normally; no production database or production deployment was touched.

**Latest completed checks:** root `pnpm run typecheck` passed across shared libraries, API, mockup, Quick Pass and scripts. Artifact `typecheck`, `lint`, `format:check` and standard `build` passed. The actual standard builder was Next 16.4 Turbopack, with successful production compile, typechecking, static generation and all Phase 5 routes. No webpack fallback was necessary. Final `test:isolated` passed **15 files / 136 tests / zero skipped** on a generated disposable PostgreSQL database, including the native-field rendering test and concurrent personnel-role/delivery serialization. The runner first applied migrations 001–005, inserted approved payroll-line and invoice snapshots plus signed receipt/reversal sentinels, applied 006, compared retained objects and then confirmed no pending migration. The fixture database was removed afterward; no business tables were truncated.

The new unit/database checks cover Eastern DST gap/overlap and 23/25-hour periods, leap-day/weekly windows, operating-day/closure skip behavior, configuration bounds/no blank numeric assumptions, forecast opening coverage/unknown/insufficient/zero-use and consumption exclusions, signed CSV formula safety, concurrent/repeated independent workers, durable missed-date cursors, interrupted/reclaimed leases/stale tokens, atomic rollback/bounded failures/audited retry, schedule revisions, source/policy/assignment/role/deactivation changes, acknowledgement versus completion, dealership payments/reversals/voids, rental partial receipt/reversal/dated void balances, 125-row complete exports and clipped downtime. Earlier Phase 2–4 suites remained passing. One pre-existing Phase 3 concurrent test incorrectly assumed which worker wins; it now checks duplicate rejection against the actually committed reference. This is not separate legacy approval-regression work.

**Browser verification:** one private-fixture pass exercised native owner/employee/bookkeeper sign-in, owner schedule/policy/forecast saves, independent jobs, saved summary and live/snapshot separation, reports/CSV, own employee reminder acknowledgement/source access and privileged-page/export denial, bookkeeper report/finance access and current-role changes. Read-only static captures after workflow restart/owner role restoration verified the retained summary's historical label, Oct 9 period and 132 captured exceptions, with exactly one saved summary for the Oct 10 occurrence. The report export was HTTP 200 private/no-store CSV with 125 data rows (126 logical lines). Employee privileged-page probes redirected to its dashboard and export probes returned 403. A user demoted to BOOKKEEPER lost responsibility export (403) but retained authorized finance export (200), as intended.

Desktop 1280×720 and mobile 390×844 owner overview, automation, reports and summary rendered with no measured document-level horizontal overflow. Screenshot observations: overview `razxub`/`0c7hnc`, automation `ovmexs`/`6dnzay`, reports `bcmgnd`/`xxl8cz`, summary `podn1r`/`0gw94h`. The browser tool did not provide filesystem screenshot outputs, so no saved screenshot files are claimed. The development overlay showed generated Field-ID hydration warnings in the new automation/report forms; a Phase 5-only native implicit-label wrapper removes those generated IDs without altering the separate legacy-label task. Its deterministic server-render/control association test passed alongside all seven Phase 5 rules tests (**2 files / 8 tests**); the final wrapper fix was checked cheaply, not by another full browser pass.

Initial browser setup was blocked by a quote-wrapped temporary datasource override, not a proved app authentication failure. The corrected exact unquoted override connected, and inherited auth configuration remained present. Normal workflow was restored and no project process retained the fixture URL before only that database and its private registry were removed. Saving zero operating weekdays correctly failed the existing at-least-one-day validation; the tester selected Monday and explicitly scheduled the summary for all days. **Not captured:** a separate fresh protected schedule POST after owner role restoration and direct bookkeeper owner-only route probes; server/unit permission tests cover those service denials but are not falsely labeled browser results. No real accounts/business tables were used or truncated.

**Publication:** native Git push still rejected its credential. During verification remote main advanced to `6aff1a1`, containing the separately verified GitHub App upload bridge. That newer work was normally merged, preserving both histories, its safe synchronization implementation and Phase 5. Root frozen-lockfile installation and workspace typechecks passed; the bridge's four tests passed. `pnpm git:check` and `pnpm git:push` used the already authorized GitHub App, verified exact blob/tree/commit identity and advanced main only by fast-forward (`force: false`). The uploaded implementation merge is [4bf865c](https://github.com/MostValuableWebDesign/Quick-Pass-Emissions-OS/commit/4bf865c392f8ce3d565515b748f2350735e7df6b), and an independent `git ls-remote` matched its full hash. Final evidence/last UI clarification are published as a subsequent commit and its final remote hash is checked at completion. No native credential repair or force-push is claimed; source publication is not an app deployment.

**Operational limits:** no actual persistent external scheduler/dead-man monitor was provisioned, no production deployment or production migration was performed, and external email/SMS remains disabled. Independently triggered CLI/POST behavior is testable locally; that is not proof of scheduled production execution. Before live use owner confirmation of schedule/closures, recipients/timing, inventory observation/coverage/lead/threshold values, source records, backups and failure-monitoring responsibility is required. Read PHASE5.md and docs/OPERATIONS.md for exact behavior and recovery.

**Final display clarification:** unconfigured forecast rows suppress technical fallback observation windows, averages and lead times rather than presenting them as owner-selected business values. The two native-field/forecast-rendering tests plus seven automation rule tests passed (**2 files / 9 tests / zero skipped**). Typecheck, lint and the standard production build passed again on the reconciled final source. This cheap confirmation is separate from the completed database-backed 136-test run and the one private browser pass; no second browser pass is claimed.

**Completion synchronization:** the project-main synchronization brought in the existing private browser regression runner, its safety tests and narrow preview-origin checks. Those changes are retained. The isolated runner keeps its owned-database/browser mode and signal cleanup; only its non-browser mode runs the Phase 4→5 sentinel upgrade, so browser fixtures still start empty. An automatic merge corrupted existing Phase 3 test scopes; the verified incoming-main version was restored, including its actual-concurrent-winner duplicate-reference assertion. The final combined isolated run passed **16 files / 140 tests / zero skipped**, retained the migration sentinels and removed only its disposable database. This supersedes the earlier full-suite count. The previously published GitHub history is retained as a merge parent rather than overwritten after project synchronization.

## Phase 4 — October 10, 2026 (America/New_York)

Implemented in the current Quick Pass workspace after confirming it was an empty Git repository with no commits or remote. Imported the complete Phase 3 delivery and preserved all Phases 1–3 source. This checkout contains complete Phases 1–4. Phase 4 publication was authorized on October 10, 2026, together with a standing instruction to commit and push completed, verified Quick Pass OS changes. No production migration or deployment was performed. Earlier publication statements below are historical, not a claim that this checkout is published. Read PHASE4.md for workflows and limits.

Verified on isolated local PostgreSQL 18 and the final production application build:

- All five migrations applied on fresh disposable databases; repeat deployment found no pending migrations. A separate upgrade first applied only migrations 001–004, inserted employee/pay/certificate/bay/rental-agreement/charge/payment sentinels, then applied 005 and confirmed their application snapshots were byte-equivalent. New dealership and finance registers remained empty.
- **91 Vitest tests passed, none skipped, across 10 files:** all prior 71 plus 4 Phase 4 rule tests and 16 PostgreSQL finance workflows. Coverage includes exact subtotal/tax rounding/overflow, dated aging buckets/statuses/reversals/voids, date validation and CSV formula protection; employee read/write/export denial and fresh role/deactivation checks; owner-only billing configuration including rejection of blank tax/net-day values; versioned directory/contact/term records; service dates/references/void history and atomic invoice allocation; retained original invoice billing/line snapshots after account edits; independent approval/version conflicts/external delivery dates; simultaneous payments/overpayment, duplicate/backdated/future receipts and retained full reversals; unpaid void/rebill history; shared references across dealer/rental/manual finance, including simultaneous cross-domain writers; manual/verified/estimated separation and independent evidence review; retained voided entries; all six audited CSV exports with signed cents/original billing identity; direct SQL money/quantity/self-review bounds; and reports/exports including 101 records while the list caps at 100.
- **6 Playwright Chromium workflows passed against the final build:** all five prior workflows plus the complete dealership/finance flow. It creates an illustrative dealer/contact, authorizes net-30 terms and a hypothetical 750-basis-point tax as owner, records ten completed services at 1,000 cents each, snapshots a 10,750-cent invoice, separately approves and records external delivery without sending email, records a 4,000-cent partial receipt (6,750 remaining), appends a full negative reversal, verifies aging includes an older issue date, records and independently verifies a 2,500-cent utility expense, downloads CSV retaining the -4,000-cent reversal, verifies persistence, denies employee direct directory/account/invoice/finance/report/export access, and checks 390px mobile fit. Fixture records are illustrative only.
- `npm run typecheck`, `npm run lint` and `npm run format:check` passed. Package manifest/lockfile and migration files 001–004 match the Phase 3 baseline byte-for-byte. Exact-cent displays use integer arithmetic, including aggregate amounts.
- **`npm run build -- --webpack` passed.** Default `npm run build` again failed because this host prevented Turbopack's CSS worker from binding a port (`Operation not permitted`). The successful alternate production build, with normal authentication/security configuration, was used for browser checks. Default builder success is not claimed.
- Desktop/full-page and 390px mobile finance screenshots were visually reviewed; mobile overflow checks passed. The browser waits for actual page content before negative permission assertions/screenshots.
- Fresh `npm audit --omit=dev` reported **zero vulnerabilities**. Full audit retains the same five high-severity development-tool package entries: braces, micromatch, fast-glob, @next/eslint-plugin-next and eslint-config-next. Dependencies were not changed. Read docs/OPERATIONS.md for exposure/update guidance.

Tests ran only on explicitly disposable local `_test` and `_demo` databases; no real business records were accessed. The local runners, test credentials, databases, builds, dependencies and browser traces are ignored and excluded from source transfer. Current source adds migration 005; never reset business data or rewrite already-applied migrations.

Actual dealer identities/contacts, agreed rates, tax treatment (including explicit zero), payment terms, service/receipt evidence, invoice numbering, opening A/R, independent reviewers, accounting source records and CSV import mappings require owner/accountant confirmation. Reports separate manual records, independently reviewed evidence, estimates and missing completeness; they do not establish profit, bank reconciliation, tax liability or complete books. They use entered effective dates and current review state, so late records/reviews can change prior-date views. Exact-reference checks cannot detect duplicate economic events entered under different references; explicit attestation and external reconciliation remain necessary.

PDF/email delivery, automatic accounting posting, bank/payment integrations, credit notes/discounts/refunds/partial reversals, complex taxes/fees, foreign currency, frozen historical financial statements and Phase 5 automation are not implemented. The supported Phase 4 workflow and accounting CSV boundary are complete locally. Real deployment-origin checks, backups/restore, external scheduler operation and real-data reconciliation remain unverified.

## Phase 4 publication checks — October 10, 2026

Fresh publication checks passed TypeScript, ESLint, Prettier, all 91 tests with none skipped on a newly migrated disposable PostgreSQL database, and the webpack production build using local test authentication configuration. All five migrations applied; repeat migration found no pending migrations. The six passing browser workflows above are the implementation verification results and were not repeated during publication. Publication builds on Phase 3 commit `0c3c3d8`; prior migrations and dependencies remain unchanged. Deployment remains separate.

## Phase 3 — October 10, 2026 (America/New_York)

Implemented locally on the complete Phase 2 source, preserving its package/lockfile and prior migration bytes. This delivery includes all Phases 1–3, rather than a Phase 3-only patch. Read PHASE3.md for the exact workflows and limits. Phase 2 was published as commit `37ae2c4`. Phase 3 publication was authorized on October 10, 2026; this commit builds on that Phase 2 history. No production migration or deployment was performed.

Verified on isolated local PostgreSQL 18 and the production application build:

- Migration 004 and all four migrations on fresh databases applied successfully; repeat deployment found no pending migrations. A separate upgrade check first applied only Phases 1–2, inserted employee/pay/certificate sentinels, then applied 004 and confirmed those records were byte-equivalent in the application snapshot. New business registers remained unconfigured.
- **71 Vitest tests passed, none skipped:** the existing 49 tests plus 4 Phase 3 rule tests and 18 Phase 3 PostgreSQL workflows. Coverage includes role/deactivation checks, owner-only layout/identifier authorization, unknown bay condition, versioned downtime, verified vendor references, equipment archive guards, employee report field restrictions and SQL-safe detail shapes, assignment/work/review/cost history, concurrent ticket updates, closure-aware duplicate-safe preventative generation and bounded catch-up, preserved scheduled due times, alert resolution, chemical opening counts/frozen units/chronological ledger/stale versions/overspend, rental ownership/bay type/overlap, full-month snapshots/month-end dates, duplicate charges, concurrent partial payments/overpayment, reversal permissions/history, unpaid voids, agreement closing and direct database bounds/overlap constraints.
- **5 Playwright Chromium workflows passed:** all three Phase 1 workflows, the full Phase 2 payroll/certificate workflow, and the full Phase 3 workflow. The latter verifies six-bay setup/status, vendor/equipment persistence, employee issue reporting, manager assignment, employee work submission, manager completion with a 2,500-cent cost hidden from the employee, scheduled preventative tickets, chemical opening 1,000 mL → consumption 600 mL → remaining 400 mL and low-stock alert, owner rental authorization, bookkeeper full-month charge/4,000-cent partial receipt with 6,000 cents remaining, manager reversal retaining the negative record, direct employee bay/rental denial and mobile fit. Fixture records are illustrative only.
- `npm run typecheck`, `npm run lint` and `npm run format:check` passed. Source comparison verifies unchanged package manifest/lockfile and unchanged migrations 001–003. The portable-source diff whitespace check was clean. The archive corruption check passed and all 114 archived files matched their source bytes; local credentials and host-specific paths were excluded.
- **`npm run build -- --webpack` passed.** Default `npm run build` failed because this host prevented Turbopack's CSS worker from binding its port, including the permission retry. The standard builder is not reported as passing. The alternate production build uses normal authentication/security configuration and was used for browser verification.
- Desktop and 390px mobile bay screenshots were visually reviewed; overflow assertions passed for bays and the employee ticket screen.
- Fresh `npm audit --omit=dev` reported **zero vulnerabilities**. Full audit reports the same five high-severity development-only Next ESLint/braces package entries: braces, micromatch, fast-glob, @next/eslint-plugin-next and eslint-config-next. Dependencies were not changed. See docs/OPERATIONS.md for exposure and update guidance.

Local tests use explicitly disposable `_test` and `_demo` databases. The source archive excludes all credentials, runtime dependencies, builds, database files and browser traces. Existing real business data was not accessed. Real bay labels/condition, equipment, verified vendor contacts, inspection responsibilities/intervals, chemical units/opening stock/thresholds, tenants, agreements and payment history require owner/staff configuration. The hosting database must support the standard btree_gist extension for migration 004. No actual production backup/restore, deployment hostname, external scheduler, real-data reconciliation or third-party integration was verified.

Phase 3 limits include recorded-time downtime, fixed six-slot types, closed-ticket follow-up corrections, calendar-day maintenance intervals with closure skipping, no chemical unit conversion/order submission, full-calendar-month rent without prorating/deposits/fees/tax/credits, full payment reversals, and no renter portal or photo storage. These are explicit in PHASE3.md and the relevant screens. Phases 4–5 remain planned.

## Phase 2 — October 10, 2026 (America/New_York)

Implemented locally on Phase 1 commit `c590363`: effective-dated owner-authorized pay/commission configuration, personal daily emissions counts and atomic imports, independent source approval, ended payroll periods, approved worked-minute inputs/completeness attestation, exact-cent draft revisions/snapshots/review/export, certificate opening/reconciliation/usage/void ledger, estimated depletion/reorder alerts, purchase request/approval, external-order records and partial physical receipts. See PHASE2.md for precise semantics and limits.

Verified against isolated local PostgreSQL 18 databases and the production application build:

- Additive migrations 002 and 003 applied successfully to the existing `_test` database. Fresh disposable demo databases applied all three migrations. Repeat migration execution found no pending migrations. The original Phase 1 migration is unchanged.
- **49 Vitest tests passed, none skipped:** the existing 27 tests plus 8 Phase 2 calculation/validation/forecast tests and 14 Phase 2 database workflows. Coverage includes personal daily threshold/eligibility, effective-dated selection, exact-cent rounding/overflow, CSV formula escaping, current role/deactivation checks, count/import duplicates and atomic rollback, independent source approval, correction version/reapproval, roster/completeness guards, retained payroll revisions/snapshots, approved-only export, self-compensation denial, period/draft concurrency, unknown opening stock, reconciliation versions, concurrent usage, duplicate movement references, purchase approval separation, partial/duplicate/excess receipts, estimates and database nonnegative checks.
- **4 Playwright Chromium workflows passed:** the 3 Phase 1 workflows and a complete Phase 2 flow from owner-authorized arrangements/policy through separately approved counts/time inputs, gross draft review and downloaded exact-cent CSV; plus opening stock, independently approved purchase, external-order reference and confirmed delivery increasing stock from 100 to 400. Employee direct payroll/certificate reads and CSV were denied. Approval/export persistence was verified across reloads. Tests use a freshly seeded isolated demo database; Phase 2 test contexts simulate distinct client IPs while production login throttling remains enabled.
- `npm run typecheck`, `npm run lint`, `npm run format:check` and `git diff --check` passed.
- **`npm run build -- --webpack` passed.** The default `npm run build` Turbopack CSS-worker process could not bind a port on this host (`Operation not permitted`), including the permission retry. This is recorded as an environment limitation, not a successful default-builder check. No framework/security setting was disabled.
- Desktop and 390px mobile certificate screenshots were visually reviewed. Sidebar overflow was fixed; payroll/inventory screens label demonstration databases. Mobile overflow checks passed.
- Fresh `npm audit --omit=dev` reported **zero** vulnerabilities. Full audit still reports five high-severity package entries in the development-only Next ESLint/braces chain (`braces`, `micromatch`, `fast-glob`, `@next/eslint-plugin-next`, `eslint-config-next`). Dependencies/lockfile are unchanged. Audit's suggested framework-config downgrade was not applied. See docs/OPERATIONS.md.

Phase 2 was published as commit `37ae2c4`. No real-business database migration or deployment was performed. Local test/demo credentials, database runtime, browser traces, generated builds and node_modules are excluded from delivery. Git history records the Phase 2 publication. Real compensation, personal-count definition and completeness, payroll roster/export mapping, stock reconciliation, ordering terms and approvers require owner configuration. The application cannot independently verify manual records against an official analyzer or payroll processor. No automatic payments/orders, tax/overtime engine, email/SMS, external scheduler changes, regulated-system integration or production restore drill is claimed.

Known operating limits include latest-100 lists, fixed pay per entire period, no periods crossing pay-arrangement changes, immutable approved payroll with later amendments handled by the payroll processor, human completeness attestation, one outstanding certificate purchase and no ordered-purchase dispute workflow. See PHASE2.md. At that Phase 2 delivery, Phases 3–5 remained planned; the Phase 3 verification above supersedes that scope.

## Phase 3 publication checks — October 10, 2026

Fresh publication checks passed TypeScript, ESLint, Prettier, all 71 tests with none skipped on a newly migrated disposable PostgreSQL database, and the webpack production build with local test authentication configuration. Repeat migration found no pending migrations. Browser workflows were not repeated during publication; the five passing browser workflows above are the implementation verification results.

## Phase 2 publication checks — October 10, 2026

TypeScript, ESLint, Prettier, git diff whitespace checks and the webpack production build passed again before publication. The publication test rerun passed 24 tests and skipped 25 database tests because TEST_DATABASE_URL was not configured; the full 49-test and 4-browser-workflow results above are from the implementation verification, not this rerun.

## Prior Phase 1 baseline — October 9, 2026

The previous delivery passed 27 logic/database tests and 3 browser workflows, initial/repeated migrations, TypeScript, lint, formatting and a production build. Its production audit was clean, with the same five development-tool findings. It was published separately as commit c590363.

Phase 1 limits remain: one shift per employee/date; one certification-expiry field; no task attachments; recurrence changes use pause/replacement plus audited overrides; closure/open-day changes do not rewrite existing instances; no self-service password recovery email. No real business database, Replit deployment, backup service, external scheduler, email delivery or accounting/regulated integration was verified during that baseline.

Database tests truncate their explicitly isolated `_test` fixtures. `npm test` without TEST_DATABASE_URL skips database suites; never report skipped tests as passed. Never point test credentials at business data.

# Service & Support — October 10, 2026

- Application typecheck, full workspace `pnpm run typecheck`, ESLint and Prettier passed.
  The shared workspace check passed for API, Canvas, application and scripts; no
  unrelated Canvas changes were made.
- All **228 Vitest tests passed, none skipped**, in **26 files**, on a uniquely owned
  disposable `_test` PostgreSQL database. Upgrade checks retained approved payroll,
  approved invoice and signed-reversal sentinels; the isolated database was removed.
  New checks include role/active restrictions, employee private-field exclusion, strict
  provider-only mutation, manager confirmation/category/status versions, explicit
  category preferences and clearing, contact history scope/persistence, archive
  relationships and concurrent/repeated support import preservation.
- **One complete protected Service & Support Playwright journey passed, no skips**,
  using `E2E_DIRECT=1 E2E_SUPPORT_ONLY=1`. The exact completion marker and exit zero
  were independently reported by the tester. It covered desktop filters/preferences,
  contact destinations/extensions, saved management metadata and equipment association,
  employee self-history/reloads/private exclusions, narrow maintenance association,
  archival/history, bookkeeper denial, missing contacts, 390px fit and keyboard focus.
  No phone, email or external destination was activated. Mobile captures were visually
  reviewed; Next's development issue badge partly obscures one captured provider card.
  The final prominent Call label/help text were checked by compilation, not another
  browser pass.
- Standard **`pnpm run build:app` passed** (Next 16.4 Turbopack). One existing backup
  utility dynamic-filesystem tracing warning remains. Emitted trace manifests contained
  no private import inputs, uploaded sources or support backups. No deployment occurred.
- The normal managed application workflow restarted against its unchanged pinned
  business database and reported ready. A screenshot of protected `/vendors` correctly
  showed the public sign-in boundary; protected screens were verified with the isolated
  signed-in browser journey, not that unauthenticated screenshot.
- Source application was **development preview only**, after a private pre-migration
  backup, storage identity verification and another verified backup at apply:
  **4 unconfirmed vendors created, 0 updated, 0 unchanged, 0 conflicted, 2 review-only
  items skipped/staged**. Repeat preview: **4 unchanged, 2 skipped, 0 created/updated/conflicted**.
  No dates, preferences, physical associations, tickets or contact histories were
  manufactured. See [docs/SERVICE_SUPPORT.md](docs/SERVICE_SUPPORT.md) for the exact
  imported-versus-staged mapping and unsupported fields.

## Login branding redesign — 2026-10-10

- Replaced the login branding panel with a navy/seafoam/ivory design, custom inline emissions/carwash illustration, service icons and a compact mobile welcome. Existing sign-in endpoint, field validation and error handling remain unchanged.
- Visually checked at 1440 × 1000 and 390 × 844. The phone layout had no horizontal overflow; required email/password controls and `/api/sign-in` form action were verified in the browser. No credentials were submitted.
- After incorporating shared main through `67f288d`, typecheck, ESLint and the production build passed. All 427 tests passed in 42 files using a separately created and removed disposable test database; none skipped. Login source formatting passed.
- Repository-wide formatting fails on eight pre-existing files from the newly fetched dashboard/retest changes. The existing database-maintenance filesystem tracing build warning remains. The full authenticated browser suite was not rerun for this presentation-only change. No deployment occurred.

## 2026-10-12 — Schlage door access

Added Security → Door access for the owner's selected Schlage Encode BE489WB.
The fixed-origin Seam integration records durable staff/temporary code requests,
replacement/revocation, last-known door status and 15-row code/history pages.
Owners register hardware; management permissions are rechecked under personnel
and security locks at request and provider dispatch. Queued actions cannot use
an inactive actor or remove a newly privileged target's access. Staff removal
queues revocation atomically. No plaintext PINs are stored, returned or audited.
Read [DOOR_ACCESS.md](DOOR_ACCESS.md) for provisioning and confirmation limits.

Verified locally:

- `npm run typecheck` and `npm run lint`: passed.
- Full owned isolated suite: **627 tests in 73 files passed**, no skipped tests.
  Includes 29 new provider/persistence tests for authorization races, timeouts,
  duplicate submission, delayed confirmation, replacement ordering, staff removal,
  temporary native scheduling, event matching, pagination and credential isolation.
- Additive migration `202610120006_door_access` applied to isolated PostgreSQL.
  Existing approved payroll, invoice and signed-reversal upgrade sentinels retained.
- `E2E_DOOR_CONNECTED_ONLY=1` owned browser run: **2 checks passed**, no skips,
  covering registration, staff issue/change/revoke, provider-confirmed removal,
  PIN clearing, reload persistence and manager controls with a synthetic transport.
- `E2E_DOOR_ACCESS_ONLY=1` owned browser run: **3 checks passed**, no skips,
  covering owner/manager setup, responsive navigation and anonymous/legacy denial.
- `npm run build`: passed using an unreachable verification-only database.
  All **64** production trace manifests were checked; none reference private
  verification files or the synthetic door-provider preload/fixture.
- Changed supported files pass Prettier. Repository-wide `format:check` still
  flags **39 untouched files**; no broad formatting rewrite was included.

The full default **32-check browser suite was attempted before integrating concurrent contact-form updates and failed**. Several
existing checks target controls absent in the pulled pre-change source, including
`Toggle theme`, `+ Add an employee`, old certificate settings and the Settings
`Run operations check` button. Other legacy workflow assertions also failed.
The strict completion guard was retained; this run is not counted as passing.
Updating those existing workflow tests is outside this door integration change.

No real Seam credentials, connected Schlage account or physical locks were used.
Live provisioning, actual keypad tests, deployment and a persistent scheduler
remain external setup. Push status is distinct from deployment.

## 2026-10-12 — Google Business Profile Analytics (local, uncommitted)

Pulled shared main through `d2384cc` before implementation. Added Analytics navigation,
explicit station grants/mapping, official OAuth state/browser/PKCE flow, encrypted
server-side tokens, refresh/disconnect/reconnection, persistent bounded sync queue,
raw expiring Google response caches, daily/manual historical requests, metric/monthly
coverage/comparisons, reviews and separate feedback themes/drafts, documented marketing
observations and owner action/follow-up history. No listing or review write endpoint.
See [GOOGLE_ANALYTICS.md](GOOGLE_ANALYTICS.md) for exact setup and reporting limits.

Verification:

- **669 tests in 75 files passed**, none skipped, using a uniquely owned disposable
  PostgreSQL `_test` database. The additive migration applied and retained existing
  approved payroll, approved invoice and signed-reversal upgrade sentinels.
- New tests cover fresh roles and station grants, personnel-lock races, OAuth state
  user/browser/expiry/single-use/generation checks, encrypted tokens/context/tampering,
  required scope, fixed endpoints, refresh and revocation, idempotent queues/caches,
  claims/stale workers, retry failures, pagination, retention, explicit zero versus
  missing/delayed data, DST/leap/month boundaries, incomplete VIN retest evidence,
  thresholded keywords, deterministic recommendations and owner action history.
- **Two Analytics setup/access browser checks passed**, covering owner registration,
  persisted action history, May filters, 390px fit and manager denial without a grant.
- **One complete synthetic Google browser workflow passed**, covering actual application
  OAuth initiation/callback/cookie handling, authorized location discovery/mapping,
  authenticated independent job processing, explicit zero/threshold/review display,
  reload persistence and disconnect removal. Google HTTP responses and consent redirect
  were intercepted only in the explicit runner-owned test mode. No real Google data,
  credentials or account was used; no skips counted. Initial fixture assertions were
  corrected for the shared cooldown and the disappearing disconnect form.
- TypeScript and ESLint passed. Production build passed with an unreachable build-only
  database, confirming rendering/build does not require provider or business DB access.
  **66** production trace manifests contained **zero** private verifier or synthetic
  provider references. Changed supported files pass Prettier; repository-wide formatting
  still fails on **39 untouched files**.
- The default browser manifest now includes the two Analytics checks (**34 total**, or
  37 with station history). Strict per-file/count/skip guards remain. The full default
  suite was not rerun; previously documented stale workflow-selector failures remain.

Read-only observation of the already signed-in Google Performance page showed May–October
2026 with separate interaction views. That browser observation did not populate the app
or verify API authorization. **Live Google authorization: unverified. Live Google sync:
unverified. External scheduler: not provisioned. Deployment: not performed. Commit/push:
not performed, as requested.**

Station-linked retail collections and actual refunds have no existing source register;
Analytics labels those unavailable and keeps unallocated dealership receipts/reversals
separate. Google raw content is cached for 29 days under its current API policy; business
records, mapping, grants and owner-entered actions survive builds/restarts. There is no
permanent Google archive, inferred conversion/ROI, automatic reply or fabricated insight.
