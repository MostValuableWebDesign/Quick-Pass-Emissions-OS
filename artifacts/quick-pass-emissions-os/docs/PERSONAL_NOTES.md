# Personal Notes & Tasks

Open **Overview → Notes & Tasks**. The current Owner or Manager login is reused.
Every query and change checks the account's current management access and scopes
records to that account. There is no sharing or employee assignment workflow.

## Notes and tasks

Notes autosave to PostgreSQL after a short pause. The editor shows Edited, Saving,
Saved, or an explicit failure. Concurrent changes use record versions; a conflict
keeps local edits until the user chooses the saved version or deliberately keeps
their own edits. Saved notes survive refresh, sign-out, and device changes.
Unsaved edits still require a successful network save.

Folders, search, checklists, pinning, archive, and Recently Deleted are supported.
Deleting a note is reversible; there is no automatic purge. Linked task records
remain available if their source note is archived or moved to Recently Deleted.
Converting the same note or checklist item reuses its existing task.

Tasks may have optional dates, descriptions, priorities, and accomplishment notes.
Checking a task records a server completion timestamp; reopening clears its
current completion timestamp but preserves its activity history.

## Summaries and scheduling

Manual summaries accept inclusive Eastern calendar dates, not future dates.
Each account/date range has one saved snapshot. Deliberately generating the same
range refreshes that snapshot instead of creating duplicates. Source edits alone
do not rewrite past summaries. Copy and Print / PDF are available.

Reports count a task once per period even if it was completed multiple times.
Reopenings are separately identified. Unfinished priorities reconstruct the
last recorded task state at the selected end date. No work hours, unrecorded work,
or inferred accomplishments are added.

The first reporting date starts a fourteen-day inclusive period. The independent
job runner generates a summary only after that entire period has ended, then
advances its database cursor by fourteen days. Catch-up is bounded to 26 periods
per invocation, and unique account/date-range constraints prevent duplicates.
If a manual snapshot was made before its last reporting day ended, the automatic
runner finalizes it after that day closes so late-day completions are not missed.

The worker is integrated into the existing authenticated `POST /api/jobs` and
`pnpm --filter @workspace/quick-pass-emissions-os jobs` runner. A page visit
does not run it. Enable the personal schedule after choosing its first date.
An external scheduler must independently invoke the existing jobs runner,
normally every five minutes as described in the app README. No new scheduler
or external delivery was provisioned by adding this feature.

The UI reports automatic generation inactive when no recent worker check-in is
observed. A recent check-in is evidence of a run within fifteen minutes, not proof
of future execution. Manual generation works regardless of scheduler setup.

## Verification

- `tests/personal-rules.test.ts`: Eastern date boundaries, fourteen-day windows,
  unique task counts, reopening, accomplishment annotations, historical cutoff.
- `scripts/personal-workspace-verify.ts`: uses only uniquely identified synthetic
  accounts to verify real persistence, account isolation, stale edits, conversion
  deduplication, completion/reopening, summary deduplication, and delete/restore.
  `cleanup` removes only its owned records and private browser handoff files.
- Browser verification covers the connected autosave/task/restore/report journey.
