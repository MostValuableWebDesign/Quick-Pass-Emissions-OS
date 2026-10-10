---
name: Station portal access boundaries
description: Owner-triggered portal counts are authorized; identity, payroll and unattended automation remain separate evidence boundaries.
---

The user authorized efficient read-only, owner-triggered portal lookup: “you might have to scan or export which ever is effecient . its not a api.” This includes loading the current count on Performance view and date selection, as explicitly requested. Prefer the original export with a matching portal total; no unattended polling is authorized.

**Why:** Authorized read-only discovery established that an original report can be parsed, but its export omits identifiers present in on-page detail links and provides no payment evidence or timezone/cutoff guarantee. The export included more rows than the displayed first page; that observation is not a perpetual all-page guarantee.

**How to apply:** Read the station operating documentation before extending ingestion. Keep on-demand aggregate portal snapshots separate from reviewed test identities and payroll. Do not turn certificates, names or vehicle/time similarities into automatic identity, payment claims or complete live coverage. Unattended access still needs separate authorization and source guarantees; do not bypass challenges.

Range coverage is not evidence of an empty station day. The separately verified explicit, echoed single-date portal empty reply supports an aggregate Performance cache zero only; it does not authorize zero-count source completeness or payroll reconciliation. A historical nonempty report must never establish station-day zero through missing or moved records.

**Why:** A correction can move all records out of a date; renewed owner review of the original report does not prove that a later source query returned zero. Empty-array equality and universal predicates otherwise authorize an unsupported payroll replacement.

**How to apply:** Require affirmative nonempty station-day evidence for current report-based completeness and reconciliation. Keep supported employee zero counts on a nonempty, fully mapped station day distinct from unsupported station-wide zero totals.

Certificate purchasing is deliberately user-controlled: “I must control the entire purchase. The app should only take me to the ordering screen.”

**Why:** The user explicitly excluded automatic quantities, approvals, ordering, submission and payment. Successful portal login is not permission to expand this scope.

**How to apply:** Treat any future automated certificate purchase proposal as a new authorization decision, not an extension of manual station access or report-import permission.

The user wants manual purchasing within the app without app-imposed requests or second-person approval before using the provider. Optional reviewed bookkeeping is separate from that manual portal session.

**Why:** The user said there is too much validation around purchasing and that it should be manually controlled.

**How to apply:** The embedded portal must stay direct and cross-origin, with a browser fallback if embedding/cookies fail. Never proxy a payment page, share the server's authenticated cookies with the iframe, or handle the user's portal payment/login fields. Provider purchase rules still apply.

Provider sign-in should use a top-level browser tab; embedded viewing is optional and must not promise a working login.

**Why:** On 2026-10-10, the public Georgia purchasing redirect returned a login session cookie with explicit `SameSite=Lax`. That prevents its use inside a cross-site iframe and explained the user's failed embedded sign-in.

**How to apply:** Make direct provider navigation the primary sign-in path. Recheck the provider policy before claiming embedded login is supported; never rewrite its cookie policy or proxy the login/payment pages.

Certificate balance discovery uses exact station/analyzer membership and a bounded read-only operation. Report-import sessions must continue rejecting purchasing redirects.

**Why:** Broadening the report client's global URL allowlist for certificate reads weakened an existing safety boundary; a dedicated opt-in read context preserves it.

**How to apply:** Verify the analyzer belongs to the selected station, post only selection/validation state, and call only the provider's unused-count operation. Do not submit cart, receipt, quantity or payment controls.

Daily station counts must be accessible by choosing one date, without a separate range-mode choice.

**Why:** The user said, “i should be able to select a date and get the daily count.”

**How to apply:** Keep single-day lookup direct while retaining the source-evidence boundary: selecting a date authorizes the bounded on-view read, not unattended polling. Only the verified explicit source reply proves an aggregate zero.
