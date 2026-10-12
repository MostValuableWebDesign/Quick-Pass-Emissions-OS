import type { InspectionCadence } from "@/modules/station/dashboard-types";

export function PerformancePaceEvidence({ pace }: { pace: InspectionCadence }) {
  return (
    <small>
      {pace.includedGaps} gaps used · {pace.excludedLongGaps} excluded long gap
      {pace.excludedLongGaps === 1 ? "" : "s"} · {pace.excludedOvernightGaps} overnight excluded
    </small>
  );
}
