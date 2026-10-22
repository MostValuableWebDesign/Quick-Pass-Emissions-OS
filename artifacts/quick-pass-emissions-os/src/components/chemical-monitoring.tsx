"use client";
import { useState } from "react";
import type { MonitoringView } from "@/modules/chemical-monitoring/service";
import { ChemicalContainer, chemicalDemo } from "./chemical-level-graphic";
import "./chemical-monitoring.css";
const stamp = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("en-US", {
        timeZone: "America/New_York",
        dateStyle: "medium",
        timeStyle: "short",
      }) + " Eastern"
    : "Not available";
type Sensor = MonitoringView["sensors"][number];
function SensorForm({
  sensor,
  data,
  busy,
  act,
}: {
  sensor?: Sensor;
  data: MonitoringView;
  busy: boolean;
  act: (command: string, extra?: Record<string, unknown>) => Promise<boolean>;
}) {
  return (
    <form
      className="cm-form"
      aria-label={sensor ? `Edit ${sensor.name}` : "Register sensor"}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget),
          form = e.currentTarget;
        const saved = await act("SAVE", {
          input: {
            ...(sensor ? { id: sensor.id } : {}),
            version: sensor?.version || 0,
            name: f.get("name"),
            stationId: f.get("stationId"),
            chemicalId: f.get("chemicalId"),
            containerSize: f.get("containerSize"),
            locationNote: f.get("locationNote"),
            active: f.get("active") === "on",
            staleAfterMinutes: f.get("staleAfterMinutes"),
            heartbeatMinutes: f.get("heartbeatMinutes") === "" ? null : f.get("heartbeatMinutes"),
            periodicTransportVerified: f.get("periodicTransportVerified") === "on",
          },
        });
        if (saved && !sensor) form.reset();
      }}
    >
      <label>
        Sensor name
        <input name="name" maxLength={100} defaultValue={sensor?.name} required />
      </label>
      <label>
        Station
        <select name="stationId" defaultValue={sensor?.stationId || data.stations[0]?.id} required>
          {data.stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Chemical
        <select name="chemicalId" defaultValue={sensor?.chemicalId} required>
          <option value="">Choose an existing chemical</option>
          {data.chemicals.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Container size · label only
        <input
          name="containerSize"
          placeholder="e.g. 5-gallon container"
          maxLength={80}
          defaultValue={sensor?.containerSize}
          required
        />
      </label>
      <label>
        Location note
        <input name="locationNote" maxLength={300} defaultValue={sensor?.locationNote} />
      </label>
      <label>
        Reading validity · minutes
        <input
          type="number"
          name="staleAfterMinutes"
          min={5}
          max={43200}
          defaultValue={sensor?.staleAfterMinutes || 1440}
          required
        />
      </label>
      <details className="cm-full">
        <summary>Optional periodic-report expectations</summary>
        <p className="muted">
          Leave blank for alert-only reporting. Configure only after confirming the transport sends
          periodic messages. This is an app setting, not a claim about L5 firmware.
        </p>
        <label>
          Expected interval · minutes
          <input
            type="number"
            name="heartbeatMinutes"
            min={1}
            max={1440}
            defaultValue={sensor?.heartbeatMinutes || ""}
          />
        </label>
        <label className="cm-check">
          <input
            type="checkbox"
            name="periodicTransportVerified"
            defaultChecked={!!sensor?.heartbeatMinutes}
          />
          Periodic transport has been verified and configured
        </label>
      </details>
      <label className="cm-check">
        <input type="checkbox" name="active" defaultChecked={sensor?.active ?? true} />
        Active
      </label>
      <button
        className="button button-primary"
        disabled={busy || !data.stations.length || !data.chemicals.length}
      >
        {sensor ? "Save sensor changes" : "Register sensor"}
      </button>
      {sensor?.lastReceivedAt && (
        <p className="muted cm-full">
          Mapping changes require a new sensor registration after deactivating this one; existing
          evidence stays linked to its original chemical/station.
        </p>
      )}
    </form>
  );
}
export function ChemicalMonitoring({
  initial,
  endpoint,
}: {
  initial: MonitoringView;
  endpoint: string;
}) {
  const [data, setData] = useState(initial),
    [mode, setMode] = useState<"actual" | "demo">("actual");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [credential, setCredential] = useState<{ sensorId: string; token: string } | null>(null);
  async function act(command: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage("");
    setCredential(null);
    try {
      const res = await fetch("/api/chemical-monitoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command,
          query: { ...data.query, sensorPage: data.sensorPage },
          ...extra,
        }),
      });
      if (res.redirected || !res.headers.get("content-type")?.includes("application/json"))
        throw new Error("Sign in again to manage chemical sensors.");
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || "Request failed.");
      setData(result.data);
      if (result.token) setCredential({ sensorId: String(extra.sensorId), token: result.token });
      if (command === "TEST")
        setMessage(
          "Synthetic test saved separately. Actual sensor status, tasks and alerts were not changed.",
        );
      if (command === "REFILLED")
        setMessage(
          "Owner-reported refill recorded. Last sensor observation retained; inventory quantities unchanged.",
        );
      if (command === "SAVE") setMessage("Sensor settings saved.");
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to save. Refresh and retry.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="chemical-level-monitoring"
      className="cm-workspace"
      aria-label="Chemical Level Monitoring"
    >
      <div className="cm-heading">
        <div>
          <p className="eyebrow">CARWASH · CONTAINER MONITORING</p>
          <h2>Chemical Level Monitoring</h2>
          <p className="muted">Single-point detection. Chemical stock records remain separate.</p>
        </div>
        <button className="button button-outline" disabled={busy} onClick={() => void act("LIST")}>
          Refresh sensor status
        </button>
      </div>
      <div className="cm-mode" role="group" aria-label="Monitoring display mode">
        <button
          className="button"
          aria-pressed={mode === "actual"}
          onClick={() => {
            setMode("actual");
            setCredential(null);
          }}
        >
          Actual Sensor Status
        </button>
        <button
          className="button"
          aria-pressed={mode === "demo"}
          onClick={() => {
            setMode("demo");
            setCredential(null);
          }}
        >
          Demo Preview
        </button>
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {mode === "demo" ? (
        <>
          <p className="cm-demo-banner" role="status">
            <strong>Demo preview — sample levels, no live sensors connected</strong>
            <br />
            Design illustration only. These four sample containers are separate from actual
            registered sensors. No inventory, alerts, tasks or sensor history are changed.
          </p>
          <div className="cm-grid">
            {chemicalDemo.map((d) => (
              <article className="card cm-container-card" key={d.name}>
                <div className="cm-container-heading">
                  <h3>{d.name}</h3>
                  <span className="cm-demo-tag">DEMO</span>
                </div>
                <ChemicalContainer name={d.name} demoPercent={d.percent} />
                <strong className="cm-demo-value">
                  {d.percent}% <small>sample level</small>
                </strong>
                <p className={d.percent <= 20 ? "cm-low" : d.percent < 50 ? "cm-watch" : "cm-good"}>
                  {d.status}
                </p>
                <small className="muted">Illustrated 5-gallon container</small>
              </article>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="notice">
            Proteus L5 transport compatibility is unresolved. A registration or synthetic test does
            not verify hardware. Actual readings show only Above threshold, Low, Unknown/stale or
            Sensor fault, never percentages or gallons remaining.
          </p>
          {!data.sensors.length && (
            <div className="card card-body">
              <h3>No sensors in this authorized scope</h3>
              <p>
                Register a sensor below. Until a real authenticated event is received, its status
                stays Not connected.
              </p>
            </div>
          )}
          <div className="cm-grid">
            {data.sensors.map((s) => (
              <article
                className="card cm-container-card"
                key={s.id}
                id={`sensor-${s.id}`}
                aria-label={`Sensor ${s.name}`}
              >
                <div className="cm-container-heading">
                  <h3>{s.name}</h3>
                  <span className="cm-demo-tag">{s.active ? "ACTUAL" : "INACTIVE"}</span>
                </div>
                <p>
                  {s.chemical.name} · {s.containerSize}
                </p>
                <small className="muted">
                  {s.station.name}
                  {s.locationNote ? ` · ${s.locationNote}` : ""}
                </small>
                <ChemicalContainer name={s.name} state={s.display.level} />
                <strong
                  className={
                    s.display.level === "Low" || s.display.level === "Sensor fault"
                      ? "cm-low"
                      : s.display.level === "Above threshold"
                        ? "cm-good"
                        : ""
                  }
                >
                  {s.display.level}
                </strong>
                <p className="muted">{s.display.communication}</p>
                <dl className="cm-times">
                  <dt>Last reported level</dt>
                  <dd>{s.lastReceivedAt ? s.lastState.replaceAll("_", " ") : "No real report"}</dd>
                  <dt>Observed</dt>
                  <dd>{stamp(s.lastObservedAt)}</dd>
                  <dt>Last message received</dt>
                  <dd>{stamp(s.lastReceivedAt)}</dd>
                </dl>
                {s.manualRefilledAt && (
                  <p className="notice">
                    Owner-reported Refilled · {stamp(s.manualRefilledAt)}. Not a device recovery
                    reading.
                  </p>
                )}
                {!!s.incidents.length && (
                  <div className="notice warning">
                    <strong>Low-level attention is open</strong>
                    <p>Manual task completion does not establish device recovery.</p>
                    {s.incidents[0].taskId && (
                      <a className="text-link" href={`/tasks/${s.incidents[0].taskId}`}>
                        Open refill task
                      </a>
                    )}
                  </div>
                )}
                {data.owner && (
                  <>
                    <div className="cm-actions">
                      <button
                        className="button button-outline"
                        disabled={busy || !s.active}
                        onClick={() => void act("REFILLED", { sensorId: s.id })}
                      >
                        Record Refilled
                      </button>
                      <button
                        className="button button-outline"
                        disabled={busy}
                        onClick={() =>
                          void act("LIST", { query: { sensorId: s.id, page: 1, source: "LIVE" } })
                        }
                      >
                        View events
                      </button>
                    </div>
                    <details key={s.version}>
                      <summary>Edit sensor</summary>
                      <SensorForm sensor={s} data={data} busy={busy} act={act} />
                    </details>
                    <details>
                      <summary>Connection setup &amp; tests</summary>
                      <p className="muted">
                        Sensor identity: <code>{s.id}</code>. Credentials are for the Quick Pass
                        normalized receiver; native Proteus delivery is not verified.
                      </p>
                      <p>
                        {s.credentials.length
                          ? "An active receiver credential exists. This does not mean Connected."
                          : "No active receiver credential."}
                      </p>
                      <div className="cm-actions">
                        <button
                          className="button button-outline"
                          disabled={busy || !s.active}
                          onClick={() => void act("ROTATE", { sensorId: s.id })}
                        >
                          {s.credentials.length ? "Rotate credential" : "Generate credential"}
                        </button>
                        <button
                          className="button button-outline"
                          disabled={busy || !s.credentials.length}
                          onClick={() => void act("REVOKE", { sensorId: s.id })}
                        >
                          Revoke credential
                        </button>
                      </div>
                      <form
                        className="cm-test-form"
                        aria-label={`Synthetic test ${s.name}`}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void act("TEST", {
                            input: {
                              schemaVersion: 1,
                              sensorId: s.id,
                              state: f.get("state"),
                              eventId: `synthetic-${Date.now()}`,
                              observedAt: new Date().toISOString(),
                            },
                          });
                        }}
                      >
                        <label>
                          Synthetic state
                          <select name="state">
                            <option value="LOW">Low</option>
                            <option value="ABOVE_THRESHOLD">Above threshold</option>
                            <option value="FAULT">Fault</option>
                            <option value="UNKNOWN">Unknown</option>
                          </select>
                        </label>
                        <button className="button button-outline" disabled={busy}>
                          Send synthetic test
                        </button>
                      </form>
                      <p className="muted">
                        Tests are stored only in Synthetic history. They never update actual
                        readings or create refill tasks/warnings.
                      </p>
                    </details>
                  </>
                )}
                {credential?.sensorId === s.id && (
                  <aside className="notice warning" role="status">
                    <label>
                      Receiver credential · shown once
                      <textarea
                        aria-label="Receiver credential shown once"
                        readOnly
                        autoComplete="off"
                        value={credential.token}
                      />
                    </label>
                    <p>
                      Store privately. It disappears on the next action or reload. Use only in an
                      Authorization header.
                    </p>
                    <button className="button button-outline" onClick={() => setCredential(null)}>
                      Hide credential
                    </button>
                  </aside>
                )}
              </article>
            ))}
          </div>
          <div className="cm-actions">
            <button
              className="button button-outline"
              disabled={busy || data.sensorPage <= 1}
              onClick={() =>
                void act("LIST", { query: { ...data.query, sensorPage: data.sensorPage - 1 } })
              }
            >
              Previous containers
            </button>
            <span>
              Containers page {data.sensorPage} of {data.sensorPages} · 15 per page
            </span>
            <button
              className="button button-outline"
              disabled={busy || data.sensorPage >= data.sensorPages}
              onClick={() =>
                void act("LIST", { query: { ...data.query, sensorPage: data.sensorPage + 1 } })
              }
            >
              Next containers
            </button>
          </div>
          {data.owner && (
            <details className="card card-body">
              <summary>Register a sensor</summary>
              {!data.chemicals.length && (
                <p>Add an existing chemical in the inventory section below first.</p>
              )}
              {!data.stations.length && (
                <form
                  className="cm-form"
                  aria-label="Register monitoring station"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act("STATION", {
                      input: { name: f.get("name"), timezoneConfirmed: true },
                    });
                  }}
                >
                  <p className="cm-full">
                    Reuse the configured station identity and shared Analytics station permissions.
                    This requires the existing GA_STATION_ID server setting.
                  </p>
                  <label>
                    Station name
                    <input name="name" required maxLength={100} />
                  </label>
                  <button className="button button-outline" disabled={busy}>
                    Register configured station
                  </button>
                </form>
              )}
              <SensorForm data={data} busy={busy} act={act} />
            </details>
          )}
          <details className="card card-body">
            <summary>Receiver setup guide</summary>
            <p>
              <strong>
                Deployment status: endpoint URL is a placeholder until verified after deployment.
              </strong>
            </p>
            <code className="cm-endpoint">POST {endpoint}</code>
            <p>
              Quick Pass app-owned JSON contract; not a verified native Proteus payload. Use a
              verified bridge or transport that can send HTTPS POST with an Authorization: Bearer
              header. Never put a secret in a URL. No router forwarding or public access to the
              sensor is required.
            </p>
            <pre className="cm-contract">
              {JSON.stringify(
                {
                  schemaVersion: 1,
                  sensorId: "REGISTERED_SENSOR_ID",
                  eventId: "unique-source-event-id",
                  state: "LOW",
                  observedAt: "2026-10-21T18:30:00-04:00",
                },
                null,
                2,
              )}
            </pre>
            <p>
              Supported states: LOW, ABOVE_THRESHOLD, UNKNOWN, FAULT, HEARTBEAT. State is binary
              evidence, not a quantity. Observation timestamps should represent an actual
              observation; missing ordering evidence can prevent later state changes or reopening
              after a refill.
            </p>
            <p>
              Compatibility and a real-device event remain unverified. Consult the repository guide{" "}
              <code>CHEMICAL_LEVEL_MONITORING.md</code> before connecting hardware. Only in-app
              alerts are enabled.
            </p>
          </details>
          <section className="card card-body" aria-label="Chemical sensor event history">
            <div className="cm-heading">
              <h3>Event history</h3>
              <label>
                Event source
                <select
                  value={data.query.source}
                  disabled={busy}
                  onChange={(e) =>
                    void act("LIST", { query: { ...data.query, page: 1, source: e.target.value } })
                  }
                >
                  <option value="LIVE">Real ingestion</option>
                  <option value="SYNTHETIC">Synthetic tests · isolated</option>
                  <option value="MANUAL">Owner-reported actions</option>
                </select>
              </label>
            </div>
            {data.query.source === "SYNTHETIC" && (
              <p className="notice warning">
                Synthetic tests — no live status, task, inventory or warning changes.
              </p>
            )}
            {data.query.sensorId && (
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() => void act("LIST", { query: { page: 1, source: data.query.source } })}
              >
                Show all sensor events
              </button>
            )}
            <div className="cm-events">
              {data.events.map((e) => (
                <article key={e.id}>
                  <strong>
                    {e.sensor.name} · {e.state.replaceAll("_", " ")}
                  </strong>
                  <span className="cm-demo-tag">{e.source}</span>
                  <p>
                    {e.disposition.replaceAll("_", " ")}
                    {e.fault ? ` · ${e.fault}` : ""}
                  </p>
                  <small>
                    Observed: {stamp(e.observedAt)}
                    <br />
                    Received: {stamp(e.receivedAt)}
                  </small>
                </article>
              ))}
              {!data.events.length && (
                <p className="muted">No events in this source/sensor scope.</p>
              )}
            </div>
            <div className="cm-actions">
              <button
                className="button button-outline"
                disabled={busy || data.page <= 1}
                onClick={() => void act("LIST", { query: { ...data.query, page: data.page - 1 } })}
              >
                Previous events
              </button>
              <span>
                Events page {data.page} of {data.pages} · {data.total} records · 15 per page
              </span>
              <button
                className="button button-outline"
                disabled={busy || data.page >= data.pages}
                onClick={() => void act("LIST", { query: { ...data.query, page: data.page + 1 } })}
              >
                Next events
              </button>
            </div>
          </section>
          <p className="muted">
            Status as of {stamp(data.serverTime)}. Reading validity is an app policy. A quiet
            alert-only sensor is not declared offline. Operational event and refill history are
            retained; no automatic deletion runs.
          </p>
        </>
      )}
    </section>
  );
}
