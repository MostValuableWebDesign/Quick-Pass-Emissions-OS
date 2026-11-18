# 2 PM low-volume staffing alert

Configure under Automation → Reminder policies → 2 PM staffing alert.
Only an active owner may configure their own recipient and enable the alert.
Saving an enabled policy authorizes the recurring email to that recipient.
The account receives the in-app notification.

- Local `America/New_York` 2 PM, following daylight saving time.
- Configured business operating weekdays, excluding explicit closures.
- Paid Pass/Fail tests using Performance's existing $20 revenue basis, excluding
  free retests and aborts. This is the report's paid-test estimate, not proof of cash collection.
- Inclusive threshold: 50 or fewer.
- Uses the existing bounded station export and cooldown controls.
- Requires a post-2 PM snapshot at most five minutes old, complete report and
  retest lookback coverage. Missing data is not zero.
- Independent runner may retry checks until 2:15 PM; no late recommendation after
  that window. Counts include only source test minutes through 2:00 PM, filtered
  before the normal free-retest calculation. Unknown test times block the check.
  The message includes its actual check time.
- One unique notification per account/day claims delivery before Gmail is called.
  An ambiguous/failed email is not automatically retried. Inspect Gmail Sent
  before any manual recovery.
- Text and phone are unavailable until a supported provider is connected.
- Does not contact Clinton, adjust schedules, or change payroll.

## Required unattended setup

This project was not published when the feature was added. The code does not
create a deployment or an external schedule. Workspace Run and an open app tab
are not an unattended scheduling guarantee.

Create a separate **Scheduled deployment**, leaving the web deployment unchanged.
Use the same business database, stored alert policy and Gmail connection:

| Setting | Value |
| --- | --- |
| Build command | `pnpm --filter @workspace/quick-pass-emissions-os run staffing:build` |
| Run command | `pnpm --filter @workspace/quick-pass-emissions-os run staffing:check` |
| Cron expression | `0-14 14 * * *` |
| Time zone | `America/New_York` |

This starts the dedicated check once per minute from 2:00 through 2:14 PM.
All weekdays are scheduled deliberately: configured operating days and explicit
closures are checked against the database at runtime, not duplicated into cron.
There is no all-day polling. A completed low-volume alert or above-threshold
result prevents further source retrieval for that owner/date.

Before activation, run
`pnpm --filter @workspace/quick-pass-emissions-os run staffing:setup-check`.
This checks database identity, open-day configuration, enabled recipient policy
and presence of station credentials without reading reports or sending emails.
It does **not** prove that Gmail is reachable or that a scheduled deployment is
active. Gmail sender verification is repeated by the actual email delivery.

The dedicated job does not invoke unrelated task generators, door access,
Google Analytics sync, other reminder emails or owner summaries. It exits after
one bounded check. Failed setup returns a nonzero process exit code. Runtime
outcomes remain in the protected alert status; unknown emails are never retried.

The existing authenticated `/api/jobs` endpoint still includes this check for
compatibility, but the dedicated scheduled command is preferred. Never point an
external runner at the workspace development URL or replace the web deployment
with a scheduled process.

Verify a recorded scheduled check in the settings page before relying on alerts.
Publish/setup remains an owner action; no live email was sent during development.
