# Service & Support

## Operational use and permissions

Open **Carwash & Maintenance → Service & Support** (`/vendors`). It is the existing
Vendor register, not a parallel supplier database. OWNER/ADMIN maintain verified primary
contacts, directory metadata, category preferences, target associations and active status.
Employees and legacy bookkeepers have no app access. All support operations are performed by owners and managers.
Every read and operation rechecks the current active account and role in the transaction.

Search provider/contact/service text, filter any supported category and optionally include
archived records. A provider can have several categories and a category several providers.
Preferences require an explicit manager choice of an active, verified, categorized provider.
Clearing retains a version tombstone so old selections cannot overwrite newer choices.
Filters do not change the preference options or silently clear configured preferences.

Document-sourced contacts remain visibly **unconfirmed**. Verification is a manager's
attestation after checking a real contact/evidence, not an automatic independent lookup.
An old source never creates a new verification/last-confirmed date. Actual confirmation
dates display without assuming a freshness threshold. Confirm old details before relying
on them; unknown hours/emergency availability remain unknown.

Primary/alternate/emergency numbers use validated `tel:` destinations. Extensions display
separately and must be dialed manually after connecting. Formatted numbers can be copied;
unavailable clipboard access produces an honest fallback message. Email uses `mailto:`.
HTTP/HTTPS website/support links reject embedded credentials and unsafe schemes and are
clearly external, with opener isolation. Desktop links depend on installed calling/email
apps. Links never log connected calls, sent emails, conversations or completed repairs.

## Maintenance, equipment and history

Manager equipment/bay views link to their configured support providers without widening
record access or replacing the legacy primary equipment vendor. Owners and managers
may associate an active verified vendor with a ticket using **Associate provider only**.
This operation cannot change assignees, costs, deadlines, review rights, progress or repair
status. Terminal tickets remain closed. Management records all work and review.

Contact entries are user-initiated and explicitly self-reported. Time includes an explicit
offset; actor identity comes from the server. Method, optional ticket/equipment, outcome,
reference and follow-up date persist in separate append-only application history. Every
related ticket/equipment is authorized and mismatched targets are refused. Management
can log general provider contacts or select related tickets/equipment. History includes
all management entries. Narrative is not copied into ordinary audit summaries.
Contact entries do not submit work or alter repair completion. No external reminders,
messages or service requests are sent.

Archive/reactivate is a versioned management operation, including source-only vendors.
It does not require invented verification. New selections/contact entries exclude inactive
providers; permitted historical links and history survive. Restrictive foreign keys prevent
cascading provider deletion. Verified-contact editing still uses the original required
contact/evidence/date/phone-or-email validation; directory editing cannot bypass it.

## Protected source enrichment

The existing business-import preview/apply workflow supports an optional `values.directory`
on VENDOR items. It validates categories/contact URLs and does not accept confirmation,
preferred choices, physical assignments or contact logs. Matching, retained provenance,
blank-only enrichment, conflicting-value review, optimistic snapshots, domain locking,
backup gates and repeat/concurrent protections are shared with the prior importer.
See [BUSINESS_IMPORT.md](BUSINESS_IMPORT.md).

Operator preparation reads the actual private guide at execution time:

```sh
# From the application directory; use a fresh private output prefix.
pnpm exec tsx scripts/support-source.ts <private-guide-path> <new-output-prefix>
```

Preparation performs no business writes. It extracts supplied phone/account values from
their actual sections, requires the final supplier correction, preserves source-backed
legacy fields only when the same document's retained provenance identified a record,
and stages ambiguous personal contacts as REVIEW items. It refuses an unpinned or
non-development target for protected preview. Private output is exclusively created with
0600 files under the ignored 0700 `work/business-import` directory.

Use the existing operator `business-import.ts preview|apply` commands with the prepared
private input/target/preview files. Apply requires the verified target and a complete,
access-controlled, readable backup. Never publish the source, manifest, target or backup.

### Source mapping and actual development-preview application

Support information comes from the owner-provided contacts and the uploaded **Operations
& Responsibilities Guide**, including its final correction. Directory/import/navigation
feature instructions are not independent contact-verification evidence.

| Provider / item    | Source-backed operational enrichment                                                   | Boundaries                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| OPUS TECH          | Analyzer support, supplied phone, immediate-call instruction                           | No named contact or verification date; supplied tech identifier is manager-only                  |
| Pit Pro            | Chris, supplied phone, drain-pit service and as-needed scheduling instruction          | No cleaning cadence, preferred choice or physical pit assignment                                 |
| The Advanced Group | Adam or Lamar, supplied main phone, wash equipment, chemicals and storage motors/pumps | No guessed primary/alternate personal numbers or equipment IDs                                   |
| KleenRite          | Supplied phone; hoses, guns, nozzles, brushes, carwash parts and cleaning supplies     | Owner clarified cleaning supplies; the separate wash-chemical duty does not assign those products to KleenRite; customer ID manager-only |
| Termayne           | Camera/security concern and incomplete name retained in owner review                   | Not invented as a confirmed business provider; no contact method supplied                        |
| Robert             | Belt-repair responsibility retained in owner review                                    | Incomplete identity; retail/Amazon belts are purchase exceptions, not verified service providers |

An earlier guide-import report described four unconfirmed vendors and two review-only
items. Those provider rows were not present when the identity-pinned database used by the
running workspace was checked. Import notes must not be treated as proof that the active
directory contains the records.

The owner's supplied contacts were applied to the verified development-preview target
through the protected importer after a complete, private, readable database backup.
The directory now returns **5 active, unconfirmed contacts**: OPUS TECH, Pit Pro,
The Advanced Group, KleenRite and the explicitly requested camera contact, Termayne.
Four have supplied phone numbers. Termayne displays only the supplied name and
camera/security instructions, with no invented phone, surname or company identity.
A repeated preview reports **5 unchanged**, with no duplicate creates or updates.

Phones, categories and instructions were checked against the saved rows and the normal
authorized directory read. Tech/customer references are in manager-only account-reference
fields. Verification dates, preferences and physical assignments were not inferred.
Existing records, payroll and financial history were not overwritten; no service ticket,
purchase, contact log, balance, schedule or repair completion was created.
No production data/application or deployment was performed.

## Verification

Synthetic rule/database checks cover filters, many-to-many categories, preference versions
and clearing, validated phone/email/external links, extensions, missing contacts, current
roles/active accounts, direct injected-field denial, private projections, scoped ticket
and equipment access, self-only manual history, archive preservation, and duplicate-safe
concurrent/repeated imports with later staff edits retained.

The guarded browser command is:

```sh
E2E_DIRECT=1 E2E_SUPPORT_ONLY=1 pnpm --filter @workspace/quick-pass-emissions-os test:e2e
```

It creates/removes only a uniquely owned disposable test database, uses a private native
sign-in/port/cache and never changes the managed business preview. One complete journey
passed with no skips: desktop filtering/preferences/contact destinations, management edits
and equipment association, non-management access denial, manual history persisted across
reload, narrow maintenance provider changes, archive/history preservation, bookkeeper
exclusion and missing-contact states. 390px manager detail/directory views fit without
horizontal overflow and keyboard filter focus worked. No real contact link was activated.
The reviewed captures contain Next's development badge; it is not a production app element.

Production build succeeds with the existing dynamic-filesystem tracing warning from the
backup utility. Emitted trace manifests were checked and contained no private uploaded
sources, import files or support backups. Full verification results are in VERIFICATION.md.
