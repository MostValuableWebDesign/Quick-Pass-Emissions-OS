# Workspace navigation

Navigation is shared by desktop and mobile and filtered using the existing roles. OWNER is
the owner, ADMIN is a manager, BOOKKEEPER sees financial workflows, and EMPLOYEE sees their
operational workflows. Hidden links are not authorization: existing server guards still
check every page, action and export.

## Menu

| Group                 | Destinations                                                                    |
| --------------------- | ------------------------------------------------------------------------------- |
| Overview              | Dashboard; owner exceptions; reminders; notifications                           |
| Team & Tasks          | Tasks; schedule; task templates; employees                                      |
| Payroll               | Payroll & commissions                                                           |
| Inventory             | Certificates; chemicals                                                         |
| Carwash & Maintenance | Carwash & bays; maintenance tickets; preventative schedules; equipment; vendors |
| Dealerships & Billing | Dealerships; invoices & payments; detailing rentals; operational finance        |
| Reports               | Operational reports; finance reports; owner summary archive                     |
| Settings              | Owner automation; settings & audit; account & password; product roadmap         |

Empty groups are omitted. Employee and bookkeeper restrictions are unchanged. Distinct
modules are no longer hidden behind competing maintenance, finance or automation menus.
Related task-state filters and report/date controls remain within their pages.

## URLs, records and accessibility

Existing paths remain valid without redirects. Internal links use same-tab navigation.
One primary item is current, including nested lists and detail pages; breadcrumbs show the
business area and page. Browser titles identify the current page.

Record links carry a validated `from` query parameter containing their origin URL, including
search filters, selected dates and pagination. A detail page has one explicit return link.
Direct bookmarks without an origin return to their parent list. A bounded, role-checked
return chain preserves the filtered list when opening another related record. External
origins, authentication/API destinations, traversal and oversized return values are rejected.

On mobile, the drawer scrolls independently and supports keyboard focus containment,
Escape, backdrop dismissal and focus restoration. Controls expose their expanded state.
The desktop collapsed sidebar retains accessible link labels.

## Verification commands

From the workspace root:

```sh
pnpm --filter @workspace/quick-pass-emissions-os run typecheck
pnpm --filter @workspace/quick-pass-emissions-os run lint
pnpm --filter @workspace/quick-pass-emissions-os run format:check
pnpm --filter @workspace/quick-pass-emissions-os run build --webpack
pnpm --filter @workspace/quick-pass-emissions-os run test:isolated
E2E_DIRECT=1 pnpm --filter @workspace/quick-pass-emissions-os run test:e2e
```

The direct browser mode allocates a separate local port and uses only the runner-owned
disposable database, leaving the managed preview and its real sessions alone. Passwords
are posted privately outside browser snapshots. Cookie states and reports live in a
restricted temporary directory, with tracing/video disabled, and are removed afterward.

The browser suite expects nine passing checks with no skips: the existing public guard,
owner navigation and protected vendor persistence checks, four-role desktop/mobile
navigation and server denials, record/list context and browser history, and week/report
date navigation. The role checks also visit every allowed menu destination.
They reject streamed server errors on permitted destinations and verify explicit
permission errors or dashboard redirects on forbidden ones. Next can send those
denials in an HTTP 200 stream. The bookkeeper's legacy Tasks URL intentionally
remains a readable, empty view; its absence from the menu is not a new prohibition.

For one interactive verification pass, set `E2E_MANUAL_TEST=1` alongside `E2E_DIRECT=1`.
The runner prints only the private preview URL and fixture metadata path. Creating an
empty `run-tests` file in that private directory starts the same nine checks, then keeps
the server available for visual inspection until stopped. Never print the session files.
An incomplete manual run also retains the private server and report for diagnosis;
it remains a failed run and never counts missing or skipped checks as successful.

The shared-main station-history module adds owner-only Performance under Overview,
with setup and evidence detail routes. Its optional isolated browser checks remain
available with `E2E_STATION_HISTORY=1` (eleven total checks), or
`E2E_STATION_ONLY=1 E2E_STATION_HISTORY=1` for the single lifecycle check.
