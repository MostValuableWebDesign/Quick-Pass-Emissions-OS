import { describe, it, expect } from "vitest";
import {
  normalizedEvent,
  eventIdentity,
  ordering,
  sensorDisplay,
  sensorInput,
} from "../src/modules/chemical-monitoring/rules";
import { boundedJson } from "../src/modules/chemical-monitoring/http";
const at = new Date("2026-10-21T16:00:00Z");
const sensor = {
  lastState: "LOW",
  lastAppliedAt: at,
  lastObservedAt: at,
  lastReceivedAt: at,
  stateFenceAt: null,
  staleAfterMinutes: 60,
  heartbeatMinutes: null,
};
describe("binary chemical monitoring contract", () => {
  it("rejects quantities, unknown properties, invalid fault detail and malformed dates", () => {
    const valid = {
      schemaVersion: 1,
      sensorId: "sensor",
      state: "LOW",
      observedAt: at.toISOString(),
    };
    expect(normalizedEvent.parse(valid)).toEqual(valid);
    for (const body of [
      { ...valid, percent: 10 },
      { ...valid, state: "FULL" },
      { ...valid, fault: "Bad" },
      { ...valid, observedAt: "yesterday" },
      { ...valid, synthetic: true },
    ])
      expect(normalizedEvent.safeParse(body).success).toBe(false);
    expect(
      normalizedEvent.safeParse({ ...valid, state: "FAULT", fault: "Explicit provider fault" })
        .success,
    ).toBe(true);
  });
  it("keeps equivalent timestamp representations idempotent without inventing an event ID", () => {
    const first = {
      schemaVersion: 1 as const,
      sensorId: "s",
      state: "LOW" as const,
      observedAt: "2026-10-21T12:00:00-04:00",
    };
    expect(eventIdentity(first)).toEqual(eventIdentity({ ...first, observedAt: at.toISOString() }));
    expect(eventIdentity({ ...first, eventId: "one" }).dedupeKey).toBe("id:one");
  });
  it("does not let equal, stale, future or unordered observations override accepted state", () => {
    expect(ordering(sensor, at, new Date(+at + 1000))).toBe("OUT_OF_ORDER");
    expect(ordering(sensor, new Date(+at + 1000), new Date(+at + 2000))).toBe("APPLIED");
    expect(ordering(sensor, new Date(+at + 120000), at)).toBe("FUTURE");
    expect(ordering(sensor, new Date(+at - 7200000), at)).toBe("STALE");
    expect(ordering(sensor, null, at)).toBe("UNORDERED");
    expect(ordering({ ...sensor, lastAppliedAt: null, lastObservedAt: null }, null, at)).toBe(
      "APPLIED",
    );
    expect(
      ordering(
        { ...sensor, stateFenceAt: new Date(+at + 5000) },
        new Date(+at + 4000),
        new Date(+at + 6000),
      ),
    ).toBe("OUT_OF_ORDER");
  });
  it("keeps level freshness separate from heartbeat expectations and never declares quiet sensors offline", () => {
    expect(sensorDisplay(sensor, new Date(+at + 1800000))).toEqual({
      level: "Low",
      communication: "Event-driven · heartbeat not configured",
    });
    expect(
      sensorDisplay({ ...sensor, lastReceivedAt: new Date(+at + 7200000) }, new Date(+at + 7200000))
        .level,
    ).toBe("Unknown/stale");
    expect(
      sensorDisplay({ ...sensor, heartbeatMinutes: 5 }, new Date(+at + 11 * 60000)).communication,
    ).toBe("Expected periodic message overdue");
    expect(sensorDisplay({ ...sensor, lastReceivedAt: null }).level).toBe("Not connected");
    expect(sensorDisplay({ ...sensor, lastState: "FAULT" }, at).level).toBe("Sensor fault");
  });
  it("requires affirmative verified periodic transport and explicit numeric settings", () => {
    const valid = { name: "Soap", chemicalId: "c", stationId: "s", containerSize: "5-gallon jug" };
    expect(sensorInput.parse(valid).heartbeatMinutes).toBeNull();
    expect(sensorInput.safeParse({ ...valid, heartbeatMinutes: 5 }).success).toBe(false);
    expect(
      sensorInput.safeParse({ ...valid, heartbeatMinutes: 5, periodicTransportVerified: true })
        .success,
    ).toBe(true);
    expect(sensorInput.safeParse({ ...valid, staleAfterMinutes: false }).success).toBe(false);
  });
  it("bounds actual streamed JSON bytes and rejects non-JSON bodies", async () => {
    await expect(
      boundedJson(new Request("https://example.test", { method: "POST", body: "x" })),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      boundedJson(
        new Request("https://example.test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      boundedJson(
        new Request("https://example.test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload: "x".repeat(9000) }),
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
});
