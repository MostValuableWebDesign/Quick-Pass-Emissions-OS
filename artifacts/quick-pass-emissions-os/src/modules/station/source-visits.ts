import { Prisma } from "@prisma/client";
import { businessDate } from "@/lib/time";
import type { Tx } from "../phase2";
import { digest } from "./report";
import { reportedVin } from "./reported-vin";
import { reportMinute } from "./inspection-cadence";
import { columns, type RawInspection } from "./history/rules";
import { unseal } from "./history/crypto";
import type { RetentionVisit } from "./vehicle-retention";

type SourceVisit = Omit<RetentionVisit, "sourceUrl"> & {
  employeeId: string | null;
  provenance: string;
};
type EvidenceRow = Omit<SourceVisit, "minute"> & {
  sourceDate: string;
  identityPayload: string | null;
};
let saved: { key: string; version: string; expires: number; visits: SourceVisit[] } | undefined;

/**
 * Call only inside an authorized station/history transaction. The bounded,
 * generation-checked cache retains hashes, never decrypted reports or full VINs.
 * Recover reported identifiers from existing encrypted evidence so a new export
 * or a rewrite of business history is not required.
 */
export async function sourceVisits(tx: Tx, hashes: string[]) {
  const today = businessDate();
  const generation = await tx.auditLog.aggregate({ _count: true, _max: { createdAt: true } });
  const version = `${generation._count}:${generation._max.createdAt?.toISOString() ?? ""}`;
  const key = JSON.stringify([[...hashes].sort(), today]);
  if (saved?.key === key && saved.version === version && saved.expires > Date.now())
    return saved.visits;
  const rows = await tx.$queryRaw<EvidenceRow[]>`
    SELECT r.id, r."employeeId", v.fingerprint AS key, e.source, e."sourceId",
      e."businessDate" AS date, v.inspector, v.outcome, e."vinHash", e."plateHash",
      e."invalidVin", e."identityStatus", v."vehicleSuffix" AS suffix,
      e.payment, e.retest, e.completion, e."sourceKind", v."sourceDate", e.provenance,
      CASE WHEN e."vinHash" IS NULL THEN e.payload ELSE NULL END AS "identityPayload"
    FROM "StationInspectionEvidence" e
    JOIN "StationRecord" r ON r.id = e."recordId"
      AND r."currentRevisionId" = e."revisionId" AND r.state <> 'SUPERSEDED'
    JOIN "StationRevision" v ON v.id = e."revisionId"
    WHERE e."stationHash" IN (${Prisma.join(hashes)}) AND e."sourceKind" = 'VIR'
      AND e."businessDate" <= ${today}
    ORDER BY e."businessDate", r.id`;
  const visits = rows.map(({ identityPayload, sourceDate, ...row }) => {
    if (!row.vinHash && identityPayload) {
      try {
        const evidence = unseal<{ original: RawInspection }>(
          identityPayload,
          `inspection:${row.id}`,
        );
        const vin =
          evidence.original.extraction?.confidence === "UNCERTAIN"
            ? null
            : reportedVin(columns(evidence.original.fields).vin);
        if (vin) {
          row.vinHash = digest(vin);
          row.suffix = vin.slice(-4);
          row.identityStatus = "REPORTED_VIN";
        }
      } catch {
        // Keep the known inspection counted, but expose an identity-review
        // status rather than guessing a VIN or failing the entire dashboard.
        row.identityStatus = "NEEDS_REVIEW";
      }
    }
    return { ...row, minute: reportMinute(sourceDate) };
  });
  saved = { key, version, expires: Date.now() + 5 * 60_000, visits };
  return visits;
}
