# Google Business Profile Analytics

Implemented locally for **Quick Pass Emissions & Tag Renewal**. This is an ongoing
OAuth/API integration, not a Google Analytics GA4, Ads, Places, scraping or browser-cookie
integration. No real Google authorization or API import is claimed by the synthetic tests.
Manual syncing only: Connect Google once → select/map a location → select the reporting
period → **Sync now** → updated reports. OAuth refresh remains server-side; no Google
password, browser cookie import, listing edits or published replies are used.

## Exact external setup

1. Use a Google Cloud project owned by the business. Request Business Profile Basic API
   Access for that project number with an email that manages the verified business.
   Google's current prerequisites require a verified profile active for at least 60 days
   and a business website listed on the profile. The inspected Google page displayed an
   “Add website” option; confirm this requirement before submitting the application.
   A zero API quota means approval is still needed; enabling an API alone is insufficient.
2. Enable the APIs used here: **My Business Account Management API**
   (`mybusinessaccountmanagement.googleapis.com`), **My Business Business Information API**
   (`mybusinessbusinessinformation.googleapis.com`), **Business Profile Performance API**
   (`businessprofileperformance.googleapis.com`), and approved **Google My Business API**
   (`mybusiness.googleapis.com`, v4 reviews). Follow Google's project-level activation
   prerequisites. Google Workspace administrators must also permit Business Profile.
3. Configure the Google Auth Platform consent screen for this business, support contact,
   authorized domain and published privacy policy. Create a **Web application** OAuth client.
   Request only `https://www.googleapis.com/auth/business.manage`: Google's reporting and
   review APIs require this scope; there is no narrower read scope documented for these
   endpoints. The application never calls listing-edit or review-reply write APIs.
4. Register the **exact** authorized redirect URI:
   `https://YOUR-QUICK-PASS-HOST/api/google-business/callback`.
   It is derived from the server's canonical `BETTER_AUTH_URL`; reverse proxies must preserve
   the existing secure auth origin configuration. Local development may register
   `http://localhost:3000/api/google-business/callback` (or the actual local port). HTTP public
   origins and credentials/paths/queries in the canonical origin are rejected.
5. Set server secrets `GOOGLE_BUSINESS_CLIENT_ID`, `GOOGLE_BUSINESS_CLIENT_SECRET`, and an
   independent stable `GOOGLE_BUSINESS_ENCRYPTION_KEY` from `openssl rand -hex 32`.
   Keep the same persistent `DATABASE_URL`, storage pin, auth secret and Google encryption
   key across releases. Never put tokens or secrets in `NEXT_PUBLIC_` variables.
6. Apply the additive migration through the existing guarded `db:migrate` release command.
   An owner registers the configured station in **Analytics → Station mapping & manager
   access**, confirming Eastern calendar dates. Connect Google, refresh authorized locations,
   and select the actual business location. No business is selected by name alone.
   Only the existing configured analyzer station can be registered in this release; other
   stations need source configuration before comparison. Each station/location has one mapping.
7. Grant managers explicit Analytics access to that station. Owners can read all Analytics
   stations; managers can connect Google but cannot map locations, grant permissions or
   record/review improvement actions. Employees and bookkeepers have no app access.
8. Select the mapped station/location and reporting dates, then click **Sync now**.
   It includes the displayed equal-length previous comparison period, full source months,
   monthly keywords and all available review pages. The selected report is 1–367 days;
   this is an application safety bound, **not a promise of Google's historical availability**.
   May 2026 and September 2026 shortcuts remain. Unsupported/omitted history stays unavailable.
9. The click creates one durable manual request, then the submit interaction advances one
   bounded, authenticated worker page per Server Action until every source finishes.
   There is no terminal command or `/api/jobs` call required from the owner. Keep the page
   open; after an interrupted interaction, **Resume sync** advances that same request.
   Closing the page preserves queued work. Page visits and filter changes perform no
   provider work. No new Google work is scheduled by browser timers.
10. Keep/provision the **existing** independent persistent worker for recovery, pagination
    and retries after a page is closed, and timely content expiry. POST `/api/jobs` every
    five minutes with `Authorization: Bearer <CRON_SECRET>`, or use the existing workspace
    `jobs` command on that schedule. It drains only explicitly requested manual Google
    work; **running a worker does not authorize automatic Google data collection**.
    Unrelated operations, owner email and door-access jobs retain their schedules. No
    persistent trigger is provisioned by this code. Monitor job failures and cache cleanup.

The exact callback for the current deployment is displayed in **Analytics → Google
Business Profile**, including when client credentials are still missing. Copy it verbatim
into Google Cloud; it is `<canonical BETTER_AUTH_URL origin>/api/google-business/callback`.
Configure each preview/production/local origin separately. The production hostname cannot
be inferred from a local checkout. If it is not displayed, set the canonical auth URL first.

