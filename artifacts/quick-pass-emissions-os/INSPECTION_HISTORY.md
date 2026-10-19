# VIR history and returning vehicles

## Owner workflow

In **Performance → Refresh panels**, choose **Retrieve historical VIRs**. The retrieval screen
(`/performance/history`) defaults to the previous 24 calendar months through today in
America/New_York. Select an authorized station and dates, save the job, then Start / Resume.
The report filters at the top independently select the reporting period and station scope.
There is no file picker, CSV/Excel upload command, paid scheduler, or always-on worker.
Retained legacy imports are preserved but are not counted as authenticated VIR history.

The current integration has server credentials for **one station**, the existing
`GA_STATION_ID`, `GA_DASHBOARD_USERNAME`, and `GA_DASHBOARD_PASSWORD`. Other registered stations
are shown as unavailable until supported authorized portal access is configured. Registration
alone does not grant provider access. Only active owners may read or mutate this workspace;
roles and station scope are rechecked on the server under the personnel/station/history locks.

A job spans at most 24 months, split into monthly windows. Older dates can be requested in
separate jobs; the date picker does not assert provider retention. No age-based cleanup deletes
records, encrypted reports, or decisions. Reporting can continue using retained older history.
Jobs/windows are shown 15 per page. Start/Pause/Resume, targeted retry, and smaller-window split
retain checkpoints and prior decisions. Oversized provider responses automatically split their
window and continue after the shared cooldown; a single oversized day remains a visible failure.

## Actual source and limits

The adapter reuses the existing authenticated **Test History / VIR Reprint** report at
`/Applications/TestHistoryVirReprint.aspx`. It searches the exact station/date window and
requests the original structured bulk export. The screen's pager states the **all-page** total;
the complete export must have that many rows and match station and date metadata. An export
containing only the first page is rejected. This avoids crawling or stopping at the first
screen page. Each verified export is saved encrypted with its digest, requested scope, retrieval
time, row checkpoints and original fields; every visit links to its window/source and canonical
revision. **Original VIR source** downloads owner-authorized, non-executable plain text, with a
read audit entry. Original HTML is never inserted into the application DOM.

The observed provider fields are VIN, license plate, local Test Date/time, Issued By, Cert Number,
and Result. The observed export omits stable inspection IDs, plate state, payment and retest
classification. If supported report columns supply them, the parser retains them. Source IDs
are station/source-scoped; absent IDs remain absent and use conservative six-field fingerprints
and ambiguity checks, never invented provider IDs. Original report content also preserves any
embedded references. On-screen detail-link identifiers were seen in earlier discovery, but
individual PDF/detail retrieval has **not** been implemented or live verified.

There is **no OCR engine or PDF scanning integration in this checkout**. Structured fields take
priority. Extraction method and qualitative identity status are stored; uncertainty metadata
from a future scanner is retained and cannot produce confirmed VIN/plate identities. Image-only
reports are unsupported rather than silently guessed. This implementation does not claim to
retrieve unavailable individual PDFs or manufacture OCR results.

Safety bounds are 2 MB and 10,000 rows per export, 25–200 extraction decisions per request
(default 100), a 45-second shared export operation and 120-second recoverable lease. Historical,
manual Performance and daily-count requests share the same station gate: one active export,
60-second success cooldown, five-minute failure cooldown. Rate-limit Retry-After and bounded
exponential backoff are persisted, with five attempts before failure. No network runs under a
database transaction. No cookies, raw VINs, source HTML or passwords appear in public status,
audit error text or logs.

## Foreground processing and incremental refresh

The Performance trend also offers **Jan 2023–today · monthly totals**. In that view,
**Refresh panels** starts a foreground, resumable source backfill from January 1, 2023
through the current Eastern business date, plus the preceding 30-day VIN evidence needed
for free-retest classification. It uses the existing Performance three-request/three-day
batch limits and shared station gate—not one oversized export. The progress count includes
those supporting source dates. Saved historical dates are reused rather than exported again.
The interface shows cooldown waits and Pause; closing/navigating away stops new requests,
though the in-flight bounded batch may finish. Reopen the view and Refresh to resume.
Known incomplete rows remain excluded without automatic historical retries. An export or
authorization failure pauses the run; no-progress detection prevents endless retry loops.
No independent worker, unattended polling, limit bypass, or financial posting is added.

