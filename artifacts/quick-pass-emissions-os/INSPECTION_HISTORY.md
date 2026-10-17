# Historical imports and returning vehicles

Open **Performance → Historical import** (`/performance/history`) as an active owner. This extends the existing canonical StationRecord/StationRevision system. It needs no scheduling subscription, Replit Scheduled Deployment, new credentials system, or always-on worker. No deployment or live two-year collection was performed.

## Start and resume

1. Choose inclusive dates within the last two years, authorized stations, source system, and **25–200 records per batch** (default 100). Confirm source-local dates mean America/New_York. **Create import** saves a station/month window, including partial boundary months.
2. Choose the existing portal bulk export or upload each window's CSV/original HTML-based `.xls`. File uploads require a source reference; the checked source total is optional and explicitly owner-supplied. Other registered stations require their own authorized exports because only the existing configured station has portal credentials.
3. Click **Start / Resume** and keep the screen open. Each completed request performs one source fetch or one bounded record batch before the browser requests another. Progress, source rows, decisions, retry times and checkpoints live in PostgreSQL.
4. **Pause**, closing, reloading or navigating away stops further requests from this browser. An in-flight bounded batch can finish and save its checkpoint. Reopening the saved import and clicking **Start / Resume** continues; the created job ID stays in the URL for direct reopening. A ready job does not imply work is running without an open processing screen.
5. **Retry window** revisits only a partial/failed window. Successful months remain untouched. **Split window** divides a pending/partial/failed range into two contiguous smaller windows and retains the original attempt. **Replace source** retains old rows/decisions and creates another source attempt. It never deletes omitted canonical inspections or silently overwrites conflicts. **Download row errors** includes all rejected/unresolved rows for that window. Window lists use 15 items per page.

The report refreshes when foreground processing stops. Manual report refresh preserves selected dates/stations. Performance's common dates and employee focus apply to its panel: employee focus filters current-period records with existing inspector mappings; earlier visits are searched across the selected station scope. Missing attribution is not guessed.

## Source availability and setup

The existing `GA_STATION_ID`, `GA_DASHBOARD_USERNAME` and `GA_DASHBOARD_PASSWORD` stay server-side. The adapter reuses the authenticated Test History / VIR Reprint bulk export, validates station/date metadata and reconciles exported rows against the provider's **all-page** total. It does not import only the first visible page. Portal cookies remain short-lived and are discarded. No browser cookies, new OAuth flow, scheduled scraper or analyzer calls are added.

Live two-year availability, retention and every monthly export remain **unverified**. The observed original report supplies VIN, plate, local time, inspector, certificate and result, but omits stable inspection IDs, plate state and payment/free-retest evidence. Those fields remain missing. A Pass/Fail can establish completion, never payment. Portal-only imports may correctly show **Insufficient data** for the paid returning rate. Supply an authorized inspection-level export with explicit payment and retest evidence before interpreting it. Existing Performance/Marketing 30-day paid estimates are not promoted into confirmed paid facts.

Source totals distinguish provider all-page totals, owner-supplied totals and unavailable totals. Completion requires no rejected/unresolved rows and agreement between fetched rows, current canonical source inspections and the provided total. Missing totals remain unverified. Reconciliation describes the exported scope; it does not prove that the provider retains all older history. Unprocessed/unrequested dates remain unknown.

## File format

Maximum **2 MB / 10,000 rows per window**. Supports UTF-8 CSV and the provider's original HTML-based `.xls`. Save binary `.xls` / `.xlsx` as UTF-8 CSV first. No macros or formulas execute. Split oversized ranges; an oversized single day needs a smaller complete export or supported provider access.

Supported headers: `Inspection ID` (also `Test ID`, `Record ID`, `Source ID`), `Station ID`, `VIN`, `License Plate`, `Plate State`, **`Test Date`** (required), `Issued By`, `Cert Number`, `Result`, `Payment Status`, `Retest Status`, `Status`. Extra columns and original identifiers/leading zeroes remain encrypted in source evidence. Duplicate/ambiguous headers, malformed quoting and unsupported export layouts fail with a saved diagnostic.

- Dates: ISO dates/date-times, offset/Z timestamps, or original `MM/DD/YYYY hh:mm AM/PM`. Explicit offsets convert to Eastern dates. Local times remain local evidence with recorded owner confirmation; no unobserved UTC instant is invented.
- Payment: `PAID`, `UNPAID`, `REFUNDED`, `UNKNOWN`.
- Retest: `INITIAL`, `PAID_RETEST`, `FREE_RETEST`, `UNKNOWN`.
- Status: `COMPLETED`, `VOIDED`, `CANCELLED`, `INCOMPLETE`, `UNKNOWN`. Without an explicit status, Pass/Fail means completed; other outcomes remain unknown.
- Blank payment/retest remains unknown. Unsupported values reject the row. A supplied Station ID must match; otherwise the explicitly selected upload window supplies station provenance. Original `.xls` date/station metadata must match exactly.