Google's OAuth test publishing mode can expire refresh grants after seven days for this scope;
use the correct production/internal consent configuration and complete Google's verification
requirements as applicable. API approval, consent verification and profile verification are
separate steps. [OAuth lifecycle](https://developers.google.com/identity/protocols/oauth2),
[project prerequisites](https://developers.google.com/my-business/content/prereqs),
[basic setup](https://developers.google.com/my-business/content/basic-setup).

## Persistence, consent and security

OAuth initiation is a same-origin authenticated Server Action. State has 256 bits of entropy,
is hashed in PostgreSQL, bound to the current active manager/owner and an HttpOnly SameSite=Lax
browser cookie, expires after ten minutes and is consumed once before token exchange. S256 PKCE
adds an independently encrypted verifier. Reconnection/disconnection increments a generation,
invalidating pending attempts. Callback redirects remove query codes from the rendered report;
configure the ingress/proxy to **redact callback query strings** from access logs, tracing and
analytics. The app never logs callback codes or raw provider responses. No client secret or
access/refresh token is returned to the browser.

Tokens and raw source cache pages use AES-256-GCM with random nonces and record-specific
associated data. Refresh happens server-side. Incorrect encryption keys show a safe error;
restore the stable key or reconnect. Database administrators and backup operators remain trusted.
Disconnect erases local tokens, OAuth attempts and provider cache, disables mappings and requests
Google revocation. If remote revocation cannot be confirmed, remove the app in the Google Account
permissions screen too. Reconnection requires owner confirmation of authorized locations again.
Deactivation/demotion of the connecting management account stops synchronization and clears local
credentials on the next independent worker; every dispatch rechecks current authorization first.

Station reads, grants, mapping, OAuth and sync dispatch share personnel → existing domain locks →
station lock 7183507 → Analytics lock 7183509. Actor/grants are reread inside the transaction.
Fixed Google API origins, GET-only reporting, redirect rejection, eight-second individual requests,
a 25-second worker request budget and a 40-second transaction bound avoid arbitrary URLs or
unbounded external work. No request edits listings, advertising, reviews or published replies.

## Source content retention

Google's current API policy restricts cached content to temporary secure storage of at most
30 days and prohibits stored manipulation/aggregation. This implementation stores encrypted,
unaggregated response pages for **29 days**, identified by location, source, kind, month/cycle/page,
with fetch and expiry times. Derived totals, review themes, excerpts, hypotheses and reply drafts
are calculated only on read, never saved as Google snapshots. Business mappings, explicit station
grants, management-entered marketing observations and owner action/follow-up records are durable.
Builds/restarts do not erase these records.

The independent worker purges expired raw caches and discovery before checking API configuration.
Reads exclude expired content even if cleanup is delayed. Run the trigger at least daily even when
Google is disconnected; monitor it to keep physical deletion timely. Encrypted backups may contain
provider cache: set their retention to **less than 30 days**, protect the encryption key, and purge
expired source content before serving a restored environment. Long-term permanent Google archives
are not implemented. Historical months are refetched while Google still serves them.
[Google content-storage policy](https://developers.google.com/my-business/content/policies).

## Synchronization and historical boundaries

A unique location/kind/month task and one active request per location prevent duplicate
concurrent imports, including clicks after the shared cooldown expires. Manual requests
and discovery share a 60-second connection cooldown. A request records its actor, selected
reporting dates, request time, state and terminal time. Each provider page rechecks active
management access, explicit station grants, the mapping owner and the connection. An
independently committed two-minute claim lease excludes stale workers.

Each interactive Server Action processes at most one page (25-second provider budget);
the independent worker processes at most three pages per trigger. No provider work runs
inside page rendering. Pagination commits securely with source pages. A request is **queued**
before dispatch, **running** while pages remain, **successful** only when every requested
resource and final cursor succeeds, **partial** when some resources succeed and others fail,
or **failed** if none complete. Four attempts per failing page use 1/2/4-minute backoff.
429 responses also enforce shared connection backoff, respecting Retry-After up to 24 hours.
Revoked credentials stop remaining pages and request reconnection. Range/access/schema
failures stay visible with corrective instructions; retry with Sync now after correction.
Review/keyword requests fail visibly above 200 pages rather than claiming completeness.

Replacement pages stage separately. The last published usable cycle remains visible
through queueing, partial pagination, failed refreshes and reconnection-required errors,
with **its original fetched times**. A resource switches to its replacement only after its
final page succeeds. A first incomplete import may show partial pages but never claims
complete review/keyword coverage. Expired content remains unavailable regardless of prior
success. Charts, comparisons, themes and recommendations derive from displayed, unexpired
raw responses; no permanent Google aggregate archive is stored.

The UI separates selected reporting dates, latest request state/time, last **fully** successful
request, resource-level fetched times and per-source errors. Lists show at most 15 rows.
A successful API transport can still have missing/delayed metric dates; coverage labels
remain separate from queue success. Mixed-resource freshness is explicitly displayed.

Migration `202610120008_manual_google_sync` removes the obsolete daily cursor, retains
existing tokens/mappings/cache/business records, initializes published cache pointers and
cancels ambiguous legacy queued/running/retry tasks. It does not resume historical work
whose manual origin cannot be established. Only tasks linked to a new explicit manual
request can be claimed. Neither independent jobs nor page visits enqueue Google syncs.
Expired-content maintenance remains active and unrelated automation is unchanged.

Official Google help describes six months in the web performance interface. Current v1 method
references do not promise a numeric 18-month API retention window; legacy API examples are not a
current guarantee. May and September 2026 can be requested; actual available responses govern
coverage. Missing dates/unsupported periods remain unavailable. Searches are whole-month values,
can take five days to appear and may be threshold-suppressed. No proration or false zeros.
[Performance metrics API](https://developers.google.com/my-business/reference/performance/rpc/google.mybusiness.performance.v1),
[web history limits](https://support.google.com/business/answer/10018786),
[performance and search delay](https://support.google.com/business/answer/9918094).

## Reporting definitions and limits

- Daily source metrics: desktop/mobile Search/Maps impressions, call clicks, direction requests
  and website clicks. The four impression categories keep Google's individual daily deduplication
  semantics; they are not summed into a cross-platform unique audience. Deprecated conversations
  are not requested. Explicit numeric zero is retained; omitted values and absent dates are unknown.
  Recent five-day values are conservatively provisional even if returned.
- Monthly keywords preserve exact values versus “below threshold,” whole-month granularity and
  pagination completeness. A partial selected month never prorates keyword counts.
- Previous periods contain the same number of Eastern calendar days. Google percentage comparisons
  and decline recommendations require complete nonprovisional coverage on both sides. Zero prior
  values have no percentage. Decline rules require at least ten prior interactions and a 20% drop;
  displayed recommendations include supporting figures, dates, specific actions and causal limits.
- Quick Pass counts reuse cached test evidence and the existing 30-day VIN retest classifier.
  Passed/failed nonfree tests appear as paid inspections; aborted/other tests are separate. Prior
  30-day source coverage is required to classify retests; missing or provisional days are labeled.
  A paid-inspection classification is not proof that money was collected.
- There is no station-linked retail collections or actual refund register in existing business
  data. Those measures remain **unavailable**. Existing dealership receipts/reversals are shown
  separately to owners as **business-wide, unallocated** figures. A signed receipt reversal is
  not inferred to be a customer refund. No estimated revenue is described as collected revenue.
- Marketing observations are entered explicitly with date, station, channel, customer count,
  optional integer-cent cost, unique reference and evidence. They do not identify verified
  Google conversions or establish complete cost coverage. No ROI or conversion rates are computed.
- Owners can record actions, dates, measurable targets, planned review dates and subsequent
  outcomes. Follow-up records cannot be completed before their review date. Links open the
  subsequent performance period; source availability and causal limits still apply.

## Reviews and replies

Verified-location reviews use the official v4 paginated reviews API. Star rating, created/updated
Eastern dates, comment, reviewer attribution and existing business reply are shown. Keyword rules
count mentions of wait times, staff service, pricing, hours and tag renewal in selected/previous/older
periods, with representative excerpts and 1–2-star counts. Mentions can overlap and are not sentiment
or causation proof. These review findings are separate from performance recommendations.
Unanswered reviews get a generic draft for owner review. **No publish API or automatic reply exists**;
the owner can open Google, edit the draft and explicitly submit there. Historic comments use their
original date even if edited recently. Reviews not returned or expired are not inferred absent.
[Official review API](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list).

## Costs and verification

Google lists Business Profile API access as no charge for registered users. Quotas, approval,
consent/domain requirements and ongoing hosting/PostgreSQL/backups/job monitoring still apply;
any hosting or scheduler purchase is an owner decision. No paid AI service is required for the
initial deterministic rules or drafts. No new service was purchased or Google Cloud project created.
[Google pricing](https://developers.google.com/my-business/content/pricing).

Earlier read-only browser observation on October 12, 2026: the signed-in business Performance panel showed
May–October 2026 and separate Overview, Calls, Bookings, Directions and Website clicks tabs.
This observation did not authorize the API or populate application records. Live Google OAuth,
real data sync and deployment remain unverified until the setup above is completed and a real
permitted import succeeds. See VERIFICATION.md for automated check results.
