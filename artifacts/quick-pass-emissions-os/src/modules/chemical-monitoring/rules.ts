import { createHash } from "node:crypto";
import { z } from "zod";
import { id, requiredInteger } from "@/lib/validation";
export const levelStates = ["LOW", "ABOVE_THRESHOLD", "UNKNOWN", "FAULT", "HEARTBEAT"] as const;
export const normalizedEvent = z
  .object({
    schemaVersion: z.literal(1),
    sensorId: id,
    eventId: z
      .string()
      .regex(/^[A-Za-z0-9._:-]{1,160}$/)
      .optional(),
    state: z.enum(levelStates),
    observedAt: z.string().datetime({ offset: true }).optional(),
    fault: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine((e) => e.state === "FAULT" || !e.fault, "Fault details require an explicit FAULT state.");
export const sensorInput = z
  .object({
    id: id.optional(),
    version: requiredInteger(0, 2147483647).default(0),
    name: z.string().trim().min(1).max(100),
    stationId: id,
    chemicalId: id,
    containerSize: z.string().trim().min(1).max(80),
    locationNote: z.string().trim().max(300).default(""),
    active: z.boolean().default(true),
    staleAfterMinutes: requiredInteger(5, 43200).default(1440),
    heartbeatMinutes: requiredInteger(1, 1440).nullable().default(null),
    periodicTransportVerified: z.boolean().default(false),
  })
  .strict()
  .refine(
    (s) => s.heartbeatMinutes === null || s.periodicTransportVerified,
    "Verify periodic transport before enabling heartbeat expectations.",
  );
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function eventIdentity(e: z.infer<typeof normalizedEvent>) {
  const payloadHash = hash(
    JSON.stringify([
      e.state,
      e.observedAt ? new Date(e.observedAt).toISOString() : null,
      e.fault || null,
    ]),
  );
  return { payloadHash, dedupeKey: e.eventId ? `id:${e.eventId}` : `content:${payloadHash}` };
}
export function ordering(
  sensor: {
    lastAppliedAt: Date | null;
    lastObservedAt: Date | null;
    stateFenceAt: Date | null;
    staleAfterMinutes: number;
  },
  observedAt: Date | null,
  now: Date,
) {
  if (observedAt && observedAt.getTime() > now.getTime() + 60000) return "FUTURE";
  if (!observedAt) return sensor.lastAppliedAt || sensor.stateFenceAt ? "UNORDERED" : "APPLIED";
  if (observedAt.getTime() < now.getTime() - sensor.staleAfterMinutes * 60000) return "STALE";
  const floor = Math.max(
    +(sensor.lastObservedAt || 0),
    +(sensor.stateFenceAt || 0),
    sensor.lastObservedAt ? 0 : +(sensor.lastAppliedAt || 0),
  );
  return +observedAt <= floor ? "OUT_OF_ORDER" : "APPLIED";
}
export function sensorDisplay(
  s: {
    lastState: string;
    lastAppliedAt: Date | null;
    lastObservedAt: Date | null;
    lastReceivedAt: Date | null;
    staleAfterMinutes: number;
    heartbeatMinutes: number | null;
  },
  now = new Date(),
) {
  const age = s.lastObservedAt || s.lastAppliedAt;
  return {
    level: !s.lastReceivedAt
      ? "Not connected"
      : !age || +now - +age > s.staleAfterMinutes * 60000
        ? "Unknown/stale"
        : {
            LOW: "Low",
            ABOVE_THRESHOLD: "Above threshold",
            FAULT: "Sensor fault",
            UNKNOWN: "Unknown/stale",
          }[s.lastState] || "Unknown/stale",
    communication: !s.lastReceivedAt
      ? "No real messages received"
      : !s.heartbeatMinutes
        ? "Event-driven · heartbeat not configured"
        : +now - +s.lastReceivedAt > s.heartbeatMinutes * 2 * 60000
          ? "Expected periodic message overdue"
          : "Within configured periodic-message window",
  };
}
