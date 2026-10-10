# Service & Support

## Operational use and permissions

Open **Carwash & Maintenance → Service & Support** (`/vendors`). It is the existing
Vendor register, not a parallel supplier database. OWNER/ADMIN maintain verified primary
contacts, directory metadata, category preferences, target associations and active status.
EMPLOYEE has an explicit operational contact projection; BOOKKEEPER remains excluded.
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

The employee SQL projection excludes legacy verification/business references, services
narrative and notes as well as the new account reference. Managers enter employee-safe
supported services/instructions separately. Do not put account identifiers or financial
terms in operational fields. Employees do not receive physical-target association details,
equipment notes/serials, finance/cost fields, audit history or other users' contact narratives.

## Maintenance, equipment and history

Manager equipment/bay views link to their configured support providers without widening
record access or replacing the legacy primary equipment vendor. Any authorized employee
may associate an active verified vendor with their own report/current assigned ticket using
the dedicated **Associate provider only** operation after reporting it. This strict input
cannot set assignees, cost, deadlines, review rights, progress or repair status. Terminal
tickets remain closed. Ordinary work submission and manager review are unchanged.

Contact entries are user-initiated and explicitly self-reported. Time includes an explicit
offset; actor identity comes from the server. Method, optional ticket/equipment, outcome,
reference and follow-up date persist in separate append-only application history. Every
related ticket/equipment is authorized and mismatched targets are refused. Employees can
log general provider contacts or contacts related to their permitted tickets; direct
equipment association needs a permitted matching ticket. Management can select equipment.
Employee history is self-only; related ticket access is rechecked on every read. Manager
history includes all entries. Narrative is not copied into ordinary audit summaries.
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

The only business contact evidence found is the uploaded **Operations & Responsibilities
Guide**, including its final correction. The directory/import/navigation uploads are
feature instructions, not independent contact evidence.

| Provider / item    | Source-backed operational enrichment                                                   | Boundaries                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| OPUS TECH          | Analyzer support, supplied phone, immediate-call instruction                           | No named contact or verification date; supplied tech identifier is manager-only                  |
| Pit Pro            | Chris, supplied phone, drain-pit service and as-needed scheduling instruction          | No cleaning cadence, preferred choice or physical pit assignment                                 |
| The Advanced Group | Adam or Lamar, supplied main phone, wash equipment, chemicals and storage motors/pumps | No guessed primary/alternate personal numbers or equipment IDs                                   |
| KleenRite          | Supplied phone, wash-parts category/instructions                                       | Final correction limits it to parts; customer identifier is manager-only                         |
| Termayne           | Camera/security concern and incomplete name retained in owner review                   | Not invented as a confirmed business provider; no contact method supplied                        |
| Robert             | Belt-repair responsibility retained in owner review                                    | Incomplete identity; retail/Amazon belts are purchase exceptions, not verified service providers |

After storage pin verification and private pre-migration backup, the additive support
migration applied to the existing development-preview database. A fresh protected source
preview found no matching providers or conflicts in that target. Backup-gated application
created **4 unconfirmed Vendor records**, updated **0**, left **0** unchanged, conflicted
**0**, and saved **2 review-only items** in owner-only import history. A second preview
reported **4 unchanged**, **2 skipped/review-only**, **0 created/updated/conflicted**.
No production data/application or deployment was performed.

Phone/contact/instruction/category values were actually saved, not merely staged.
The supplied tech/customer references were saved only in restricted account-reference
fields. Camera/security and belt repair categories are available; personal identities
remain review-only. Verification/confirmation dates, emails, websites, individual alternate
numbers, extensions, hours, emergency contacts, preferences and physical equipment/bay
assignments remain blank/unconfigured. No service ticket, purchase, contact log, balance,
schedule or repair completion was created by the source import.

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
and equipment association, employee payload exclusions, manual history persisted across
reload, narrow maintenance provider changes, archive/history preservation, bookkeeper
exclusion and missing-contact states. 390px employee detail/directory views fit without
horizontal overflow and keyboard filter focus worked. No real contact link was activated.
The reviewed captures contain Next's development badge; it is not a production app element.

Production build succeeds with the existing dynamic-filesystem tracing warning from the
backup utility. Emitted trace manifests were checked and contained no private uploaded
sources, import files or support backups. Full verification results are in VERIFICATION.md.
