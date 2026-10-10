import { Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { checkStorage } from "@/lib/storage";
import { audit, requireRule, type Tx } from "../phase2";
import { saveVendorInTransaction } from "../maintenance/service";
import { saveChemicalInTransaction } from "../chemicals/service";
import {
  importInput,
  fingerprint,
  canonical,
  compareFields,
  matchReference,
  counts,
  type ImportInput,
  type PlannedItem,
} from "./rules";
export type Preview = {
  id: string;
  actorId: string;
  storeId: string;
  input: ImportInput;
  items: PlannedItem[];
  counts: ReturnType<typeof counts>;
  expires: number;
};
async function authorized(tx: Tx, actorId: string) {
  const actor = await tx.user.findUnique({ where: { id: actorId } });
  requireRule(actor?.active && actor.role === "OWNER", "Active owner access is required.");
}
export async function plan(tx: Tx, input: ImportInput): Promise<PlannedItem[]> {
  const [vendors, chemicals, settings, previous] = await Promise.all([
    tx.vendor.findMany(),
    tx.chemicalItem.findMany(),
    tx.certificateSetting.findUnique({ where: { id: "certificates" } }),
    tx.businessImport.findUnique({ where: { id: fingerprint(input) } }),
  ]);
  const prior = previous ? (previous.items as unknown as PlannedItem[]) : [];
  const items: PlannedItem[] = [];
  for (const item of input.items) {
    const records = item.entity === "VENDOR" ? vendors : chemicals;
    const applied = prior.find(
      (p) => p.key === item.key && ["CREATED", "UPDATED", "UNCHANGED"].includes(p.outcome),
    );
    // Retained provenance is a stable import-to-record identity, including references
    // with no external phone/account identifier. Never rematch a previously applied item.
    const matched =
      applied && item.entity !== "CERTIFICATES" && item.entity !== "REVIEW"
        ? { record: records.find((r) => r.id === applied.match) ?? null, conflict: false }
        : matchReference(item, records);
    const before: Record<string, unknown> | null =
      item.entity === "CERTIFICATES" ? settings : matched.record;
    const proposed: Record<string, unknown> = { ...item.values };
    if (item.entity === "VENDOR") {
      delete proposed.directory;
      Object.assign(proposed, item.values.directory ?? {});
    }
    const { changes, conflicts } = compareFields(before, proposed);
    const sourceDuplicate = input.items.some((other) => {
      if (other.key === item.key || other.entity !== item.entity) return false;
      if (item.entity === "CERTIFICATES") return true;
      if (item.entity === "REVIEW" || other.entity === "REVIEW" || other.entity === "CERTIFICATES")
        return false;
      if (other.values.name.toLowerCase() === item.values.name.toLowerCase()) return true;
      return (
        item.entity === "VENDOR" &&
        other.entity === "VENDOR" &&
        ((!!item.values.phone && item.values.phone === other.values.phone) ||
          (!!item.values.reference && item.values.reference === other.values.reference) ||
          (!!item.values.email &&
            item.values.email.toLowerCase() === other.values.email.toLowerCase()))
      );
    });
    const duplicate =
      sourceDuplicate ||
      items.some(
        (p) =>
          p.entity === item.entity &&
          (matched.record
            ? p.match === String(matched.record.id)
            : "name" in item.values &&
              String(p.proposed.name).toLowerCase() === item.values.name.toLowerCase()),
      );
    const missing =
      item.entity === "VENDOR"
        ? [
            ...(!before?.verifiedDate ? ["Independent contact verification date"] : []),
            ...(!before?.contact && !item.values.contact
              ? ["Confirmed contact person / department"]
              : []),
          ]
        : item.entity === "CHEMICAL"
          ? [
              ...(!before?.unit ? ["Measurement unit"] : []),
              ...(before?.balance == null ? ["Physical opening count"] : []),
              ...(before?.reorderPoint == null ? ["Reorder threshold"] : []),
              ...(!before?.vendorId ? ["Verified supplier assignment"] : []),
            ]
          : item.entity === "CERTIFICATES"
            ? [
                "Physical stock (verify independently in certificate ledger)",
                ...(settings?.reorderPoint == null ? ["Reorder threshold"] : []),
                ...(settings?.leadDays == null ? ["Lead days"] : []),
                ...(settings?.windowDays == null ? ["Observation window"] : []),
              ]
            : [item.values.required];
    items.push({
      key: item.key,
      section: item.section,
      entity: item.entity,
      match: before ? String(before.id) : null,
      before,
      proposed,
      changes,
      snapshot: fingerprint(before),
      missing,
      outcome: applied
        ? canonical(before) === canonical(applied.after ?? applied.before)
          ? "UNCHANGED"
          : "CONFLICTED"
        : item.entity === "REVIEW"
          ? "SKIPPED"
          : matched.conflict || duplicate || conflicts.length
            ? "CONFLICTED"
            : !before
              ? "CREATED"
              : Object.keys(changes).length
                ? "UPDATED"
                : "UNCHANGED",
      message: applied
        ? canonical(before) === canonical(applied.after ?? applied.before)
          ? "Already applied; no writes repeated."
          : "Record changed after import; staff edits preserved."
        : item.entity === "REVIEW"
          ? item.values.details
          : matched.conflict || duplicate
            ? "Ambiguous/duplicate identity. Supply an explicit owner-confirmed record ID."
            : conflicts.length
              ? `Nonblank fields preserved: ${conflicts.join(", ")}.`
              : "Reference configuration only; no transactions, verification, assignments or balances inferred.",
    });
  }
  return items;
}
export async function previewImport(actorId: string, raw: unknown): Promise<Preview> {
  const input = importInput.parse(raw);
  return db.$transaction(async (tx) => {
    await authorized(tx, actorId);
    const store = await checkStorage(db, process.env.EXPECTED_DATABASE_ID);
    const items = await plan(tx, input);
    return {
      id: fingerprint(input),
      actorId,
      storeId: store!.instanceId,
      input,
      items,
      counts: counts(items),
      expires: Date.now() + 30 * 60 * 1000,
    };
  });
}
function signature(payload: string) {
  requireRule(process.env.BETTER_AUTH_SECRET, "Server signing configuration is missing.");
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(payload).digest("hex");
}
export function sealPreview(preview: Preview) {
  const payload = Buffer.from(JSON.stringify(preview)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function openPreview(token: string): Preview {
  requireRule(token.length < 1000000, "Preview is too large.");
  const [payload, supplied, extra] = token.split(".");
  requireRule(payload && supplied && !extra && /^[a-f0-9]{64}$/.test(supplied), "Invalid preview.");
  requireRule(
    timingSafeEqual(Buffer.from(signature(payload)), Buffer.from(supplied)),
    "Preview was changed. Run a new dry run.",
  );
  const preview = JSON.parse(Buffer.from(payload, "base64url").toString()) as Preview;
  importInput.parse(preview.input);
  requireRule(preview.expires > Date.now(), "Preview expired. Run a new dry run.");
  return preview;
}
// Operator CLI and authenticated web action use this same boundary. The required backup
// callback executes BEFORE the write transaction; failures cannot claim success.
export async function applyImport(actorId: string, reviewed: Preview, backup: () => Promise<void>) {
  requireRule(
    actorId === reviewed.actorId && reviewed.expires > Date.now(),
    "Run a fresh owner dry run.",
  );
  const input = importInput.parse(reviewed.input);
  requireRule(reviewed.id === fingerprint(input), "Import identity changed.");
  await db.$transaction((tx) => authorized(tx, actorId));
  const store = await checkStorage(db, process.env.EXPECTED_DATABASE_ID);
  requireRule(
    store?.instanceId === reviewed.storeId,
    "Database identity changed. Nothing was applied.",
  );
  await backup();
  return db.$transaction(
    async (tx) => {
      // Same global order as station/personnel/ledger services. Concurrent staff
      // edits cannot race the snapshot comparison or mutation.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183503)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183504)`;
      await authorized(tx, actorId);
      const identity = await tx.dataStore.findUnique({ where: { id: "business" } });
      requireRule(identity?.instanceId === reviewed.storeId, "Database identity changed.");
      const old = await tx.businessImport.findUnique({ where: { id: reviewed.id } });
      const items = await plan(tx, input);
      const prior = old ? (old.items as unknown as PlannedItem[]) : [];
      if (old) {
        for (const item of items) {
          const applied = prior.find((i) => i.key === item.key);
          if (applied && ["CREATED", "UPDATED", "UNCHANGED"].includes(applied.outcome)) {
            item.outcome =
              canonical(item.before) === canonical(applied.after ?? applied.before)
                ? "UNCHANGED"
                : "CONFLICTED";
            item.message =
              item.outcome === "UNCHANGED"
                ? "Already applied; no writes repeated."
                : "Record changed after import; staff edits preserved.";
          }
        }
      }
      for (const item of items) {
        const applied = prior.find((i) => i.key === item.key);
        if (applied && ["CREATED", "UPDATED", "UNCHANGED"].includes(applied.outcome)) continue;
        const expected = reviewed.items.find((i) => i.key === item.key);
        if (!expected || expected.snapshot !== item.snapshot || expected.outcome !== item.outcome) {
          item.outcome = "CONFLICTED";
          item.message = "Record or match changed since dry run; run a new preview.";
        }
        if (!["CREATED", "UPDATED"].includes(item.outcome)) continue;
        const why = `Reviewed import ${reviewed.id}; section ${item.section}`;
        const fields = item.before ? { ...item.before, ...item.changes } : item.proposed;
        if (item.entity === "VENDOR") {
          const row = await saveVendorInTransaction(tx, actorId, {
            ...fields,
            id: item.match,
            version: item.before?.version ?? 0,
            verifiedDate: item.before?.verifiedDate ?? null,
            active: item.before?.active ?? true,
            reason: why,
          });
          const source = input.items.find((i) => i.key === item.key);
          if (source?.entity === "VENDOR" && source.values.directory) {
            const directoryChanges = Object.fromEntries(
              Object.keys(source.values.directory)
                .filter((key) => key in item.changes)
                .map((key) => [key, item.changes[key]]),
            );
            if (Object.keys(directoryChanges).length) {
              const enriched = await tx.vendor.update({
                where: { id: row.id },
                data: directoryChanges,
              });
              await audit(tx, actorId, "SUPPORT_SOURCE_ENRICHED", row.id, {
                sourceFingerprint: input.sourceFingerprint,
                section: item.section,
                fields: Object.keys(directoryChanges),
              });
              item.after = enriched;
            }
          }
          item.match = row.id;
          item.after ??= row;
        } else if (item.entity === "CHEMICAL") {
          const row = await saveChemicalInTransaction(tx, actorId, {
            ...fields,
            id: item.match,
            version: item.before?.version ?? 0,
            unit: item.before?.unit ?? null,
            reorderPoint: item.before?.reorderPoint ?? null,
            vendorId: item.before?.vendorId ?? null,
            active: item.before?.active ?? true,
            reason: why,
          });
          item.match = row.id;
          item.after = row;
        } else if (item.entity === "CERTIFICATES") {
          const minimumOrder = Number(fields.minimumOrder);
          const row = await tx.certificateSetting.upsert({
            where: { id: "certificates" },
            create: { minimumOrder },
            update: { minimumOrder },
          });
          await audit(tx, actorId, "CERTIFICATE_SETTINGS", row.id, {
            before: item.before as Prisma.InputJsonValue,
            after: { minimumOrder },
            reason: why,
          });
          item.match = row.id;
          item.after = row;
        }
        item.appliedBy = actorId;
      }
      const result = counts(items);
      const retained = items.map((item) => {
        const applied = prior.find((i) => i.key === item.key);
        return applied && ["CREATED", "UPDATED", "UNCHANGED"].includes(applied.outcome)
          ? applied
          : item;
      });
      const data = {
        id: reviewed.id,
        sourceName: input.sourceName,
        sourceFingerprint: input.sourceFingerprint,
        actorId,
        storeId: reviewed.storeId,
        items: JSON.parse(JSON.stringify(retained)) as Prisma.InputJsonValue,
        counts: counts(retained),
      };
      await tx.businessImport.upsert({
        where: { id: reviewed.id },
        create: data,
        update: { items: data.items, counts: data.counts },
      });
      // Private manifest is owner-only; ordinary manager audit shows fixed metadata only.
      await audit(tx, actorId, "BUSINESS_IMPORT_APPLIED", reviewed.id, {
        counts: result,
        sourceFingerprint: input.sourceFingerprint,
      });
      return { id: reviewed.id, items, counts: result, repeated: !!old };
    },
    {
      timeout: 30000,
      maxWait: 10000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
}
export async function importHistory(actorId: string) {
  await db.$transaction((tx) => authorized(tx, actorId));
  return db.businessImport.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
}
