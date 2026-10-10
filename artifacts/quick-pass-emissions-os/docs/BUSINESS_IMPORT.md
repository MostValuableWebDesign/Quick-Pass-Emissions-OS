# Controlled business configuration import

This workflow imports **reference configuration**, not transaction history. Open
**Settings & audit → Business configuration import & unresolved decisions** as
the active owner. Other roles cannot read manifests or call preview/apply.
The existing payroll, station, rental, dealership and recurrence workflows remain
the only paths for approving consequential changes.

## Sources actually found

- `attached_assets/Pasted--Quick-Pass-Emissions-Tag-Renewal-Carwash-Operations-Re_1791637720316.txt`:
  operations guide, including its final supplier correction.
- `attached_assets/Pasted-Populate-Quick-Pass-Business-OS-using-the-real-business_1791637749194.txt`:
  acceptance instructions, **not independent business evidence**.
- The other uploads contain navigation, Phase 5, station-history and service-directory
  feature requests. They are not employee rosters, transaction evidence or contracts.

No separate document titled “Business responsibilities,” employee roster,
dealer/contact list, inventory export or rental agreement was found.
Never assume that a referenced attachment exists or was already imported.

## Source-to-field mapping

| Guide section                                                                       | Supported destination                                                         | Required review / deliberately excluded                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supply ordering, analyzer support, drain pits, wash service/parts, final correction | Protected vendor `name`, `contact`, `phone`, `services`, `reference`, `notes` | No invented contact, branch, email or verification date. Customer/tech identifiers are references, not login credentials. Final supplier correction controls chemical vs parts vs motor-belt categories.                         |
| Wash chemical catalog                                                               | Active chemical `name`, `notes`                                               | `unit`, `reorderPoint`, `balance` and operational supplier assignment remain null until measured/verified. No opening movements or package conversions.                                                                          |
| Certificate orders                                                                  | Saved `CertificateSetting.minimumOrder`                                       | No stock, lead time, threshold or observation window inferred; no ACH or external order execution.                                                                                                                               |
| Six-bay narrative                                                                   | Owner-only review item                                                        | Existing layout service requires six owner-confirmed identifiers. No identifiers, conditions, tenants, rental terms or assignments invented.                                                                                     |
| Named employees and pay narratives                                                  | Separate owner-only review items, with exact source sections                  | First names never match demo accounts or employees automatically. Weekly/hourly statements, estimates and contingent work remain distinct. No login creation/invitation, privileged roles, activated pay policy or worked hours. |
| Shop-total commission example                                                       | Conflict review item                                                          | Does not replace the established effective-dated personal-approved-count policy. Example totals are not historical evidence.                                                                                                     |
| Monday/weekly/as-needed duties                                                      | Owner-only review items                                                       | Frequency alone is insufficient. Confirm identity/assignee, date, deadline, weekdays, operating days and closures before existing recurrence services are used. As-needed repairs remain unscheduled.                            |
| Dealership, rental, banking, networking and future finance narratives               | Missing-evidence/decision review items                                        | No balances, invoices, payments, contacts, rents, meeting intervals or credentials fabricated.                                                                                                                                   |

Saved record values, selectable operational choices, new-record defaults and historical
transactions are distinct. Imported catalog names are database-backed active records.
Unverified supplier references are visible in the protected vendor registry but excluded
from operational supplier dropdowns until independently verified through the existing
vendor form. Unknown units/thresholds are blank in saved forms; movements require a unit.
The certificate minimum is a saved ordering setting, not current inventory.
Incomplete forecast settings produce an unconfigured state, not an estimate.

## Prepare and preview

An authorized operator prepares a structured JSON manifest by reading the actual source.
The parser validates data; it never executes pasted document instructions. Record
the SHA-256 of the original source bytes in `sourceFingerprint`, a source filename/title
in `sourceName`, and a stable item `key` plus exact line/section in every item.

Only these discriminated entities/fields are accepted:

- `VENDOR`: optional explicitly confirmed `recordId`; `values` contains `name`, `contact`,
  `phone`, `email`, `services`, `reference`, `notes`. Unknown strings are empty, not fabricated.
- `CHEMICAL`: optional explicitly confirmed `recordId`; `values`: `name`, `notes`.
- `CERTIFICATES`: `values.minimumOrder` (integer, supported minimum bounds).
- `REVIEW`: `values.title`, `values.details`, `values.required`.

At most 100 items; unique keys are required. Financial, history, role, verification,
stock and compensation fields are rejected. Multiple source items claiming the same
name, phone, email, reference or singleton setting are conflicted, not arbitrarily selected.
Existing vendors need exact stable phone/email/business-reference evidence or an explicit
owner-confirmed record ID. Chemical names are exact case-insensitive catalog keys.
No fuzzy person matching is supported. Never guess a record ID.

The web dry run writes no business data. It displays field-level before/proposed/change
values, matches, source sections, missing prerequisites and created/updated/unchanged/
conflicted/skipped counts. Existing nonblank values, including explicit zero/false,
are preserved. Blank fields alone can be filled. Conflicting records require a separate
documented review, not automatic replacement.

The server seals the exact preview with an authenticated signature, actor, storage identity
and 30-minute expiry. Application requires the same active owner, the same database and
the reviewed record snapshots. Never put manifests, source documents, sealed previews,
actor metadata or receipts in Git, ordinary logs, public pages or deployment bundles.

