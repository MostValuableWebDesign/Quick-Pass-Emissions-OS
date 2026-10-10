import { z } from "zod";
const num = z.number().nullable().optional();
const item = z.object({
  kind: z.string(),
  title: z.string(),
  href: z.string(),
  date: z.string(),
  amountCents: z.number().nullable(),
});
const inv = z.object({
  key: z.string(),
  name: z.string(),
  unit: z.string(),
  state: z.string(),
  balance: num,
  averageDailyUsage: num,
  estimatedDaysRemaining: num,
  depletionDate: z.string().nullable().optional(),
  threshold: z.number().nullable(),
  low: z.boolean(),
  coverageDays: z.number(),
  recordedConsumption: z.number(),
  observationStart: z.string(),
  observationEnd: z.string(),
  configured: z.boolean().optional(),
  limits: z.string().optional(),
  coverageStart: z.string().nullable().optional(),
  lastPhysicalCountDate: z.string().nullable().optional(),
  planningLeadDays: z.number().nullable().optional(),
});
const rowValue = z.union([z.string(), z.number(), z.null()]);
const report = z.object({
  dataset: z.string(),
  start: z.string(),
  end: z.string(),
  generatedAt: z.string(),
  semantics: z.string(),
  limits: z.string(),
  rows: z.array(z.record(z.string(), rowValue)),
  totals: z.record(z.string(), z.number()),
});
export const snapshotSchema = z.object({
  label: z.string(),
  generatedAt: z.string(),
  today: z.string(),
  timezone: z.string().optional(),
  scheduledOccurrence: z.string().optional(),
  items: z.array(item),
  inventory: z.array(inv),
  reports: z.array(report),
  schedule: z.object({
    frequency: z.string(),
    time: z.string(),
    weekday: z.number().nullable(),
    revision: z.number(),
    openDaysOnly: z.boolean(),
  }),
  reportingBoundaries: z.object({ start: z.string(), endExclusive: z.string() }),
  limits: z.string().optional(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export function parseSnapshot(raw: unknown) {
  return snapshotSchema.safeParse(raw);
}