Keeping the retrieval screen open sends consecutive bounded requests. Pause/close/reload stops
new requests; an already-running bounded request may finish. Reopen the saved job and Start /
Resume. A RUNNING database status is intent/checkpoint state, not evidence of a live worker.
Leases prevent two tabs from processing the same batch, overlapping historical jobs are rejected,
and expired leases recover after restart without losing committed decisions.

Ordinary Performance refreshes now persist the original structured VIR report as well as the
existing aggregate cache. Each capture processes at most 100 rows; any remaining extraction
continues through bounded foreground requests while Performance is open. Closing the screen
stops those requests. Saved incremental jobs can also be resumed from the retrieval screen.
Repeated unchanged reports reuse the checkpoint; changed/overlapping reports deduplicate against
canonical identities and source IDs. A user-paused job is never silently resumed by refresh.
None of these steps approves counts or posts payroll, commissions, certificates or revenue.

## Coverage and classifications

Each window shows pending/running/partial/completed/failed/unavailable, source rows retrieved,
extraction cursor, parsed/duplicate/rejected/unresolved/identifier-review counts, provider total,
fetch time and next retry. Retrieval completion is separate from successful extraction. A source
can reconcile its all-page count while invalid identifiers still make extraction partial.
A verified explicit echoed empty portal reply supports zero; failed/missing responses do not.

The Returning-vehicle panel shows earliest/latest saved VIR dates and unverified station/months
in its 24-month lookback through the reporting end date. Adjacent successful windows may jointly
cover a month. A month with any unverified date, incomplete extraction or failed window is not
presented as a confirmed empty month. Coverage is partial until reconciled; provider retention
outside successful requests remains unverified. Fetched time is distinct from inspection dates.

Valid VIN is primary (17 characters, permitted characters, check digit). VINs are never silently
corrected. Plate + issuing state is fallback only for missing VIN, with unambiguous associations
across the selected authorized stations. No state means no plate match; invalid/uncertain VINs
cannot fall back. Different valid VINs remain separate despite shared plates. Plate changes do
not split a valid VIN identity. Original and normalized values remain encrypted.

Each qualifying identifiable vehicle counts once in the reporting period. Returning requires
an earlier qualifying visit **before** the period start in the same station scope. Employee
focus filters current-period attribution; prior visits are checked across the selected scope.
First observed means **in available history**, never first-ever.

Qualification requires completed, explicitly paid **initial** tests. Both paid and free known
retests are excluded. Unknown payment/retest/completion remains separately reported. A VIR,
certificate, Pass/Fail result, or repeated VIN alone is not payment evidence. In the currently
observed export payment and retest classifications are missing, so the paid returning rate can
correctly remain **Insufficient data** even after retrieval. Unmatched records and unknown
classifications are outside the rate denominator. Identification coverage is explicitly based
on qualifying inspection records, not an invented distinct count for unidentifiable rows.

## Setup and honest verification

Keep the same persistent DATABASE_URL and stable BETTER_AUTH_SECRET across builds. Apply additive
migration `202610180001_vir_history` with the guarded startup procedure; never reset business data.
The earlier history migration and all legacy records remain. Source encryption uses the existing
AES-256-GCM/HKDF scheme. See DATA_PERSISTENCE.md.

This change is verified with isolated PostgreSQL and synthetic portal/browser fixtures; those
fixtures are test-only and cannot establish real provider availability. The local environment
has no GA portal credentials, so no live older VIRs or two-year coverage were verified for this
change. Required live acceptance: configure the existing station secrets privately, retrieve
an older bounded window, inspect its provider total/source fields, resume the remaining windows,
and review the actual earliest/latest dates and gaps. Stable IDs, payment classification,
plate-state availability, date retention, empty-month behavior and provider time semantics must
be verified from those authorized results. Do not call the two-year history complete merely
because its job exists or its interface is implemented. No deployment is authorized here.