## Backup and apply

Privately confirm the target `DataStore` identity against the intended environment and
`EXPECTED_DATABASE_ID` before importing. Preview and production can be different databases.
Follow [DATA_PERSISTENCE.md](../DATA_PERSISTENCE.md) for connection pinning and backup tooling.

Configure `DATA_BACKUP_DIR` as a private, persistent operator-controlled directory outside
public/build directories. Install matching PostgreSQL `pg_dump`/`pg_restore` tools.
Web application always creates a fresh full custom-format archive, verifies readable
archive metadata and mode `0600`, then begins the business transaction. A client checkbox,
client-supplied path or alleged backup receipt cannot bypass this gate. Failure stops apply.
Retain backups with provider access controls and the business's recovery policy; a successful
local development backup does **not** provision production retention or disaster recovery.

After inspecting the field-level preview, confirm and choose **Back up and apply reviewed
changes**. Changes, domain audits and manifest outcomes commit together in one transaction.
Personnel → certificate/payroll → maintenance locks preserve the existing lock order.
Role/status, storage identity, match and full snapshots are rechecked inside the transaction.
No destructive migrations, resets, truncation, demo seed or fixtures run on this target.

## Operator CLI (development preview only)

Database-operator access is the CLI trust boundary, as for account recovery. The operator
must be acting on the verified owner's authorization; possession of a user ID is not a
public login mechanism. The web workflow uses the owner's authenticated session.

Create private mode-`0600` target metadata with `instanceId`, `actorId` and
`environment: "development-preview"` after independent target verification.
Do not commit it. Store source JSON and outputs under the ignored, mode-`0700`
workspace directory `work/business-import`. The command refuses production mode
and mismatched target identity; it never switches the datasource.

From the application directory:

```sh
pnpm exec tsx scripts/business-import.ts preview \
  ../../work/business-import/input.json \
  ../../work/business-import/target.json \
  ../../work/business-import/preview.json

# Read the private field-level preview before application.
# DATA_BACKUP_DIR is configured privately by the operator.
pnpm exec tsx scripts/business-import.ts apply \
  ../../work/business-import/preview.json \
  ../../work/business-import/target.json \
  ../../work/business-import/applied.json
```

Use a **new output filename** for each attempt. Output creation is exclusive; do not
overwrite private evidence. CLI logs only counts, mode, environment and backup status.
Driver/framework errors are never dumped.

## Retry, conflict and partial-outcome semantics

The canonical manifest hash identifies a run. Source fingerprint plus section/item key,
actor, database identity, before/after records and versions remain in owner-only manifests;
ordinary audit summaries include fixed import metadata/counts. Each mutation uses shared,
transaction-aware domain boundaries, never independently committed nested calls.

- Identical/concurrent applications serialize; previously applied items use retained
  import-to-record identity, including references with no external contact identifier.
- An identical already-applied record is unchanged. Later staff changes (even to fields
  not supplied by the source) are conflicted and never overwritten.
- A stale-preview item is conflicted; other unambiguous items may commit. A fresh reviewed
  preview can resume only unresolved items under the same run. Previously applied
  provenance is retained, and each resumed mutation records its own actor.
- Review-only items are **skipped for automatic mutation but staged in the saved manifest**,
  not silently discarded or activated.
- Any actual transaction exception rolls back all mutations/audits/outcomes in that attempt.
  A backup may remain privately. Re-preview and retry; no successful business commit is claimed.
- If a CLI receipt file cannot be written after commit, the command reports incomplete.
  Re-preview/retry and inspect saved history: the durable run prevents duplicate writes.

Reload the owner review page and the affected vendor/chemical/certificate forms after
application. Verify supplier gates and unconfigured fields. Resolve pay, identities,
layout, recurrence and financial decisions only through their existing authorized services.
Saved review evidence remains historical; it is not a claim that later manual decisions
have already been completed.

## Verification

```sh
pnpm run typecheck                       # from workspace root
pnpm --filter @workspace/quick-pass-emissions-os lint
pnpm --filter @workspace/quick-pass-emissions-os format:check
pnpm --filter @workspace/quick-pass-emissions-os test:isolated
pnpm run build:app                       # from workspace root
E2E_DIRECT=1 E2E_IMPORT_ONLY=1 pnpm --filter @workspace/quick-pass-emissions-os test:e2e
```

Tests use synthetic fixtures in a newly created, uniquely owned `_test` database.
The focused browser runner uses a separate private port and private native-login
state without replacing the managed preview or entering captured credentials.
When continuing only previously unreached assertions, additionally set
`E2E_IMPORT_REMAINDER=1`. The native runner prepares the matching synthetic manifest with a
verified isolated backup, and Playwright starts at vendor verification rather than
repeating the already checked dry-run/apply UI. Require the exact targeted-completion
message, process exit zero and cleanup; do not count a failed or partial run as passing.
Tests cover matching/blank preservation, duplicates, repeat/concurrent application,
stale previews, staff edits, permission/backup gates, rollback/resume, unknown
configuration and historical side-effect preservation. Upgrade sentinels retain approved
payroll, invoice and signed-reversal snapshots. Never point tests at a business database.

Source JSON, real manifests/receipts and backups are excluded from Git, Replit deployment
inputs and Next server traces. Code publication is separate from database application
and from production deployment; report each independently.
