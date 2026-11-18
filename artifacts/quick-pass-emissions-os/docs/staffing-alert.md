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

Run the existing `pnpm --filter @workspace/quick-pass-emissions-os run jobs`
command every minute in an independent scheduler with the same persistent
database and the project's required runtime configuration, including Gmail
connector access and station source credentials.
Alternatively, an independent runner may POST the published `/api/jobs` endpoint
using the existing protected jobs authentication. Configure its secret through
Replit Secrets, never a URL parameter.

Verify a recorded scheduled check in the settings page before relying on alerts.
Publish/setup remains an owner action; no live email was sent during development.