Header-only CSV with a checked source total of zero can record an owner-reported empty scope. A missing file/total or failed request never becomes zero.

## Identity and returning rules

Saved imports and their monthly windows both have 15-item pagination, so older checkpoints remain reachable. A supplemental export using the same inspection source system and matching canonical identity may fill previously unknown status/plate-state fields. Known facts cannot be replaced by a contradictory value. The prior encrypted source snapshot is preserved in the transactional audit, in addition to original staged rows and decisions. Keep the source reference specific about where supplemental payment/retest evidence came from. Imported counts include this evidence enrichment, not just newly created canonical inspections.

Stable IDs are scoped by station and source system. Unchanged repeats are duplicates; conflicts remain unresolved. Existing original-report fingerprints link to canonical records. Without IDs, valid identification, precise time and a result are required. Indistinguishable or normalized vehicle/minute/inspector/certificate/outcome matches that cannot establish unique identity go to review rather than creating duplicates. Every decision is retained.

VIN is primary: trim/uppercase, 17 permitted characters and a valid check digit, rejecting repeated placeholders. This is structural validation, not registry/ownership verification ([NHTSA VIN guidance](https://www.nhtsa.gov/document/final-rule-vehicle-identification-number-requirements)). Plate fallback normalizes spaces/hyphens/case and requires a supplied recognized state/territory. It is lower confidence and only used for missing VINs with unambiguous observed associations. Conflicting VINs never merge through a shared plate; a nonblank invalid VIN cannot fall back. Names, phones and emails never identify vehicles.

Only **completed, explicitly paid, non-free inspections** qualify. The rate is **distinct returning vehicles / distinct identifiable qualifying vehicles**. A prior qualifying inspection must precede the reporting period at a selected authorized station. Repeat visits within the period count once and cannot make a first-observed vehicle returning. Free retests, voided/cancelled/incomplete/unpaid/refunded inspections are excluded; unknown statuses are separate.

First observed means first observed **in available history**, never a first-ever visit. Zero denominator shows **Insufficient data**. Unmatched records are excluded from the denominator and cannot honestly be deduplicated into exact vehicles, so the UI labels them vehicle records. Identification coverage is identifiable qualifying inspection records / all qualifying inspection records. Available dates, quarantined rows and partial coverage remain visible. Superseded/non-current canonical revisions are excluded.

## Persistence and isolation

Additive migration `202610170001_inspection_history` adds database jobs, windows, staged rows, append-only decisions, evidence linked to canonical records, plate associations and indexes. Existing records default to `historicalOnly=false`; new history stays outside operational/Marketing count queries. An explicitly requested original-report review import can promote matching history into the existing review workflow. Collecting history itself never does.

No payment, payroll, commission approval, stock movement, notification or automation enqueue runs from this importer. Existing independent workers/schedules remain intact. Apply the migration through the existing guarded startup/migration procedure, not a reset; builds never migrate business databases. See [DATA_PERSISTENCE.md](DATA_PERSISTENCE.md).

Source rows and normalized originals use AES-256-GCM with context binding and an HKDF-separated key derived from the existing stable `BETTER_AUTH_SECRET`. Preserve that secret across releases and secure backups; deliberate rotation requires re-encryption. Raw VINs/plates never appear in status/error responses, audit diagnostics or synthetic previews. Matching uses hashed keys.

Fresh owner/station checks run under personnel → station → history locks. A 120-second database lease fences repeated clicks, tabs and stale processes. Source calls run outside locks with the existing 45-second deadline and shared export cooldown. Normal cooldowns do not consume failure attempts. Temporary failures persist exponential retry due times, honor Retry-After, and stop after five attempts. Row decisions and checkpoints commit together; interrupted batches roll back together. Indexed period grouping and candidate-identifier lookbacks avoid loading all history or rebuilding reports after every row.

## Verify

Use the existing runner-owned disposable database workflow, never business data:

```sh
pnpm --filter @workspace/quick-pass-emissions-os typecheck
pnpm --filter @workspace/quick-pass-emissions-os lint
pnpm --filter @workspace/quick-pass-emissions-os format:check
E2E_DIRECT=1 pnpm --filter @workspace/quick-pass-emissions-os test:isolated
E2E_DIRECT=1 E2E_HISTORY_ONLY=1 pnpm --filter @workspace/quick-pass-emissions-os test:e2e
```

Optional `E2E_CHROMIUM_PATH` selects an installed browser; `E2E_HISTORY_CAPTURE_DIR` saves synthetic desktop/phone previews. Actual checks and limitations are recorded in [VERIFICATION.md](VERIFICATION.md).
