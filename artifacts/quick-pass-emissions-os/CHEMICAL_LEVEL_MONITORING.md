# Chemical Level Monitoring

## Implemented scope and device status

Open **Car Wash → Chemicals → Chemical Level Monitoring**. Actual Sensor Status is the default.
Demo Preview illustrates four 5-gallon containers at the owner-requested sample percentages;
it is client-only presentation, not saved inventory or sensor data. Synthetic tests are a separate
owner-authenticated workflow and history source. Neither can update actual readings, create
refill tasks/alerts, or establish hardware compatibility.

The receiver accepts a **Quick Pass app-owned normalized contract**, not a verified native
Proteus payload. There is no provider-specific parser, native-device login, sensor polling,
router forwarding, automatic subscription, bridge installation or new background worker.
**Direct authenticated HTTPS push from the exact Proteus L5 non-contact option remains
unresolved. No real device was available or received during this implementation.** Do not mark
it connected because registration, credential creation or a synthetic test succeeded.

Official sources reviewed October 21, 2026:

- [Proteus L5 product/options](https://proteussensor.com/wifi-water-level-sump-pump-sensor-with-audible-email-text-message-alerts.html)
  distinguishes the non-contact and laser options. It describes non-contact mounting outside
  compatible non-metallic containers, with a stated wall-thickness limit. Confirm the actual
  soap, container and mounting position with Proteus; product claims are not a site test.
- [Official Home Assistant integration](https://proteussensor.com/blog/proteus-wifi-sensor-integration-with-home-assistant.html)
  describes local status polling and a webhook approach, including a periodic-report example
  and alarm/reset delivery. It does not establish this exact unit's ability to attach the
  required Bearer header or securely deliver this app contract to a public HTTPS host.
- [Official third-party webhook guide](https://proteussensor.com/blog/connecting-3rd-party-services-to-a-proteus-sensor.html)
  describes cloud alarm/reset URL triggers. A URL trigger alone is insufficient for this
  receiver's authentication and normalized body. Its URL-secret example is not adopted here.

Search-indexed official documentation was accessible; direct article fetches returned HTTP 403.
No support representative or physical device confirmed the remaining transport requirements.

## Owner setup

1. Preserve the persistent DATABASE_URL and follow DATA_PERSISTENCE.md. Apply additive migration
   `202610210001_chemical_level_monitoring` with the guarded normal startup/migration command.
   Builds do not migrate or seed business data. Existing inventory and task history are retained.
2. Reuse a registered Analytics station and its explicit station grants. If none exists, the
   panel can register the existing configured `GA_STATION_ID` under an owner-provided name,
   using the current station-registration service; this does not connect Google or a device.
3. Create/select a real existing chemical. Register the sensor's name, station, chemical,
   container-size **label** and optional location. Registration creates/reuses the owner's
   operational responsibility profile so existing management tasks have an assignee; it does
   not grant employee access or configure pay. Owners configure/edit/deactivate sensors and
   credentials. Active managers may read stations explicitly granted to them. No worker login
   or approval layer is introduced.
4. Set reading validity (default 1,440 minutes). This is the app's freshness policy, not a
   sensor measurement. Leave periodic-report expectations blank unless the actual transport
   has been verified/configured to report periodically. Quiet alert-only sensors are not
   declared offline. A configured interval marks messages overdue after twice that interval;
   it is a communication expectation, not evidence of physical failure.
5. Generate a per-sensor credential. Copy it privately from its one-time display. The application
   stores only its SHA-256 hash; the 32 random bytes supply entropy. Rotation/revocation immediately
   invalidates prior tokens. Deactivation revokes all active tokens and closes open attention,
   preserving observations, incidents and events. Mapping after a real message requires a new
   registration so history cannot be reassigned to another chemical/station.
6. Use **Send synthetic test** to verify protected panel/test-history behavior. It requires a
   current owner session and same-origin request. Test events are visibly SYNTHETIC and never
   call the public receiver or change live status, tasks, alerts or stock.

**Deployment has not occurred. Endpoint placeholder:**

```text
https://YOUR-QUICK-PASS-HOST/api/integrations/proteus/events
```

Replace this with the actual deployed HTTPS host only after deployment and verify the route is
reachable. BETTER_AUTH_URL identifies the app's login origin, not proof that this endpoint has
been deployed. No extra integration API secret or sensor password belongs in a client bundle.

## Native transport acceptance and bridge requirements

Before connecting hardware, obtain the exact base-unit model/firmware and non-contact option.
Confirm with current Proteus documentation/support and a real test:

- Whether delivery originates from the unit or cloud, its HTTPS/TLS support, request method,
  actual body, authentication/header capabilities, event identifiers, timestamps/timezone,
  duplicates/retry behavior, alarm polarity, restore delivery and explicit fault semantics.
- Which values specifically mean liquid below versus above the sensing point on that option.
  A generic alarm bit is not translated to Low without verified polarity. Loss of network or
  silence is not automatically an explicit sensor fault.
- Whether periodic reporting is actually available and enabled. The Quick Pass default makes
  no heartbeat assumption. An old guide for another model is not verification of this unit.

If native delivery cannot securely send the required header/body, a **separately selected and
verified bridge** is required. No bridge/hardware/subscription is silently installed or purchased.
A bridge must authenticate its own inbound source, map documented source semantics, preserve
stable event identity and trustworthy observation time, and send outbound HTTPS POST to Quick
Pass with the per-device credential in the Authorization header. It must protect credentials
and implement the retry rules below. A previously installed local Home Assistant or another
operator-selected service might serve this purpose only after its exact source security and
payload are verified. There is no implemented native adapter or guaranteed bridge compatibility.
The physical sensor need not be exposed publicly or have a router port forwarded.

After choosing/configuring a verified path, mount the sensing point, physically lower liquid
past it and inspect a real Low event; restore liquid past it and verify Above threshold. Record
the actual source timestamps, payload and physical behavior privately. Verify one task/warning,
recovery, credential rotation and silence/periodic behavior. Only that test can verify the real
hardware path. If the native device lacks reliable ordering evidence, the bridge must report a
real current observation; do not re-label delayed notifications with a fabricated observation time.

## Quick Pass normalized HTTP contract, version 1

```http
POST /api/integrations/proteus/events
Content-Type: application/json
Authorization: Bearer <one-time-per-device-credential>
```

```json
{
  "schemaVersion": 1,
  "sensorId": "REGISTERED_SENSOR_ID",
  "eventId": "unique-source-event-id",
  "state": "LOW",
  "observedAt": "2026-10-21T18:30:00-04:00"
}
```

This JSON is **not** a claim about Proteus firmware. Fields are strictly validated; extra fields,
percentages, gallons and synthetic flags are rejected. Body size is limited to 8 KB by actual
streamed bytes as well as declared Content-Length. No credentials or data are accepted in query
strings. Bearer tokens must never be pasted into URLs, logs, screenshots, event descriptions or
committed examples. No application logs print headers or tokens.

- `schemaVersion`: exactly `1`; `sensorId`: registered sensor identity.
- `state`: `LOW`, `ABOVE_THRESHOLD`, `UNKNOWN`, `FAULT`, or `HEARTBEAT`. Only an explicit FAULT
  produces a fault state. Optional `fault` is descriptive text (maximum 500 characters) and
  is allowed only for FAULT.
- `eventId`: optional source identifier, 1–160 letters/digits/period/underscore/colon/hyphen.
  Reuse it for retries. If supplied, changing its payload is a conflict, not a correction.
- `observedAt`: optional ISO timestamp with UTC/explicit offset. Server receipt is stored
  separately. Equivalent offsets normalize to the same deduplication hash. A timestamp more
  than 60 seconds ahead is rejected. Configure a trustworthy clock on any bridge.

Without an event ID, a hash of state/normalized timestamp/fault deduplicates identical content.
Without both ID and timestamp, identical repeated content cannot prove a new observation. Such
messages do not become new readings or reset freshness merely by being replayed. An initial
untimed report may establish state with its receipt time disclosed; later untimed state changes
are retained as UNORDERED and cannot overwrite accepted state or reopen a manually refilled
incident. A genuinely newer timestamp is required. Delayed/equal timestamps are retained but
never overwrite newer observations or a manual-refill/deactivation fence. Initially stale reports
are retained as STALE without creating current attention. HEARTBEAT never changes liquid state.

Response behavior:

| Status          | Meaning                                                                                       | Sender action                                                                              |
| --------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 200             | Applied or already stored duplicate; response includes event ID/disposition                   | Acknowledge; no retry needed                                                               |
| 202             | Stored without current-state change, e.g. STALE, OUT_OF_ORDER, UNORDERED, COMMUNICATION_ONLY  | Acknowledge; inspect ordering/classification when necessary                                |
| 400/413/415/422 | Invalid URL/body/size/content type/event contract or future timestamp                         | Correct the request; do not repeatedly retry unchanged invalid data                        |
| 401             | Invalid/revoked credential, wrong/unknown sensor, inactive sensor or inactive mapped chemical | Stop; owner must check activation/mapping/token                                            |
| 409             | Reused event identity with conflicting data                                                   | Stop and investigate; do not create a new ID to bypass conflict detection                  |
| 429             | Persistent global 600/minute or per-device 60/minute budget exceeded                          | Respect Retry-After (60 seconds), then retry the same event ID with bounded backoff/jitter |
| 503             | Receiver/database temporarily unavailable                                                     | Respect Retry-After (60 seconds) and retry the same ID with bounded backoff/jitter         |

Credentials and event application are checked under database locks. Global/per-device rate
budgets survive restarts, and bad credentials/payloads cannot roll back an already charged
budget. Duplicate retries are idempotent. No raw provider payload is guessed or passed through.
The public machine endpoint does not use browser cookies. Owner setup/actions use current
server-authenticated roles, explicit station scope, same-origin checks and no-store responses.

## Alerts, tasks, recovery and manual refill

A current valid Low opens one persistent incident, one existing management refill task, and one
in-app notification for each active authorized management recipient. Owners receive station
alerts; managers need the station grant. A unique open-incident constraint plus shared task/sensor
locks prevents concurrent or repeated Low reports from creating duplicate open attention.
The warning is deliberately **not** resolved by ordinary task completion/acknowledgement.

A newer valid Above threshold closes the low warning and records SENSOR_RESTORED. An unfinished
refill task is cancelled with a recovery note, not falsely marked manually completed. A task
already completed manually retains that history. Unknown/fault reports do not establish recovery.

**Record Refilled** is an owner report. It closes attention and completes any unfinished refill
task with owner provenance, while leaving last sensor state/observation unchanged. It writes no
measured stock movement, percentage, gallon estimate, consumption or financial entry. A newer
observed Low can open a new incident/task. Late or unordered reports cannot undo the manual
refill. A current Low display may therefore coexist with “Owner-reported Refilled” until a newer
device report is accepted; those are intentionally different evidence sources.

Only in-app warnings are configured. Existing owner-summary email schedules and unrelated
notifications remain unchanged; no sensor email/text channel is enabled or claimed.

## Persistence and retention

Sensors are deactivated, not deleted. Normalized real events, manual actions, synthetic events,
incidents and hashed/revoked credentials persist in PostgreSQL across rebuilds using the same
DATABASE_URL. Event history is 15 per page, explicitly separated into Real ingestion, Synthetic
and Owner-reported sources; container lists are also 15 per page. Fault text is rendered as text.
Observation time, receipt time, historical state and communication freshness are separate.

The initial retention policy keeps operational/refill evidence for the sensor's lifetime,
including duplicate keys, to preserve audit and delayed-retry protection. There is no automatic
history deletion or retention worker. Rate counters overwrite a single minute bucket per sensor
and global receiver rather than accumulating request rows. Periodic transports may generate
more history; review persistent storage/backups before enabling a large reporting fleet. A future
explicit archival policy must preserve incident/task/manual provenance and deduplication keys;
this change does not erase old business data. Synthetic test history also remains separate and
is not promoted to real data after setup.

## Verification boundaries

Automated API/browser events are isolated fixtures, not real-device evidence. See VERIFICATION.md
for exact check results. The panel/backend and demo can be verified locally; native authenticated
Proteus transport, a real device event, container/soap suitability and deployment remain separate
external acceptance steps. No deployment is authorized by this implementation request.
