import { createHash } from "node:crypto";
import { z } from "zod";
import { sourceDirectory } from "../support/rules";
const text = z.string().trim().min(1).max(2000);
const label = z.string().trim().min(1).max(160);
const blankable = z.string().trim().max(2000);
const base = { key: label, section: label };
export const importInput = z
  .object({
    sourceName: label,
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    items: z
      .array(
        z.discriminatedUnion("entity", [
          z
            .object({
              ...base,
              entity: z.literal("VENDOR"),
              recordId: label.optional(),
              values: z
                .object({
                  name: label,
                  contact: z.string().trim().max(160),
                  phone: z.string().trim().max(50),
                  email: z.union([z.email().max(254), z.literal("")]),
                  services: text,
                  reference: z.string().trim().max(160),
                  notes: blankable,
                  directory: sourceDirectory.optional(),
                })
                .strict(),
            })
            .strict(),
          z
            .object({
              ...base,
              entity: z.literal("CHEMICAL"),
              recordId: label.optional(),
              values: z.object({ name: label, notes: blankable }).strict(),
            })
            .strict(),
          z
            .object({
              ...base,
              entity: z.literal("CERTIFICATES"),
              values: z.object({ minimumOrder: z.number().int().min(300).max(1000000) }).strict(),
            })
            .strict(),
          z
            .object({
              ...base,
              entity: z.literal("REVIEW"),
              values: z.object({ title: label, details: text, required: text }).strict(),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (v) => new Set(v.items.map((i) => i.key)).size === v.items.length,
    "Item keys must be unique.",
  );
export type ImportInput = z.infer<typeof importInput>;
export type Item = ImportInput["items"][number];
export type Outcome = "CREATED" | "UPDATED" | "UNCHANGED" | "CONFLICTED" | "SKIPPED";
export type PlannedItem = {
  key: string;
  section: string;
  entity: Item["entity"];
  outcome: Outcome;
  match: string | null;
  before: Record<string, unknown> | null;
  after?: Record<string, unknown>;
  appliedBy?: string;
  proposed: Record<string, unknown>;
  changes: Record<string, unknown>;
  snapshot: string;
  missing: string[];
  message: string;
};
export function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function fingerprint(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function counts(items: PlannedItem[]) {
  const result = { created: 0, updated: 0, unchanged: 0, conflicted: 0, skipped: 0 };
  for (const i of items) result[i.outcome.toLowerCase() as keyof typeof result]++;
  return result;
}
// Never treat zero/false as blank, and never replace a nonblank value from narrative.
export function compareFields(
  before: Record<string, unknown> | null,
  proposed: Record<string, unknown>,
) {
  const changes: Record<string, unknown> = {};
  const conflicts: string[] = [];
  for (const [field, value] of Object.entries(proposed)) {
    if (value === "" || value === null || value === undefined) continue;
    const old = before?.[field];
    if (old === null || old === undefined || old === "" || (Array.isArray(old) && old.length === 0))
      changes[field] = value;
    else if (canonical(old) !== canonical(value)) conflicts.push(field);
  }
  return { changes, conflicts };
}
// Stable contact/reference identifiers first; exact name only as a collision check.
// No fuzzy name matches, first-name matching or demo-account assumptions.
export function matchReference(item: Item, records: Record<string, unknown>[]) {
  if (item.entity === "REVIEW" || item.entity === "CERTIFICATES")
    return { record: null, conflict: false };
  const named = records.filter(
    (r) => String(r.name).trim().toLowerCase() === item.values.name.toLowerCase(),
  );
  if (item.recordId) {
    const exact = records.find((r) => r.id === item.recordId);
    return { record: exact ?? null, conflict: !exact || named.some((r) => r.id !== exact.id) };
  }
  const stable =
    item.entity === "VENDOR"
      ? records.filter(
          (r) =>
            (item.values.phone !== "" && r.phone === item.values.phone) ||
            (item.values.email !== "" &&
              String(r.email).toLowerCase() === item.values.email.toLowerCase()) ||
            (item.values.reference !== "" && r.reference === item.values.reference),
        )
      : named;
  const candidates = [...new Map([...named, ...stable].map((r) => [r.id, r])).values()];
  return {
    record: candidates.length === 1 ? candidates[0] : null,
    // Existing vendors need a stable identifier or explicit owner ID mapping.
    conflict:
      candidates.length > 1 ||
      (item.entity === "VENDOR" && named.length > 0 && stable.length === 0),
  };
}
