# Schlage door access

The selected hardware from the owner's discussion is **Schlage Encode Smart WiFi
Deadbolt BE489WB**. Security → Door access provides remote keypad code management
for owners and managers. Staff records have no app login. Camera viewing remains a
separate future Reolink page. This feature does not issue remote unlock commands.

Seam lists this lock's online codes and schedules as supported through Schlage Home:
[hardware support](https://www.seam.co/smartlocks/schlage_encode-smart-wifi-deadbolt).
Actual hardware, account provisioning and code behavior must still be verified on
these particular doors before relying on the integration.

## Connect the doors

1. Install and configure each BE489WB in Schlage Home with reliable Wi-Fi. Retain a
   physical key and test the existing lock independently.
2. Create a Seam workspace and connect the business Schlage Home account using the
   [Seam console](https://console.seam.co/). Authenticate there; never paste your
   Schlage password into Quick Pass.
3. Configure server secrets: `SEAM_API_KEY`, `SEAM_CONNECTED_ACCOUNT_ID` (the connected
   Schlage account UUID), and an independent `DOOR_CODE_HMAC_KEY` generated with
   `openssl rand -hex 32`. Keep the HMAC key stable across updates and include it in
   your private recovery plan. Changing it prevents existing code reconciliation;
   it does not revoke physical access. Never expose these as `NEXT_PUBLIC_` values.
4. Apply additive migration `202610120006_door_access` with the usual guarded startup
   migration. Preserve the business `DATABASE_URL`; builds never migrate or seed.
5. As an owner, open Security → Door access, enter the door name and its Seam device
   UUID, and select **Verify and register door**. Register both doors separately.
   Registration verifies account identity, managed status, BE489 model metadata,
   online-code capability and actual configured keypad-code lengths.
6. Keep the existing authenticated independent jobs runner active (`npm run jobs`
   or `POST /api/jobs` with `CRON_SECRET`). It reconciles one due door per trigger,
   at most 15 due codes per door, continuing fairly on later triggers. A five-minute
   schedule is suitable for routine checks; urgent removals need manual refresh
   and physical verification. Page visits and builds perform no provider requests.

No integration secrets were supplied or real doors contacted during development.
Tests clear inherited Seam credentials and use synthetic provider responses.

## Staff and temporary access

Select a current staff record or a temporary vendor/visitor window, enter a private
numeric code matching the lock's configured length, and submit. Do not put the
code in the access label. Temporary windows require a start and end in Eastern
time and last at most 30 days. DST follows the app's documented policy: spring
nonexistent times move forward; fall overlap uses the earlier instant.

The PIN is submitted over HTTPS to Seam and is never saved as plaintext or
recoverable ciphertext in Quick Pass. Only a keyed fingerprint, opaque provider
reference, attribution, schedule and confirmation history are persisted. The PIN
input clears after submission. Share it privately after confirmation; Quick Pass
cannot display it later. Code reuse on the same door is disallowed, including
historical codes. Seam/Schlage necessarily retain their own provider-side code data.

Owners register hardware and control privileged staff access. Managers can issue
and revoke ordinary staff and temporary access. Every mutation rechecks the active
actor and current target role after taking personnel and security locks. Queued removals recheck the current requesting actor and target before provider dispatch; lost authority requires owner review. A staff
removal atomically queues all assigned access for revocation; it does not imply
that an offline lock has removed it.

**Change code** is available for continuous active staff access on the current
15-item page. Its replacement is a separate retained request. The old code remains
until the replacement is confirmed active, then its removal is queued. During
this transition both codes may work. Revoking the original also revokes its queued
replacement. Temporary codes are revoked and reissued separately. Existing codes
created outside Quick Pass remain managed in Schlage Home/Seam; Quick Pass does
not silently adopt or remove them. Inspect and retire unwanted existing codes
there during initial setup.

## Confirmation and recovery

- **Pending confirmation**: request recorded; not confirmed active.
- **Active / Scheduled · provider-confirmed**: Seam reports the matching code set,
  or its future native schedule installed. A temporary code requires native
  scheduling confirmation. This is provider evidence, not independent physical proof.
- **Removal pending**: revocation saved or accepted; access may still work.
- **Removed · provider-confirmed**: a complete provider list no longer contains the
  code and Seam reports the matching `access_code.removed_from_device` event at
  or after the revocation request or the authorized scheduled expiry, whichever is earlier. API acceptance, local expiry, missing entries
  alone, and offline status never establish removal.
- **Needs review**: timeout, conflicting external edits, provider warnings/errors,
  unknown code state or absent confirmation. Inspect Seam and verify the door.
- **Cancelled before submission**: Quick Pass never attempted the create request.

Manual refresh and jobs share a 15-second per-door cooldown, a bounded network
and transaction deadline, and durable per-code cursors. Network failures are
sanitized, recorded on the door and counted in job results. Last checked time is
shown explicitly; cached status can be stale. No codes appear as confirmed removed
merely because the API returned success.

Creation has a durable one-attempt marker written before the external call.
An interrupted or ambiguous create is **never automatically resubmitted**: no
unsupported provider idempotency guarantee is assumed. Refresh reconciles its
exact opaque reference, fingerprint, device and time window. If still unconfirmed,
inspect the request in Seam before issuing new access. Revoke an unresolved request
and keep checking for a late-arriving provider code. An unknown create with no
provider ID cannot be certified removed automatically; physical/provider review
is required. Independent status checks do not issue new codes.

Changes and requests persist in PostgreSQL through builds/restarts. Access codes
and change history each have 15 items per page. Keep normal full database backups,
server secrets and the same provider account; do not reset or reseed production.

## Verification before live use

Local tests cover persistence, permission races, duplicate submission, ambiguous
creation recovery, replacement ordering, staff removal, temporary schedules,
provider event matching, stale edits, pagination, and credential isolation. Browser
checks cover unconfigured owner/manager setup, responsive navigation, and rejection
of anonymous/legacy sessions. A separate synthetic connected browser run covers
registration, issue, replacement, confirmed removal, PIN clearing, and saved history
for owners/managers; run `E2E_DOOR_CONNECTED_ONLY=1 npm run test:e2e`. Its isolated
Node preload intercepts only Seam requests and cannot run outside a runner-owned
test database. The production adapter keeps its fixed origin. Run `E2E_DOOR_ACCESS_ONLY=1 npm run test:e2e` for those
browser checks. They do not claim real-provider or hardware verification.

On each real door, test a new noncritical code at the keypad after provider
confirmation, change it and verify the old code stops working, revoke it and verify
removal, test timed access at both boundaries, and disconnect/reconnect Wi-Fi to
verify pending states. Review Seam subscription/account requirements separately.
